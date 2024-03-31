import { APIResponseError, type Client } from '@notionhq/client'
import type { Bucket, Note, Readable, VendorEntity, VendorEntityId, VendorEntityQuery, VendorEntityType, Writable } from '../types.js'
import { createNotionPageVendorEntity } from './vendor-entity.js'
import { getVendorEntity, mergeVendorEntities } from '../vendor-entity.js'
import { noteToNotionPageProperties, notionPagesToNotes } from './serialization.js'
import { logger } from '../common/logger.js'
import type { QueryDatabaseResponse } from '@notionhq/client/build/src/api-endpoints.js'

const pageProperties = ['Name', 'Tags', 'Status', 'entity:telegram_message']

export class NotionIntegration implements Readable, Writable {
  constructor(private readonly notion: Client) {}

  async getAllNotes() {
    const response = await this.notion.databases.query({
      database_id: this.databaseId,
      archived: false,
    })

    logger.debug({ response }, 'Retrieved notes from the Notion database')

    return notionPagesToNotes(this.databaseId, response.results)
  }

  async getNoteByVendorEntity(vendorEntityQuery: VendorEntityQuery): Promise<Note | undefined> {
    const response = await this.notion.databases.query({
      database_id: this.databaseId,
      archived: false,
      page_size: 1,
      filter: {
        property: `entity:${vendorEntityQuery.type}`,
        rich_text: {
          starts_with: `${vendorEntityQuery.id}:`,
        },
      }
    })

    logger.debug({ vendorEntityQuery, response }, 'Retrieved page from the Notion database')

    return notionPagesToNotes(this.databaseId, response.results).at(0)
  }

  async storeNote(note: Note, retry = true): Promise<VendorEntity> {
    try {
      const vendorEntity = getVendorEntity(note.vendorEntities, 'notion_page')

      if (vendorEntity) {
        await this.notion.pages.update({
          page_id: vendorEntity.metadata.pageId,
          properties: noteToNotionPageProperties(note),
        })
        return vendorEntity
      }

      const page = await this.notion.pages.create({
        parent: { database_id: this.databaseId },
        properties: noteToNotionPageProperties(note),
      })

      return createNotionPageVendorEntity(this.databaseId, page)
    } catch (err) {
      logger.error({ err, note, retry }, 'Failed to store a note to the Notion database')

      if (retry && err instanceof APIResponseError && err.code === 'validation_error') {
        await this.setupNotionDatabase(err.message)
        return this.storeNote(note, false)
      }

      throw err
    }
  }

  async deleteNote(note: Note) {
    const vendorEntity = getVendorEntity(note.vendorEntities, 'notion_page')
    if (!vendorEntity) throw new Error('NotionPageVendorEntity not found')

    await this.notion.pages.update({
      page_id: vendorEntity.metadata.pageId,
      archived: true,
    })
  }

  private async setupNotionDatabase(notionErrorMessage: string | undefined | null) {
    const missingProperties = notionErrorMessage && pageProperties.some((property) => notionErrorMessage.includes(property))
      ? pageProperties.filter((property) => notionErrorMessage.includes(property))
      : pageProperties

    const properties: Parameters<Client['databases']['update']>[0]['properties'] = {}

    if (missingProperties.includes('Name')) {
      properties['Name'] = { type: 'title', title: {} }
    }

    if (missingProperties.includes('Tags')) {
      properties['Tags'] = { type: 'multi_select', multi_select: {} }
    }

    if (missingProperties.includes('Status')) {
      properties['Status'] = {
        type: 'select',
        select: {
          options: [
            { name: 'Not started', color: 'gray' },
            { name: 'In progress', color: 'yellow' },
            { name: 'Done', color: 'green' },
            { name: 'To delete', color: 'red' },
          ]
        },
      }
    }

    if (missingProperties.includes('entity:telegram_message')) {
      properties['entity:telegram_message'] = { type: 'rich_text', rich_text: {} }
    }

    logger.debug({ notionErrorMessage, properties }, 'Setting up missing Notion database properties')

    await this.notion.databases.update({ database_id: this.databaseId, properties })
  }
}

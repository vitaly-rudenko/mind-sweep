import { APIResponseError, type Client } from '@notionhq/client'
import type { Bucket, Note, VendorEntityId, VendorEntityType } from '../types.js'
import { createNotionPageVendorEntity } from './vendor-entity.js'
import { getVendorEntity, mergeVendorEntities } from '../vendor-entity.js'
import { noteToNotionPageProperties, notionPagesToNotes } from './serialization.js'
import { logger } from '../common/logger.js'

const pageProperties = ['Name', 'Tags', 'Status', 'entity:telegram_message']

export class NotionBucket implements Bucket {
  constructor(
    private readonly notion: Client,
    private readonly databaseId: string,
  ) {}

  async getNotes() {
    const response = await this.notion.databases.query({
      database_id: this.databaseId,
      archived: false,
    })

    logger.debug({ response }, 'Retrieved notes from the Notion database')

    return notionPagesToNotes(this.databaseId, response.results)
  }

  async getNote(vendorEntityType: VendorEntityType, vendorEntityId: VendorEntityId) {
    const response = await this.notion.databases.query({
      database_id: this.databaseId,
      archived: false,
      page_size: 1,
      filter: {
        property: `entity:${vendorEntityType}`,
        rich_text: {
          starts_with: `${vendorEntityId}:`,
        },
      }
    })

    logger.debug({ vendorEntityType, vendorEntityId, response }, 'Retrieved a note from the Notion database')

    return notionPagesToNotes(this.databaseId, response.results).at(0)
  }

  async storeNote(note: Note, retry = true): Promise<Note> {
    try {
      logger.debug({ note }, 'Storing a note to the Notion database')

      const vendorEntity = getVendorEntity(note.vendorEntities, 'notion_page')

      if (vendorEntity) {
        await this.notion.pages.update({
          page_id: vendorEntity.metadata.pageId,
          properties: noteToNotionPageProperties(note),
        })
        return note
      }

      const page = await this.notion.pages.create({
        parent: { database_id: this.databaseId  },
        properties: noteToNotionPageProperties(note),
      })

      return {
        ...note,
        vendorEntities: mergeVendorEntities(note.vendorEntities, createNotionPageVendorEntity(this.databaseId, page)),
      }
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
    const notionPageVendorEntity = getVendorEntity(note.vendorEntities, 'notion_page')
    if (!notionPageVendorEntity) throw new Error('Unsupported vendor entity type')

    await this.notion.pages.update({
      page_id: notionPageVendorEntity.metadata.pageId,
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
            { name: 'Not started' },
            { name: 'In progress' },
            { name: 'Done' },
            { name: 'To delete' },
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

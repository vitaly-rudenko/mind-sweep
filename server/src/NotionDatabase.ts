import type { Client } from '@notionhq/client'
import type { QueryDatabaseResponse, PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js'
import type { Note, NotionPageVendorEntity, VendorEntity } from './types.js'
import { createNoteHash } from './create-note-hash.js'

const SERIALIZED_REGEX = /^(.+?):(\{.+\}):(.+)$/

export class NotionDatabase {
  constructor(
    private readonly notion: Client,
    private readonly databaseId: string,
  ) {}

  async getNotes() {
    const response = await this.notion.databases.query({
      database_id: this.databaseId,
      archived: false,
    })

    const notes = this.parseNotionQueryDatabaseResponse(response)

    return notes
  }

  async getNote(vendorEntityType: VendorEntity['type'], vendorEntityId: VendorEntity['id']) {
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

    return this.parseNotionQueryDatabaseResponse(response).at(0)
  }

  async createNote(note: Note) {
    await this.setupNotionDatabase()

    await this.notion.pages.create({
      parent: {
        database_id: this.databaseId,
      },
      properties: this.serializeNoteToNotion(note),
    })
  }

  async updateNote(note: Note) {
    const notionPageVendorEntity = this.getNotionPageVendorEntity(note.vendorEntities)
    if (!notionPageVendorEntity) throw new Error('Unsupported vendor entity type')

    await this.setupNotionDatabase()

    await this.notion.pages.update({
      page_id: notionPageVendorEntity.metadata.pageId,
      properties: this.serializeNoteToNotion(note),
    })
  }

  async deleteNote(note: Note) {
    const notionPageVendorEntity = this.getNotionPageVendorEntity(note.vendorEntities)
    if (!notionPageVendorEntity) throw new Error('Unsupported vendor entity type')

    await this.notion.pages.update({
      page_id: notionPageVendorEntity.metadata.pageId,
      archived: true,
    })
  }

  private async setupNotionDatabase() {
    await this.notion.databases.update({
      database_id: this.databaseId,
      properties: {
        'Name': {
          type: 'title',
          title: {},
        },
        'Tags': {
          type: 'multi_select',
          multi_select: {},
        },
        'Status': {
          type: 'select',
          select: {
            options: [
              { name: 'Not started' },
              { name: 'In progress' },
              { name: 'Done' },
              { name: 'To delete' },
            ]
          },
        },
        'entity:telegram_message': {
          type: 'rich_text',
          rich_text: {},
        }
      }
    })
  }

  private parseNotionQueryDatabaseResponse(response: QueryDatabaseResponse) {
    const notes: Note[] = []

    for (const page of response.results) {
      if (!('properties' in page)) continue

      const nameProperty = page.properties['Name']
      const tagsProperty = page.properties['Tags']
      const statusProperty = page.properties['Status']
      const entityProperties: [string, PageObjectResponse['properties'][number]][] = Object
        .entries(page.properties)
        .filter(([name]) => name.startsWith('entity:'))

      if (!('title' in nameProperty)) continue
      if (!('multi_select' in tagsProperty) || !Array.isArray(tagsProperty.multi_select)) continue
      if (!('select' in statusProperty) || (statusProperty.select && 'options' in statusProperty.select)) continue

      const content = nameProperty.title.at(0)?.plain_text
      if (!content) continue

      const tags = tagsProperty.multi_select.map((tag) => tag.name)
      const status = statusProperty.select?.name === 'In progress'
        ? 'in_progress'
        : statusProperty.select?.name === 'Done'
          ? 'done'
          : statusProperty.select?.name === 'To delete'
            ? 'to_delete'
            : 'not_started'

      const vendorEntities: VendorEntity[] = [this.createNotionPageVendorEntity(this.databaseId, page.id, content)]
      for (const [name, property] of entityProperties) {
        if (!('rich_text' in property)) continue

        const type = name.slice('entity:'.length)
        if (type !== 'telegram_message') continue

        const serialized = property.rich_text[0]?.plain_text
        if (!serialized) continue

        const match = serialized.match(SERIALIZED_REGEX)
        if (!match) continue

        const [, id, metadata, hash] = match

        vendorEntities.push({
          type,
          id,
          hash,
          metadata: JSON.parse(metadata),
        })
      }

      notes.push({
        content,
        tags,
        vendorEntities,
        status,
      })
    }

    return notes
  }

  private createNotionPageVendorEntity(databaseId: string, pageId: string, content: string): NotionPageVendorEntity {
    return {
      type: 'notion_page',
      id: `${databaseId}_${pageId}`,
      hash: createNoteHash(content),
      metadata: {
        databaseId,
        pageId,
      }
    }
  }

  private getNotionPageVendorEntity(vendorEntities: VendorEntity[]) {
    return vendorEntities.find((entity): entity is NotionPageVendorEntity => entity.type === 'notion_page')
  }

  private serializeNoteToNotion(note: Note): Parameters<Client['pages']['create']>[0]['properties'] {
    return {
      'Name': {
        type: 'title',
        title: [
          {
            type: 'text',
            text: {
              content: note.content,
            },
          },
        ],
      },
      'Tags': {
        type: 'multi_select',
        multi_select: note.tags.map((tag) => ({ name: tag })),
      },
      'Status': {
        type: 'select',
        select: {
          name: note.status === 'done'
            ? 'Done'
            : note.status === 'in_progress'
              ? 'In progress'
              : 'Not started',
        },
      },
      ...this.serializeVendorEntitiesToNotionProperties(note.vendorEntities)
    }
  }

  private serializeVendorEntitiesToNotionProperties(vendorEntities: VendorEntity[]): Parameters<Client['pages']['create']>[0]['properties'] {
    const properties: Parameters<Client['pages']['create']>[0]['properties'] = {}

    for (const vendorEntity of vendorEntities) {
      if (vendorEntity.type === 'notion_page') continue

      properties[`entity:${vendorEntity.type}`] = {
        type: 'rich_text',
        rich_text: [
          {
            type: 'text',
            text: {
              content: `${vendorEntity.id}:${JSON.stringify(vendorEntity.metadata)}:${vendorEntity.hash}`
            }
          }
        ]
      }
    }

    return properties
  }
}

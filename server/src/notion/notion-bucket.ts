import { Client } from '@notionhq/client'
import type { Bucket, Integration, Note, VendorEntity } from '../types.js'
import type { PostgresStorage } from '../users/postgres-storage.js'
import { match } from '../match.js'
import { parseVendorEntity } from '../utils.js'

export class NotionBucket {
  constructor(
    private readonly storage: PostgresStorage,
    private readonly client: Client = new Client(),
  ) {}

  async read(input: {
    bucket: Extract<Bucket, { bucketType: 'notion_database' }>
    integration: Extract<Integration, { integrationType: 'notion' }>
  }): Promise<Note[]> {
    const { bucket, integration } = input

    const pages = await this.client.databases.query({
      database_id: bucket.metadata.databaseId,
      auth: integration.metadata.integrationSecret,
    });

    const notes: Note[] = []

    for (const page of pages.results) {
      if (page.object !== 'page' || !('properties' in page)) {
        throw new Error(`Not a page object or does not have properties: ${page.id}`)
      }

      const nameProperty = page.properties['Name']
      if (!nameProperty || nameProperty.type !== 'title') {
        throw new Error(`Page does not have valid Name property: ${page.id}`)
      }

      const tagsProperty = page.properties['Tags']
      if (!tagsProperty || tagsProperty.type !== 'multi_select') {
        throw new Error(`Page does not have valid Tags property: ${page.id}`)
      }

      const vendorEntityProperty = page.properties['mind_sweep:vendor_entity']
      if (!vendorEntityProperty || vendorEntityProperty.type !== 'rich_text') {
        throw new Error(`Page does not have valid VendorEntity property: ${page.id}`)
      }

      let vendorEntity: VendorEntity | undefined
      if (vendorEntityProperty.rich_text?.[0]?.plain_text) {
        vendorEntity = parseVendorEntity(vendorEntityProperty.rich_text[0].plain_text)
      }

      notes.push({
        content: nameProperty.title[0].plain_text,
        tags: tagsProperty.multi_select.map(tag => tag.name),
        vendorEntity,
        noteType: 'notion_page',
        metadata: {
          pageId: page.id,
        },
      })
    }

    return notes
  }

  async createNote(input: { note: Note, bucketId: number, userId: number }) {
    const { note, bucketId, userId } = input

    const bucket = await this.storage.getBucketById(userId, bucketId)
    if (!bucket) throw new Error(`Bucket not found: ${bucketId}`)
    if (bucket.bucketType !== 'notion_database') throw new Error(`Unsupported bucket type: ${bucket.bucketType}`)

    const integration = await this.storage.getIntegrationById(userId, bucket.integrationId)
    if (!integration) throw new Error(`Integration not found: ${bucket.integrationId}`)
    if (integration.integrationType !== 'notion') throw new Error(`Unsupported integration type: ${integration.integrationType}`)

    await this.client.pages.create({
      auth: integration.metadata.integrationSecret,
      parent: { database_id: bucket.metadata.databaseId },
      properties: {
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
          multi_select: note.tags.map(tag => ({ name: tag })),
        },
        ...note.vendorEntity && {
          'mind_sweep:vendor_entity': {
            type: 'rich_text',
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `${note.vendorEntity.vendorEntityType}:${note.vendorEntity.id}:${JSON.stringify(note.vendorEntity.metadata)}:${note.vendorEntity.hash}`,
                },
              },
            ],
          }
        }
      },
    })
  }

  async updateNote(input: { note: Note, bucketId: number, userId: number }) {
    const { note, bucketId, userId } = input

    if (note.noteType !== 'notion_page') throw new Error(`Unsupported note type: ${note.noteType}`)

    const bucket = await this.storage.getBucketById(userId, bucketId)
    if (!bucket) throw new Error(`Bucket not found: ${bucketId}`)
    if (bucket.bucketType !== 'notion_database') throw new Error(`Unsupported bucket type: ${bucket.bucketType}`)

    const integration = await this.storage.getIntegrationById(userId, bucket.integrationId)
    if (!integration) throw new Error(`Integration not found: ${bucket.integrationId}`)
    if (integration.integrationType !== 'notion') throw new Error(`Unsupported integration type: ${integration.integrationType}`)

    await this.client.pages.update({
      auth: integration.metadata.integrationSecret,
      page_id: note.metadata.pageId,
      properties: {
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
          multi_select: note.tags.map(tag => ({ name: tag })),
        },
        ...note.vendorEntity && {
          'mind_sweep:vendor_entity': {
            type: 'rich_text',
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `${note.vendorEntity.vendorEntityType}:${note.vendorEntity.id}:${JSON.stringify(note.vendorEntity.metadata)}:${note.vendorEntity.hash}`,
                },
              },
            ],
          }
        }
      },
    })
  }
}

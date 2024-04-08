import { Client } from '@notionhq/client'
import type { Note, Require, VendorEntity } from '../types.js'
import type { PostgresStorage } from '../users/postgres-storage.js'
import { match } from '../match.js'
import { parseVendorEntity } from '../utils.js'

export class NotionBucket {
  constructor(
    private readonly storage: PostgresStorage,
    private readonly client: Client = new Client(),
  ) {}

  async read(input: { template?: string, bucketId: number, userId: number }) {
    const { template, bucketId, userId } = input

    const metadata = await this.storage.getBucketAndIntegrationMetadata(userId, bucketId, 'notion_database', 'notion')
    if (!metadata) throw new Error(`Bucket not found: ${bucketId}`)

    const pages = await this.client.databases.query({
      database_id: metadata.bucketMetadata.databaseId,
      auth: metadata.integrationMetadata.integrationSecret,
    });

    const notes: Extract<Note, { noteType: 'notion_page' }>[] = []

    for (const page of pages.results) {
      if (page.object !== 'page' || !('properties' in page)) continue

      const nameProperty = page.properties['Name']
      if (!nameProperty || nameProperty.type !== 'title') continue

      const content = nameProperty.title[0].plain_text
      if (template !== undefined && match(content, template) === undefined) continue

      const tagsProperty = page.properties['Tags']
      if (!tagsProperty || tagsProperty.type !== 'multi_select') continue

      const tags = tagsProperty.multi_select.map(tag => tag.name)

      const vendorEntityProperty = page.properties['mind_sweep:vendor_entity']
      if (!vendorEntityProperty || vendorEntityProperty.type !== 'rich_text') continue

      let vendorEntity: VendorEntity | undefined
      if (vendorEntityProperty?.rich_text?.[0]?.plain_text) {
        vendorEntity = parseVendorEntity(vendorEntityProperty.rich_text[0].plain_text)
      }

      notes.push({
        content,
        tags,
        vendorEntity,
        noteType: 'notion_page',
        metadata: {
          pageId: page.id,
        },
      })
    }

    return notes
  }

  async createNote(input: { note: Require<Note, 'vendorEntity'>, bucketId: number, userId: number }) {
    const { note, bucketId, userId } = input

    const metadata = await this.storage.getBucketAndIntegrationMetadata(userId, bucketId, 'notion_database', 'notion')
    if (!metadata) throw new Error(`Bucket not found: ${bucketId}`)

    const { bucketMetadata, integrationMetadata } = metadata

    await this.client.pages.create({
      auth: integrationMetadata.integrationSecret,
      parent: { database_id: bucketMetadata.databaseId },
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
      },
    })
  }

  async updateNote(input: { note: Extract<Require<Note, 'vendorEntity'>, { noteType: 'notion_page' }>, bucketId: number, userId: number }) {
    const { note, bucketId, userId } = input

    const metadata = await this.storage.getBucketAndIntegrationMetadata(userId, bucketId, 'notion_database', 'notion')
    if (!metadata) throw new Error(`Bucket not found: ${bucketId}`)

    const { integrationMetadata } = metadata

    await this.client.pages.update({
      auth: integrationMetadata.integrationSecret,
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
      },
    })
  }
}

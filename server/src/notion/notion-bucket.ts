import { Client } from '@notionhq/client'
import type { PostgresStorage } from '../postgres-storage.js'
import type { PageObjectResponse, PartialPageObjectResponse, PartialDatabaseObjectResponse, DatabaseObjectResponse, UpdatePageParameters, CreatePageParameters } from '@notionhq/client/build/src/api-endpoints.js'
import type { Bucket } from '../buckets/types.js'
import type { Integration } from '../integrations/types.js'
import type { Note } from '../notes/types.js'
import type { VendorEntityQuery, VendorEntity } from '../vendor-entities/types.js'
import { serializeNotionMirrorVendorEntity } from './serialize-notion-mirror-vendor-entity.js'
import { deserializeNotionMirrorVendorEntity } from './deserialize-notion-mirror-vendor-entity.js'
import { createVendorEntityHash } from '../vendor-entities/create-vendor-entity-hash.js'
import { createNotionVendorEntity } from './create-notion-vendor-entity.js'

type Page = PageObjectResponse | PartialPageObjectResponse | PartialDatabaseObjectResponse | DatabaseObjectResponse

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

    return pages.results.map(page => this.deserializeNote(bucket.metadata.databaseId, page))
  }

  async storeNote(input: {
    note: Note
    bucketId: number
    userId: number
    mirrorVendorEntityQuery?: VendorEntityQuery
  }) {
    const { note, bucketId, userId } = input

    const bucket = await this.storage.getBucketById(userId, bucketId)
    if (!bucket) throw new Error(`Bucket not found: ${bucketId}`)
    if (bucket.bucketType !== 'notion_database') throw new Error(`Unsupported bucket type: ${bucket.bucketType}`)

    const integration = await this.storage.getIntegrationById(userId, bucket.integrationId)
    if (!integration) throw new Error(`Integration not found: ${bucket.integrationId}`)
    if (integration.integrationType !== 'notion') throw new Error(`Unsupported integration type: ${integration.integrationType}`)

    let pageId: string | undefined = note.sourceVendorEntity?.vendorEntityType === 'notion_page'
      ? note.sourceVendorEntity.metadata.pageId
      : undefined

    if (!pageId) {
      const mirrorVendorEntityQuery: VendorEntityQuery | undefined = input.mirrorVendorEntityQuery || note.mirrorVendorEntity
      if (mirrorVendorEntityQuery) {
        const page = await this.getNoteByMirrorVendorEntityQueryId({
          integration,
          bucket,
          mirrorVendorEntityQuery,
        })
        pageId = page?.id
      }
    }

    if (pageId) {
      await this.updateNote({ pageId, integration, note })
    } else {
      await this.createNote({ integration, bucket, note })
    }
  }

  private async createNote(input: {
    integration: Extract<Integration, { integrationType: 'notion' }>
    bucket: Extract<Bucket, { bucketType: 'notion_database' }>
    note: Note
  }) {
    const { integration, bucket, note } = input

    await this.client.pages.create({
      auth: integration.metadata.integrationSecret,
      parent: { database_id: bucket.metadata.databaseId },
      properties: this.serializeNote(note),
    })
  }

  private async updateNote(input: {
    pageId: string
    integration: Extract<Integration, { integrationType: 'notion' }>
    note: Note
  }) {
    const { pageId, integration, note } = input

    await this.client.pages.update({
      auth: integration.metadata.integrationSecret,
      page_id: pageId,
      properties: this.serializeNote(note),
    })
  }

  private async getNoteByMirrorVendorEntityQueryId(input: {
    integration: Extract<Integration, { integrationType: 'notion' }>
    bucket: Extract<Bucket, { bucketType: 'notion_database' }>
    mirrorVendorEntityQuery: VendorEntityQuery
  }): Promise<Page | undefined> {
    const { mirrorVendorEntityQuery, integration, bucket } = input

    const pages = await this.client.databases.query({
      database_id: bucket.metadata.databaseId,
      auth: integration.metadata.integrationSecret,
      filter: {
        property: 'mind_sweep:mirror_vendor_entity',
        rich_text: {
          starts_with: `${mirrorVendorEntityQuery.vendorEntityType}:${mirrorVendorEntityQuery.id}:`,
        },
      },
      page_size: 1,
    })

    return pages.results[0]
  }

  private serializeNote(note: Note): NonNullable<UpdatePageParameters['properties'] | CreatePageParameters['properties']> {
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
        multi_select: note.tags.map(tag => ({ name: tag })),
      },
      ...note.mirrorVendorEntity && {
        'mind_sweep:mirror_vendor_entity': {
          type: 'rich_text',
          rich_text: [
            {
              type: 'text',
              text: {
                content: serializeNotionMirrorVendorEntity(note.mirrorVendorEntity),
              },
            },
          ],
        }
      }
    }
  }

  private deserializeNote(databaseId: string, page: PageObjectResponse | PartialPageObjectResponse | PartialDatabaseObjectResponse | DatabaseObjectResponse): Note {
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

    const mirrorVendorEntityProperty = page.properties['mind_sweep:mirror_vendor_entity']
    if (!mirrorVendorEntityProperty || mirrorVendorEntityProperty.type !== 'rich_text') {
      throw new Error(`Page does not have valid MirrorVendorEntity property: ${page.id}`)
    }

    const content = nameProperty.title[0].plain_text

    let mirrorVendorEntity: VendorEntity | undefined
    if (mirrorVendorEntityProperty.rich_text?.[0]?.plain_text) {
      mirrorVendorEntity = deserializeNotionMirrorVendorEntity(mirrorVendorEntityProperty.rich_text[0].plain_text)
    }

    return {
      content,
      tags: tagsProperty.multi_select.map(tag => tag.name),
      mirrorVendorEntity,
      sourceVendorEntity: createNotionVendorEntity({ databaseId, pageId: page.id, content }),
    }
  }
}

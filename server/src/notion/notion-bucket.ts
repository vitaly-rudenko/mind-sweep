import { Client } from '@notionhq/client'
import type { PostgresStorage } from '../postgres-storage.js'
import type { PageObjectResponse, PartialPageObjectResponse, PartialDatabaseObjectResponse, DatabaseObjectResponse, UpdatePageParameters, CreatePageParameters } from '@notionhq/client/build/src/api-endpoints.js'
import type { Bucket } from '../buckets/types.js'
import type { Integration } from '../integrations/types.js'
import type { Note, SourceNote } from '../notes/types.js'
import type { VendorEntityQuery, VendorEntity } from '../vendor-entities/types.js'
import { serializeNotionMirrorVendorEntity } from './serialize-notion-mirror-vendor-entity.js'
import { deserializeNotionMirrorVendorEntity } from './deserialize-notion-mirror-vendor-entity.js'
import { createNotionVendorEntity } from './create-notion-vendor-entity.js'
import type { PartiallyNullable } from '../utils/types.js'
import { InvalidResourceError, NotFoundError, UnsupportedActionError } from '../errors.js'

type Page = PageObjectResponse | PartialPageObjectResponse | PartialDatabaseObjectResponse | DatabaseObjectResponse

export class NotionBucket {
  constructor(
    private readonly storage: PostgresStorage,
    private readonly client: Client = new Client(),
  ) {}

  async readSourceNotes(input: { userId: number, sourceBucketId: number }): Promise<SourceNote[]> {
    const { userId, sourceBucketId } = input
    const { sourceBucket, integration } = await this.getSourceBucketAndIntegration(userId, sourceBucketId)

    const pages = await this.client.databases.query({
      database_id: sourceBucket.metadata.databaseId,
      auth: integration.metadata.integrationSecret,
    });

    return pages.results.map(page => this.deserializeNote(sourceBucket.metadata.databaseId, page))
  }

  async updateOrCreateSourceNote(input: {
    userId: number
    bucketId: number
    mirrorVendorEntityQuery?: VendorEntityQuery
    note: Note
  }): Promise<SourceNote> {
    const { note, mirrorVendorEntityQuery, bucketId, userId } = input
    const { sourceBucket, integration } = await this.getSourceBucketAndIntegration(userId, bucketId)

    let pageId: string | undefined
    if (note.sourceVendorEntity) {
      if (note.sourceVendorEntity.vendorEntityType !== 'notion_page') {
        throw new InvalidResourceError('Invalid SourceVendorEntityType', { vendorEntityType: note.sourceVendorEntity.vendorEntityType })
      }

      pageId = note.sourceVendorEntity.metadata.pageId
    } else if (mirrorVendorEntityQuery) {
      const page = await this.getPageByMirrorVendorEntityQuery({ sourceBucket, integration, mirrorVendorEntityQuery })
      pageId = page?.id
    }

    if (pageId) {
      const page = await this.client.pages.update({
        auth: integration.metadata.integrationSecret,
        page_id: pageId,
        properties: this.serializeNote(note),
      })

      return this.deserializeNote(sourceBucket.metadata.databaseId, page)
    } else {
      const page = await this.client.pages.create({
        auth: integration.metadata.integrationSecret,
        parent: { database_id: sourceBucket.metadata.databaseId },
        properties: this.serializeNote(note),
      })

      return this.deserializeNote(sourceBucket.metadata.databaseId, page)
    }
  }

  async createSourceNote(input: {
    userId: number
    sourceBucketId: number
    note: Note
  }): Promise<void> {
    const { note, sourceBucketId, userId } = input
    const { sourceBucket, integration } = await this.getSourceBucketAndIntegration(userId, sourceBucketId)

    await this.client.pages.create({
      auth: integration.metadata.integrationSecret,
      parent: { database_id: sourceBucket.metadata.databaseId },
      properties: this.serializeNote(note),
    })
  }

  async detachSourceNote(input: {
    userId: number
    sourceBucketId: number
    mirrorVendorEntityQuery: VendorEntityQuery
  }): Promise<void> {
    const { mirrorVendorEntityQuery, sourceBucketId, userId } = input
    const { sourceBucket, integration } = await this.getSourceBucketAndIntegration(userId, sourceBucketId)

    const page = await this.getPageByMirrorVendorEntityQuery({ sourceBucket, integration, mirrorVendorEntityQuery })
    if (!page) return

    await this.client.pages.update({
      auth: integration.metadata.integrationSecret,
      page_id: page.id,
      properties: this.serializeNote({ mirrorVendorEntity: null }),
    })
  }

  async deleteSourceNote(input: {
    userId: number
    sourceBucketId: number
    mirrorVendorEntityQuery: VendorEntityQuery
  }): Promise<void> {
    const { userId, sourceBucketId, mirrorVendorEntityQuery } = input
    const { sourceBucket, integration } = await this.getSourceBucketAndIntegration(userId, sourceBucketId)

    const page = await this.getPageByMirrorVendorEntityQuery({ integration, sourceBucket, mirrorVendorEntityQuery })
    if (!page) return

    await this.client.pages.update({
      auth: integration.metadata.integrationSecret,
      page_id: page.id,
      archived: true,
    })
  }

  private async getSourceBucketAndIntegration(userId: number, sourceBucketId: number) {
    const sourceBucket = await this.storage.getBucketById(userId, sourceBucketId)
    if (!sourceBucket) throw new NotFoundError('SourceBucket not found', { bucketId: sourceBucketId })
    if (sourceBucket.bucketType !== 'notion_database') throw new UnsupportedActionError('Unsupported SourceBucketType', { sourceBucketType: sourceBucket.bucketType })

    const integration = await this.storage.getIntegrationById(userId, sourceBucket.integrationId)
    if (!integration) throw new NotFoundError('Integration not found', { integrationId: sourceBucket.integrationId })
    if (integration.integrationType !== 'notion') throw new UnsupportedActionError('Unsupported IntegrationType', { integrationType: integration.integrationType })

    return { sourceBucket, integration }
  }

  private async getPageByMirrorVendorEntityQuery(input: {
    integration: Extract<Integration, { integrationType: 'notion' }>
    sourceBucket: Extract<Bucket, { bucketType: 'notion_database' }>
    mirrorVendorEntityQuery: VendorEntityQuery
  }): Promise<Page | undefined> {
    const { mirrorVendorEntityQuery, integration, sourceBucket } = input

    const pages = await this.client.databases.query({
      database_id: sourceBucket.metadata.databaseId,
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

  private serializeNote(note: PartiallyNullable<Note>): NonNullable<UpdatePageParameters['properties'] | CreatePageParameters['properties']> {
    return {
      ...note.content !== undefined && {
        'Name': {
          type: 'title',
          title: [
            {
              type: 'text',
              text: {
                content: note.tags === null ? '' : note.content,
              },
            },
          ],
        }
      },
      ...note.tags !== undefined && {
        'Tags': {
          type: 'multi_select',
          multi_select: note.tags === null ? [] : note.tags.map(tag => ({ name: tag })),
        },
      },
      ...note.mirrorVendorEntity !== undefined && {
        'mind_sweep:mirror_vendor_entity': {
          // @ts-expect-error Weird error from Notion types
          type: 'rich_text',
          rich_text: [
            {
              type: 'text',
              text: {
                content: note.mirrorVendorEntity === null ? '' : serializeNotionMirrorVendorEntity(note.mirrorVendorEntity),
              },
            },
          ],
        }
      }
    }
  }

  private deserializeNote(databaseId: string, page: PageObjectResponse | PartialPageObjectResponse | PartialDatabaseObjectResponse | DatabaseObjectResponse): SourceNote {
    if (page.object !== 'page' || !('properties' in page)) {
      throw new InvalidResourceError('Not a page object or does not have properties', { pageId: page.id })
    }

    const nameProperty = page.properties['Name']
    if (!nameProperty || nameProperty.type !== 'title') {
      throw new InvalidResourceError('Page does not have valid Name property', { pageId: page.id, nameProperty })
    }

    const tagsProperty = page.properties['Tags']
    if (!tagsProperty || tagsProperty.type !== 'multi_select') {
      throw new InvalidResourceError('Page does not have valid Tags property', { pageId: page.id, tagsProperty })
    }

    const mirrorVendorEntityProperty = page.properties['mind_sweep:mirror_vendor_entity']
    if (!mirrorVendorEntityProperty || mirrorVendorEntityProperty.type !== 'rich_text') {
      throw new InvalidResourceError('Page does not have valid MirrorVendorEntity property', { pageId: page.id, mirrorVendorEntityProperty })
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

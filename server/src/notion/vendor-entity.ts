import type { NotionPageVendorEntity } from '../types.js'
import type { DatabaseObjectResponse, PageObjectResponse, PartialDatabaseObjectResponse, PartialPageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js'
import { createVendorEntityHash } from '../vendor-entity.js'

export function createNotionPageVendorEntity(databaseId: string, page: PageObjectResponse | PartialPageObjectResponse | DatabaseObjectResponse | PartialDatabaseObjectResponse): NotionPageVendorEntity {
  if (!('properties' in page)) {
    throw new Error('Invalid Notion page: Properties are missing')
  }

  const nameProperty = page.properties['Name']
  if (!nameProperty || !('title' in nameProperty)) {
    throw new Error('Invalid Notion page: Name property is missing or has an invalid type')
  }

  const content = nameProperty.title.at(0)?.plain_text ?? ''

  return {
    type: 'notion_page',
    id: page.id,
    hash: createVendorEntityHash(content),
    metadata: {
      databaseId,
      pageId: page.id,
    }
  }
}

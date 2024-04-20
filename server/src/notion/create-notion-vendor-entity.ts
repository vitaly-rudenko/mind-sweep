import { createVendorEntityHash } from '../vendor-entities/create-vendor-entity-hash.js'
import type { VendorEntity } from '../vendor-entities/types.js'

export function createNotionVendorEntity(input: {
  databaseId: string
  pageId: string
  content: string
}): VendorEntity {
  const { databaseId, pageId, content } = input

  return {
    id: `${databaseId}_${pageId}`,
    vendorEntityType: 'notion_page',
    metadata: {
      databaseId,
      pageId,
    },
    hash: createVendorEntityHash(content),
  }
}
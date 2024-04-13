import type { VendorEntity } from '../vendor-entities/types.js'

export function serializeNotionMirrorVendorEntity(vendorEntity: VendorEntity): string {
  return `${vendorEntity.vendorEntityType}:${vendorEntity.id}:${JSON.stringify(vendorEntity.metadata)}:${vendorEntity.hash}`
}

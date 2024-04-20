import { oneLineTrim } from 'common-tags'
import type { VendorEntity } from '../vendor-entities/types.js'

const SERIALIZED_VENDOR_ENTITY_REGEX = new RegExp(oneLineTrim`
  ^(?<vendorEntityType>.+?)
  :(?<id>.+?)
  :(?<serializedMetadata>\{.+\})
  :(?<hash>.+)$
`)

export function deserializeNotionMirrorVendorEntity(serialized: string): VendorEntity {
  const match = serialized.match(SERIALIZED_VENDOR_ENTITY_REGEX)
  if (!match?.groups) throw new Error(`Invalid serialized VendorEntity: ${serialized}`)

  return {
    id: match.groups.id,
    hash: match.groups.hash,
    vendorEntityType: match.groups.vendorEntityType,
    metadata: JSON.parse(match.groups.serializedMetadata),
  } as VendorEntity
}

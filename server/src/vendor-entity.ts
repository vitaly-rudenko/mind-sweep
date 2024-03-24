import { logger } from './common/logger.js'
import type { VendorEntity } from './types.js'
import crypto from 'crypto';

export function createVendorEntityHash(input: string) {
  return crypto.createHash('md5').update(input).digest('hex')
}

export function getVendorEntity<T extends VendorEntity['type']>(vendorEntities: VendorEntity[], type: T) {
  return vendorEntities.find((vendorEntity): vendorEntity is Extract<VendorEntity, { type: T }> => vendorEntity.type === type)
}

export function mergeVendorEntities(left: VendorEntity[], right: VendorEntity | VendorEntity[]): VendorEntity[] {
  const types = new Set<string>()
  const merged: VendorEntity[] = []

  for (const vendorEntity of [...left, ...Array.isArray(right) ? right : [right]].reverse()) {
    if (types.has(vendorEntity.type)) continue
    types.add(vendorEntity.type)
    merged.push(vendorEntity)
  }

  return merged
}

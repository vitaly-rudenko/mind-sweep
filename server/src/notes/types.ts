import type { VendorEntity } from '../vendor-entities/types.js'

export type Note = {
  content: string
  tags: string[]
  sourceVendorEntity?: VendorEntity
  mirrorVendorEntity?: VendorEntity
}

export type SourceNote = Note & { sourceVendorEntity: VendorEntity }
export type MirrorNote = Note & { mirrorVendorEntity: VendorEntity }

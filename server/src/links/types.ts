export type Link = {
  id: number
  userId: number
  sourceBucketId: number
  mirrorBucketId: number
  priority: number
  template?: string
  defaultTags?: string[]
}

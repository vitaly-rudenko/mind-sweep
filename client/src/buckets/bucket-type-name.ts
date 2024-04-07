import type { BucketType } from '@/types'

export function bucketTypeName(bucketType: BucketType): string {
  if (bucketType === 'notion_database') {
    return 'Notion Database'
  }

  if (bucketType === 'telegram_chat') {
    return 'Telegram Chat'
  }

  return bucketType
}
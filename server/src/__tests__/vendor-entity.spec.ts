import { describe, it, expect } from '@jest/globals'
import { mergeVendorEntities } from '../vendor-entity'

describe('vendor-entity', () => {
  describe('mergeVendorEntities()', () => {
    it('merges vendor entities', () => {
      expect(mergeVendorEntities(
        [
          { type: 'notion_page', hash: '1', id: '1', metadata: { databaseId: '1', pageId: '1' } }
        ],
        { type: 'telegram_message', hash: '2', id: '2', metadata: { chatId: 2, messageId: 2, fromUserId: 2 } }
      )).toEqual([
        { type: 'telegram_message', hash: '2', id: '2', metadata: { chatId: 2, messageId: 2, fromUserId: 2 } },
        { type: 'notion_page', hash: '1', id: '1', metadata: { databaseId: '1', pageId: '1' } },
      ])
    })

    it('replaces duplicates', () => {
      expect(mergeVendorEntities(
        [
          { type: 'notion_page', hash: '1', id: '1', metadata: { databaseId: '1', pageId: '1' } },
          { type: 'telegram_message', hash: '2', id: '2', metadata: { chatId: 2, messageId: 2, fromUserId: 2 } }
        ],
        [{ type: 'telegram_message', hash: '3', id: '3', metadata: { chatId: 3, messageId: 3, fromUserId: 3 } }]
      )).toEqual([
        { type: 'telegram_message', hash: '3', id: '3', metadata: { chatId: 3, messageId: 3, fromUserId: 3 } },
        { type: 'notion_page', hash: '1', id: '1', metadata: { databaseId: '1', pageId: '1' } },
      ])
    })
  })
})

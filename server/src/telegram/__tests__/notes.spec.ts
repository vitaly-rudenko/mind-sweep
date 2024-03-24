import { describe, it, expect } from '@jest/globals'
import { noteToTelegramMessageText } from '../notes.js'

describe('telegram/notes', () => {
  describe('noteToTelegramMessageText()', () => {
    it('returns content as is when there are no tags', () => {
      expect(noteToTelegramMessageText({
        content: 'Hello, world!',
        tags: [],
      })).toBe('Hello, world!')
    })

    it('returns content as is with inline tags', () => {
      expect(noteToTelegramMessageText({
        content: 'Hello, #world! #foo #bar',
        tags: ['world', 'foo', 'bar'],
      })).toBe('Hello, #world! #foo #bar')
    })

    it('adds tags to the end of the content when they are not inlined', () => {
      expect(noteToTelegramMessageText({
        content: 'Hello, #world!',
        tags: ['world', 'foo', 'bar'],
      })).toBe('Hello, #world!\n\n#foo #bar')
    })
  })
})

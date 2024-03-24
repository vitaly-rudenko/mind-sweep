import { describe, it, expect } from '@jest/globals'
import { noteToTelegramMessageText, parseTelegramMessage } from '../notes.js'

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

  describe('parseTelegramMessage()', () => {
    it('parses tag-less message', () => {
      expect(parseTelegramMessage({
        text: 'Hello world!',
        entities: [],
      })).toEqual({
        content: 'Hello world!',
        tags: [],
      })
    })

    it('parses inline tags', () => {
      expect(parseTelegramMessage({
        text: 'Hello #world!',
        entities: [
          { type: 'hashtag', offset: 6, length: 6 }
        ],
      })).toEqual({
        content: 'Hello #world!',
        tags: ['world'],
      })
    })

    it('parses tags at the end of the message', () => {
      expect(parseTelegramMessage({
        text: 'Hello, world!\n\n#test',
        entities: [
          { type: 'hashtag', offset: 15, length: 5 }
        ],
      })).toEqual({
        content: 'Hello, world!',
        tags: ['test'],
      })
    })

    it('parses complex message with lots of tags, both inline and at the end', () => {
      expect(parseTelegramMessage({
        text: 'Hello, #world!\n\nWhat\'s #up?\n\n#test0 Not a tag line!\n\n#test0\n\nAlso not a tag line!\n\n#test1 #test2 \n#foo #bar \n\n#hello_world',
        entities: [
          { offset: 7, length: 6, type: 'hashtag' },
          { offset: 23, length: 3, type: 'hashtag' },
          { offset: 29, length: 6, type: 'hashtag' },
          { offset: 53, length: 6, type: 'hashtag' },
          { offset: 83, length: 6, type: 'hashtag' },
          { offset: 90, length: 6, type: 'hashtag' },
          { offset: 98, length: 4, type: 'hashtag' },
          { offset: 103, length: 4, type: 'hashtag' },
          { offset: 110, length: 12, type: 'hashtag' },
        ],
      })).toEqual({
        content: 'Hello, #world!\n\nWhat\'s #up?\n\n#test0 Not a tag line!\n\n#test0\n\nAlso not a tag line!',
        tags: ['world', 'up', 'test0', 'test1', 'test2', 'foo', 'bar', 'hello world'],
      })
    })
  })
})

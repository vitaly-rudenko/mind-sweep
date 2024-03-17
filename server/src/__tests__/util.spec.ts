import { describe, it, expect } from '@jest/globals'
import { greeting } from '../util.js'
import { name } from './helpers.js'

describe('util', () => {
  describe('greeting', () => {
    it('returns a greeting message', () => {
      expect(greeting(name)).toBe('Hello, John Doe!')
    })
  })
})

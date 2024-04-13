// @ts-expect-error
import { PatternBuilder, PatternMatcher, EntryMatchers } from '@vitalyrudenko/templater'

export function match(input: string, pattern: string): {} | undefined {
  const patternMatcher = new PatternMatcher()
  const entryMatchers = new EntryMatchers()

  const result = patternMatcher.match(
    input,
    new PatternBuilder().build(pattern),
    entryMatchers,
    { returnCombination: true }
  )

  return result || undefined
}
// @ts-expect-error
import { PatternBuilder, PatternMatcher, EntryMatchers } from '@vitalyrudenko/templater'

export function match(input: { content: string; template: string }): {} | undefined {
  const patternMatcher = new PatternMatcher()
  const entryMatchers = new EntryMatchers()

  const result = patternMatcher.match(
    input.content,
    new PatternBuilder().build(input.template),
    entryMatchers,
    { returnCombination: true }
  )

  return result || undefined
}
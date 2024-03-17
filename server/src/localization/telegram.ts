import type { Context } from 'telegraf'

const defaultLocale = 'en'
const languageCodeLocaleMap: Record<string, string> = { en: 'en' }

export const withLocale = () => {
  return async (context: Context, next: Function) => {
    if (!context.from) return

    context.state.locale = localeFromLanguageCode(context.from.language_code)
    return next()
  }
}

export function localeFromLanguageCode(languageCode?: string): string {
  return (
    languageCode && languageCodeLocaleMap[languageCode] ||
    defaultLocale
  )
}

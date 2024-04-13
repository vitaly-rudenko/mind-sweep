const defaultLocale = 'en'
const languageCodeLocaleMap: Record<string, string> = { en: 'en' }

export function getLocaleFromTelegramLanguageCode(languageCode?: string): string {
  return (
    languageCode && languageCodeLocaleMap[languageCode] ||
    defaultLocale
  )
}

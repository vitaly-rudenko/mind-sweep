import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import type { z } from 'zod'
import { localeFileSchema } from './schemas.js'

const en = flattenLocaleFile(
  localeFileSchema.parse(
    yaml.load(
      fs.readFileSync(
        path.join(process.cwd(), 'locales', 'en.yml'),
        'utf8',
      )
    )
  )
)

export function localize(locale: string, key: MessageKey, replacements?: Record<string, number | string | undefined>): string {
  if (locale !== 'en') {
    throw new Error(`Unsupported locale: '${locale}'`)
  }

  if (!key) {
    throw new Error(`Invalid localization key: '${String(key)}'`)
  }

  const message = en[key]
  if (message === undefined) {
    throw new Error(`Missing message for localization key '${String(key)}'`)
  }

  return replaceVariables(message, replacements)
}

function flattenLocaleFile<T extends Record<string, string | T>>(localeFile: T) {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(localeFile)) {
    if (typeof value === 'string') {
      result[key] = value
    } else {
      for (const [k, v] of Object.entries(flattenLocaleFile(value))) {
        result[`${key}.${k}`] = v
      }
    }
  }

  return result
}

function replaceVariables(message: string, replacements?: Record<string, string | number | undefined>): string {
  message = message.replaceAll(/\{[a-z0-9_]+\}/ig, (variable) => {
    const replacement = replacements?.[variable.slice(1, -1)]
    if (replacement === undefined) {
      throw new Error(`Missing replacement for variable ${String(variable)}`)
    }

    return String(replacement)
  })

  return message
}

type ObjectKey<T, A = keyof T> = T extends Record<string, unknown>
  ? A extends string
    ? `${A}${T[A] extends Record<string, unknown> ? '.' : ''}${ObjectKey<T[A]>}`
    : ''
  : ''

export type MessageKey = ObjectKey<z.infer<typeof localeFileSchema>>

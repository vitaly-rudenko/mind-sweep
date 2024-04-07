import { z } from 'zod'

const optionalBooleanSchema = z
  .union([z.literal('true'), z.literal('false'), z.boolean()])
  .optional()
  .transform((value) => value === 'true' || value === true)

const logLevelSchema = z
  .union([
    z.literal('trace'),
    z.literal('debug'),
    z.literal('info'),
    z.literal('warn'),
    z.literal('error'),
    z.literal('fatal'),
  ])
  .default('info')

const urlSchema = z
  .string().min(1)
  .refine((value) => {
    try { new URL(value) } catch { return false }
    return true
  }, { message: 'Must be a URL' })

const numberSchema = z
  .union([z.string().min(1), z.number()])
  .transform((value) => Number(value))

const stringSchema = z.string().min(1)

const urlArraySchema = z
  .string()
  .transform((value) => value.split(',').map((item) => item.trim()))
  .pipe(z.array(urlSchema).nonempty())

const envSchema = z.object({
  PORT: numberSchema,
  LOG_LEVEL: logLevelSchema,
  USE_TEST_MODE: optionalBooleanSchema,
  REDIS_URL: urlSchema,
  DATABASE_URL: urlSchema,
  LOG_DATABASE_QUERIES: optionalBooleanSchema,
  DEBUG_CHAT_ID: numberSchema,
  TELEGRAM_BOT_TOKEN: stringSchema,
  WEB_APP_URL: urlSchema,
  WEB_APP_NAME: stringSchema,
  CORS_ORIGIN: urlArraySchema,
  TOKEN_SECRET: stringSchema,
})

export const env = envSchema.parse(process.env)

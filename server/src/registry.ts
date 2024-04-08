import { DependencyRegistry } from '@vitalyrudenko/dependency-registry'
import type { localize } from './localization/localize.js'
import type { Redis } from 'ioredis'
import type { Telegram } from 'telegraf'
import type { createWebAppUrlGenerator } from './web-app/utils.js'
import type { PostgresStorage } from './users/postgres-storage.js'

export const registry = new DependencyRegistry<Dependencies>()

export type Dependencies = {
  redis: Redis
  storage: PostgresStorage
  webAppName: string
  webAppUrl: string
  debugChatId: number
  botInfo: Awaited<ReturnType<Telegram['getMe']>>
  localize: typeof localize
  telegram: Telegram
  version: string
  generateWebAppUrl: ReturnType<typeof createWebAppUrlGenerator>
}

export type Deps<N extends keyof Dependencies> = Pick<Dependencies, N>

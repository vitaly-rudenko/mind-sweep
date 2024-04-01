import type { BucketType, IntegrationType } from './integration.js'
import type { User } from './users/user.js'

export type TelegramContextState = {
  integrationType: IntegrationType
  integrationQueryId: string

  bucketType: BucketType
  bucketQueryId: string

  user: User
  locale: string
}

export type InitialTelegramContextState = Omit<TelegramContextState, 'user' | 'locale'> & { user?: User }

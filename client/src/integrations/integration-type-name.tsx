import type { IntegrationType } from '@/types'

export function integrationTypeName(integrationType: IntegrationType): string {
  if (integrationType === 'notion') {
    return 'Notion'
  }

  if (integrationType === 'telegram') {
    return 'Telegram'
  }

  return integrationType
}
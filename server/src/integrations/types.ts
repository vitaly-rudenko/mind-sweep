export type Integration = {
  id: number
  name: string
  userId: number
  queryId: string
} & ({
  integrationType: 'telegram'
  metadata: {
    userId: number
  }
} | {
  integrationType: 'notion'
  metadata: {
    userId: string
    integrationSecret: string
  }
})

export type IntegrationType = Integration['integrationType']

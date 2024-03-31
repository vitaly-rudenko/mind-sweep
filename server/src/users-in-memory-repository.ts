import type { Integration, IntegrationQuery, User, UsersRepository } from './types.js'

export class UsersInMemoryRepository implements UsersRepository {
  private readonly users: User[] = [];
  private readonly integrations: Map<User, Integration[]> = new Map();

  async createUserFromIntegration(integration: Integration): Promise<User> {
    if (integration.type === 'telegram') {
      const user = {
        id: String(Date.now()),
      }

      this.users.push(user)
      this.integrations.set(user, [integration])

      return user
    } else {
      throw new Error('Unsupported integration type')
    }
  }

  async getIntegrationByUserId<T extends Integration['type']>(userId: string, type: T): Promise<Extract<Integration, { type: T }> | undefined> {
    for (const [user, integrations] of this.integrations.entries()) {
      if (user.id === userId) {
        return integrations.find((integration): integration is Extract<Integration, { type: T }> => integration.type === type)
      }
    }
  }

  async getUserByIntegration(query: IntegrationQuery): Promise<User | undefined> {
    for (const [user, integrations] of this.integrations.entries()) {
      if (integrations.some(integration => integration.type === query.type && integration.id === query.id)) {
        return user
      }
    }
  }
}

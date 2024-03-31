import { DatabaseError, type Client } from 'pg'
import type { Integration, IntegrationType } from '../integration.js'
import type { User } from './user.js'

type UserRow = { id: number }
type IntegrationRow<T extends IntegrationType | unknown = unknown> = {
  id: number
  user_id: number
  query_id: string
  type: T
  metadata: Integration<T>['metadata']
}

export class PostgresStorage {
  constructor(private readonly client: Client) {}

  async createUserWithIntegration(integration: Integration): Promise<User> {
    try {
      await this.client.query('BEGIN;')

      const { rows: [{ id: userId }] } = await this.client.query<UserRow>(`
        INSERT INTO users
        RETURNING id;
      `)

      const { rows: [{ id: integrationId }] } = await this.client.query<IntegrationRow>(`
        INSERT INTO integrations (user_id, query_id, type, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `, [userId, integration.queryId, integration.type, integration.metadata])

      try {
        await this.client.query(`
          INSERT INTO default_integrations (user_id, integration_id, integration_type)
          VALUES ($1, $2, $3);
        `, [userId, integrationId, integration.type])
      } catch (err) {
        if (!(err instanceof DatabaseError) || err.code !== '23505') {
          throw err
        }
      }

      await this.client.query('COMMIT;')

      return { id: userId }
    } catch (err) {
      await this.client.query('ROLLBACK;')
      throw err
    }
  }

  async getUserByIntegrationQueryId<T extends IntegrationType>(integrationType: T, integrationQueryId: string): Promise<User | undefined> {
    const { rows } = await this.client.query<UserRow>(`
      SELECT users.id
      FROM integrations
      INNER JOIN users ON users.id = integrations.user_id
      WHERE type = $1 AND query_id = $2
      LIMIT 1;
    `, [integrationType, integrationQueryId])

    return rows[0] ? { id: rows[0].id } : undefined
  }

  async getDefaultIntegrationByUserId<T extends IntegrationType>(userId: number, integrationType: T): Promise<Integration<T> | undefined> {
    const { rows } = await this.client.query<IntegrationRow<T>>(`
      SELECT integrations.*
      FROM default_integrations
      INNER JOIN integrations ON integrations.id = default_integrations.integration_id
      WHERE user_id = $1 AND integration_type = $2
      LIMIT 1;
    `, [userId, integrationType])

    return rows[0] ? {
      id: rows[0].id,
      userId: rows[0].user_id,
      queryId: rows[0].query_id,
      type: rows[0].type,
      metadata: rows[0].metadata,
    } : undefined
  }
}

import { type Client } from 'pg'
import type { Bucket, BucketType, Integration, IntegrationType, Link } from '../integration.js'
import type { User } from './user.js'

type UserRow = {
  id: number
  name: string
  locale: string
}

type IntegrationRow<T extends IntegrationType | unknown = unknown> = {
  id: number
  name: string
  user_id: number
  query_id: string
  integration_type: T
  metadata: Integration<T>['metadata']
}

type BucketRow<T extends BucketType> = {
  id: number
  name: string
  user_id: number
  query_id: string
  bucket_type: T
  metadata: Bucket<T>['metadata']
  integration_id: number
}

type LinkRow = {
  id: number
  user_id: number
  from_bucket_id: number
  to_bucket_id: number
  template: string | null
  default_tags: string[] | null
}

export class PostgresStorage {
  constructor(private readonly client: Client) {}

  async createLink(link: Omit<Link, 'id'>): Promise<void> {
    await this.client.query<LinkRow>(`
      INSERT INTO links (user_id, from_bucket_id, to_bucket_id, template, default_tags)
      VALUES ($1, $2, $3, $4, $5);
    `, [link.userId, link.fromBucketId, link.toBucketId, link.template, link.defaultTags])
  }

  async createUserWithIntegration<I extends IntegrationType, B extends BucketType>(
    user: Omit<User, 'id'>,
    integration: Omit<Integration<I>, 'id' | 'userId'>,
    bucket: Omit<Bucket<B>, 'id' | 'userId' | 'integrationId'>
  ): Promise<{ user: User }> {
    try {
      await this.client.query('BEGIN;')

      const { rows: [{ id: userId }] } = await this.client.query<UserRow>(`
        INSERT INTO users (name, locale)
        VALUES ($1, $2)
        RETURNING id;
      `, [user.name, user.locale])

      const { rows: [{ id: integrationId }] } = await this.client.query<IntegrationRow>(`
        INSERT INTO integrations (name, user_id, query_id, integration_type, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `, [integration.name, userId, integration.queryId, integration.integrationType, integration.metadata])

      await this.client.query<BucketRow<BucketType>>(`
        INSERT INTO buckets (name, user_id, query_id, bucket_type, metadata, integration_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `, [bucket.name, userId, bucket.queryId, bucket.bucketType, bucket.metadata, integrationId])

      await this.client.query('COMMIT;')

      return {
        user: {
          id: userId,
          name: user.name,
          locale: user.locale,
        }
      }
    } catch (err) {
      await this.client.query('ROLLBACK;')
      throw err
    }
  }

  async getUserByIntegrationQueryId<T extends IntegrationType>(integrationType: T, integrationQueryId: string): Promise<User | undefined> {
    const { rows } = await this.client.query<UserRow>(`
      SELECT users.*
      FROM integrations
      INNER JOIN users ON users.id = integrations.user_id
      WHERE integration_type = $1 AND query_id = $2
      LIMIT 1;
    `, [integrationType, integrationQueryId])

    return rows[0] ? {
      id: rows[0].id,
      name: rows[0].name,
      locale: rows[0].locale,
    } : undefined
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
      name: rows[0].name,
      userId: rows[0].user_id,
      queryId: rows[0].query_id,
      integrationType: rows[0].integration_type,
      metadata: rows[0].metadata,
    } : undefined
  }
}

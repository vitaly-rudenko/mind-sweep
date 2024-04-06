import { type Client } from 'pg'
import type { Bucket, BucketType, Integration, IntegrationType, Link, LoginMethod, LoginMethodType } from '../types.js'
import type { User } from './user.js'
import { AlreadyExistsError } from '../common/errors.js'

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

type BucketRow<T extends BucketType | unknown = unknown> = {
  id: number
  name: string
  user_id: number
  query_id: string
  bucket_type: T
  metadata: Bucket<T>['metadata']
  integration_id: number
}

type LoginMethodRow<T extends LoginMethodType | unknown = unknown> = {
  id: number
  user_id: number
  name: string
  query_id: string
  login_method_type: T
  metadata: LoginMethod<T>['metadata']
}

type LinkRow = {
  id: number
  user_id: number
  source_bucket_id: number
  mirror_bucket_id: number
  priority: number
  template: string | null
  default_tags: string[] | null
}

export class PostgresStorage {
  constructor(private readonly client: Client) {}

  async createLink(link: Omit<Link, 'id'>): Promise<void> {
    await this.client.query<LinkRow>(`
      INSERT INTO links (user_id, source_bucket_id, mirror_bucket_id, template, priority, default_tags)
      VALUES ($1, $2, $3, $4, $5);
    `, [link.userId, link.sourceBucketId, link.mirrorBucketId, link.priority, link.template, link.defaultTags])
  }

  async createUserWithIntegration<I extends IntegrationType, B extends BucketType>(
    user: Omit<User, 'id'>,
    loginMethod: Omit<LoginMethod<LoginMethodType>, 'id' | 'userId'>,
    integration: Omit<Integration<I>, 'id' | 'userId' | 'isLoginMethod'>,
    bucket: Omit<Bucket<B>, 'id' | 'userId' | 'integrationId'>
  ): Promise<{ user: User }> {
    try {
      await this.client.query('BEGIN;')

      const { rows: [{ id: userId }] } = await this.client.query<UserRow>(`
        INSERT INTO users (name, locale)
        VALUES ($1, $2)
        RETURNING id;
      `, [user.name, user.locale])

      await this.client.query<LoginMethodRow>(`
        INSERT INTO login_methods (user_id, name, query_id, login_method_type, metadata)
        VALUES ($1, $2, $3, $4, $5);
      `, [userId, loginMethod.name, loginMethod.queryId, loginMethod.loginMethodType, loginMethod.metadata])

      const { rows: [{ id: integrationId }] } = await this.client.query<IntegrationRow>(`
        INSERT INTO integrations (user_id, name, query_id, integration_type, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `, [userId, integration.name, integration.queryId, integration.integrationType, integration.metadata])

      await this.client.query<BucketRow<BucketType>>(`
        INSERT INTO buckets (integration_id, user_id, name, query_id, bucket_type, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `, [integrationId, userId, bucket.name, bucket.queryId, bucket.bucketType, bucket.metadata])

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

  async getUserByLoginMethod<T extends LoginMethodType>(loginMethodType: T, loginMethodQueryId: string): Promise<User | undefined> {
    const { rows } = await this.client.query<UserRow>(`
      SELECT users.id, users.name, users.locale
      FROM users
      INNER JOIN login_methods ON users.id = login_methods.user_id
      WHERE login_methods.login_method_type = $1 AND login_methods.query_id = $2;
    `, [loginMethodType, loginMethodQueryId])

    return rows[0] ? {
      id: rows[0].id,
      name: rows[0].name,
      locale: rows[0].locale,
    } : undefined
  }

  async createIntegration<I extends IntegrationType>(integration: Omit<Integration<I>, 'id'>): Promise<Integration<I>> {
    try {
      const { rows: [{ id }] } = await this.client.query<IntegrationRow<I>>(`
        INSERT INTO integrations (user_id, name, query_id, integration_type, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `, [integration.userId, integration.name, integration.queryId, integration.integrationType, integration.metadata])

      return {
        id,
        userId: integration.userId,
        name: integration.name,
        queryId: integration.queryId,
        integrationType: integration.integrationType,
        metadata: integration.metadata,
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        throw new AlreadyExistsError('Integration already exists')
      }

      throw err
    }
  }

  async getIntegrationsByUserId<I extends IntegrationType>(userId: number): Promise<Integration<I>[]> {
    const { rows } = await this.client.query<IntegrationRow<I>>(`
      SELECT id, user_id, name, query_id, integration_type, metadata
      FROM integrations
      WHERE user_id = $1;
    `, [userId])

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      queryId: row.query_id,
      integrationType: row.integration_type,
      metadata: row.metadata,
    }))
  }

  async deleteIntegrationById(userId: number, integrationId: number): Promise<void> {
    await this.client.query('DELETE FROM integrations WHERE user_id = $1 AND id = $2;', [userId, integrationId])
  }
}

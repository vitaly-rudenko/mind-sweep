import { type Client } from 'pg'
import type { User } from './user.js'
import type { Bucket, BucketQuery } from './buckets/types.js'
import { AlreadyExistsError, ApiError } from './errors.js'
import type { Integration } from './integrations/types.js'
import type { Link } from './links/types.js'
import type { LoginMethod, LoginMethodType } from './login-methods/types.js'

type UserRow = {
  id: number
  name: string
  locale: string
}

type IntegrationRow = {
  id: number
  name: string
  user_id: number
  query_id: string
  integration_type: string
  metadata: unknown
}

type BucketRow = {
  id: number
  name: string
  user_id: number
  query_id: string
  bucket_type: string
  metadata: unknown
  integration_id: number
  source_links: LinkRow[]
}

type LoginMethodRow = {
  id: number
  user_id: number
  name: string
  query_id: string
  login_method_type: string
  metadata: unknown
}

type LinkRow = {
  id: number
  user_id: number
  source_bucket_id: number
  source_bucket_type?: string
  mirror_bucket_id: number
  priority: number
  template: string | null
  default_tags: string[] | null
  settings: any
}

export class PostgresStorage {
  constructor(private readonly client: Client) {}

  async createLink(link: Omit<Link, 'id' | 'priority'>): Promise<Link> {
    try {
      const { rows: [{ id, priority }] } = await this.client.query<LinkRow>(`
        INSERT INTO links (user_id, mirror_bucket_id, source_bucket_id, template, default_tags, settings, priority)
        VALUES ($1, $2, $3, $4, $5, $6, get_next_priority($1, $2))
        RETURNING id, priority;
      `, [link.userId, link.mirrorBucketId, link.sourceBucketId, link.template, link.defaultTags, link.settings])

      return { id, priority, ...link }
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err) {
        if (err.code === '23505') {
          throw new AlreadyExistsError()
        } else if (err.code === '23514') {
          throw new ApiError({ code: 'INVALID_LINK', status: 400 })
        }
      }

      throw err
    }
  }

  async updateLink(userId: number, linkId: number, link: Omit<Link, 'id' | 'mirrorBucketId' | 'userId'>): Promise<void> {
    try {
      await this.client.query(`
        UPDATE links
        SET source_bucket_id = $3
          , priority = $4
          , template = $5
          , default_tags = $6
          , settings = $7
        WHERE user_id = $1 AND id = $2;
      `, [userId, linkId, link.sourceBucketId, link.priority, link.template, link.defaultTags, link.settings])
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err) {
        if (err.code === '23505') {
          throw new AlreadyExistsError()
        } else if (err.code === '23514') {
          throw new ApiError({ code: 'INVALID_LINK', status: 400 })
        }
      }

      throw err
    }
  }

  async createUserWithIntegration(user: Omit<User, 'id'>, loginMethod: Omit<LoginMethod, 'id' | 'userId'>): Promise<{ user: User }> {
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
      SELECT u.*
      FROM users u
      INNER JOIN login_methods l ON u.id = l.user_id
      WHERE l.login_method_type = $1 AND l.query_id = $2;
    `, [loginMethodType, loginMethodQueryId])

    return rows[0] ? {
      id: rows[0].id,
      name: rows[0].name,
      locale: rows[0].locale,
    } : undefined
  }

  async createIntegration(integration: Omit<Integration, 'id'>): Promise<Integration> {
    try {
      const { rows: [{ id }] } = await this.client.query<IntegrationRow>(`
        INSERT INTO integrations (user_id, name, query_id, integration_type, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `, [integration.userId, integration.name, integration.queryId, integration.integrationType, integration.metadata])

      return { id, ...integration } as Integration
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        throw new AlreadyExistsError('Integration already exists')
      }

      throw err
    }
  }

  async getIntegrationsByUserId(userId: number): Promise<Integration[]> {
    const { rows } = await this.client.query<IntegrationRow>(`
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
    }) as Integration)
  }

  async getIntegrationById(userId: number, integrationId: number): Promise<Integration | undefined> {
    const { rows } = await this.client.query<IntegrationRow>(`
      SELECT id, user_id, name, query_id, integration_type, metadata
      FROM integrations
      WHERE user_id = $1 AND id = $2;
    `, [userId, integrationId])

    return rows[0] ? {
      id: rows[0].id,
      userId: rows[0].user_id,
      name: rows[0].name,
      queryId: rows[0].query_id,
      integrationType: rows[0].integration_type,
      metadata: rows[0].metadata,
    } as Integration : undefined
  }

  async deleteIntegrationById(userId: number, integrationId: number): Promise<void> {
    await this.client.query('DELETE FROM integrations WHERE user_id = $1 AND id = $2;', [userId, integrationId])
  }

  async createBucket(bucket: Omit<Bucket, 'id'>): Promise<Bucket> {
    try {
      const { rows: [{ id }] } = await this.client.query<BucketRow>(`
        INSERT INTO buckets (user_id, name, query_id, bucket_type, metadata, integration_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `, [bucket.userId, bucket.name, bucket.queryId, bucket.bucketType, bucket.metadata, bucket.integrationId])

      return { id, ...bucket } as Bucket
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        throw new AlreadyExistsError('Bucket already exists')
      }

      throw err
    }
  }

  async getBucketsByUserId(userId: number): Promise<{ bucket: Bucket; sourceLinks: Link[] }[]> {
    const { rows } = await this.client.query<BucketRow>(`
      SELECT b.*, COALESCE(json_agg(l.* ORDER BY l.priority DESC) FILTER (WHERE l.id IS NOT NULL), '[]') AS source_links
      FROM buckets b
      LEFT JOIN links l ON l.mirror_bucket_id = b.id
      WHERE b.user_id = $1
      GROUP BY b.id;
    `, [userId])

    return rows.map(row => ({
      bucket: this.deserializeBucket(row),
      sourceLinks: row.source_links.map(row => this.deserializeLink(row)),
    }))
  }

  async deleteBucketById(userId: number, bucketId: number): Promise<void> {
    await this.client.query('DELETE FROM buckets WHERE user_id = $1 AND id = $2;', [userId, bucketId])
  }

  async deleteLinkById(userId: number, linkId: number): Promise<void> {
    await this.client.query('DELETE FROM links WHERE user_id = $1 AND id = $2;', [userId, linkId])
  }

  async getLinksByMirrorBucketId(userId: number, mirrorBucketId: number): Promise<Link[]> {
    const { rows } = await this.client.query<LinkRow>(`
      SELECT l.*
      FROM links l
      WHERE l.user_id = $1 AND mirror_bucket_id = $2
      ORDER BY l.priority DESC;
    `, [userId, mirrorBucketId])

    return rows.map(row => this.deserializeLink(row))
  }

  async getLinkedSourceBuckets(userId: number, mirrorBucketId: number): Promise<Bucket[]> {
    const { rows } = await this.client.query<BucketRow>(`
      SELECT b.*
      FROM buckets b
      WHERE b.user_id = $1 AND b.id IN (
        SELECT l.source_bucket_id
        FROM links l
        WHERE l.user_id = $1 AND l.mirror_bucket_id = $2
      );
    `, [userId, mirrorBucketId])

    return rows.map(row => this.deserializeBucket(row))
  }

  async getBucketById(userId: number, bucketId: number): Promise<Bucket | undefined> {
    const { rows } = await this.client.query<BucketRow>(`
      SELECT b.*
      FROM buckets b
      WHERE b.user_id = $1 AND b.id = $2;
    `, [userId, bucketId])

    return rows[0] ? this.deserializeBucket(rows[0]) : undefined
  }

  async queryBucket(userId: number, bucketQuery: BucketQuery): Promise<Bucket | undefined> {
    const { rows } = await this.client.query<BucketRow>(`
      SELECT b.*
      FROM buckets b
      WHERE b.user_id = $1 AND b.bucket_type = $2 AND b.query_id = $3;
    `, [userId, bucketQuery.bucketType, bucketQuery.queryId])

    return rows[0] ? this.deserializeBucket(rows[0]) : undefined
  }

  deserializeBucket(row: BucketRow) {
    return {
      id: row.id,
      name: row.name,
      userId: row.user_id,
      queryId: row.query_id,
      bucketType: row.bucket_type,
      metadata: row.metadata,
      integrationId: row.integration_id,
    } as Bucket
  }

  deserializeLink(row: LinkRow): Link {
    return {
      id: row.id,
      userId: row.user_id,
      sourceBucketId: row.source_bucket_id,
      mirrorBucketId: row.mirror_bucket_id,
      priority: row.priority,
      template: row.template ?? undefined,
      defaultTags: row.default_tags ?? undefined,
      settings: {
        stopOnMatch: row.settings.stopOnMatch ?? false,
      }
    }
  }
}

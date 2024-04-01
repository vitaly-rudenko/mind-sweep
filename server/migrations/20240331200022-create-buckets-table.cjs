module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    await db.query('BEGIN;')

    await db.query(`
      CREATE TABLE buckets (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        user_id INT NOT NULL REFERENCES users(id),
        query_id TEXT NOT NULL,
        bucket_type BUCKET_TYPE NOT NULL,
        metadata JSONB NOT NULL,
        integration_id INT NOT NULL REFERENCES integrations(id)
      )
    `)

    await db.query(`
      CREATE UNIQUE INDEX buckets_user_id_query_id_idx
        ON buckets (user_id, query_id);
    `)

    await db.query(`
      CREATE INDEX buckets_integration_id_idx
        ON buckets (integration_id);
    `)

    await db.query('COMMIT;')
  },

  /** @param {{ context: import('pg').Pool }} context */
  async down({ context: db }) {
    await db.query('BEGIN;')

    await db.query(`
      DROP TABLE buckets;
    `)

    await db.query('COMMIT;')
  },
}

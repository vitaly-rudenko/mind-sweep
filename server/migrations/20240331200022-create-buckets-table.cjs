const up = wrapInTransaction(async (client) => {
  await client.query(`
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

  // Avoid duplicate buckets per user
  await client.query(`
    CREATE UNIQUE INDEX buckets_user_id_query_id_idx
      ON buckets (user_id, query_id);
  `)

  await client.query(`
    CREATE INDEX buckets_integration_id_idx
      ON buckets (integration_id);
  `)
})

const down = wrapInTransaction(async (client) => {
  await client.query('DROP TABLE buckets;')
})

// -----------------------------------------------

/** @param {(client: import('pg').Client) => Promise<void>} fn */
function wrapInTransaction(fn) {
  /** @param {{ context: import('pg').Client }} context */
  return async ({ context }) => {
    try {
      await context.query('BEGIN;')
      await fn(context)
      await context.query('COMMIT;')
    } catch (err) {
      await context.query('ROLLBACK;')
      throw err
    }
  }
}

module.exports = {up, down}

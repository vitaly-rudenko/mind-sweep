const up = wrapInTransaction(async (client) => {
  await client.query(`
    CREATE TABLE links (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      source_bucket_id INT NOT NULL REFERENCES buckets(id) ON DELETE CASCADE ON UPDATE CASCADE,
      mirror_bucket_id INT NOT NULL REFERENCES buckets(id) ON DELETE CASCADE ON UPDATE CASCADE,
      priority NUMERIC(6, 3) NOT NULL CHECK (priority >= 0),
      template TEXT,
      default_tags TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await client.query(`
    CREATE UNIQUE INDEX
      ON links (user_id, source_bucket_id, mirror_bucket_id, template)
      NULLS NOT DISTINCT;
  `)
})

const down = wrapInTransaction(async (client) => {
  await client.query('DROP TABLE links;')
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

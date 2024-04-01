const up = wrapInTransaction(async (client) => {
  await client.query(`
    CREATE TABLE links (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id),
      from_bucket_id INT NOT NULL REFERENCES buckets(id),
      to_bucket_id INT NOT NULL REFERENCES buckets(id),
      template TEXT,
      default_tags TEXT[]
    );
  `)

  await client.query(`
    CREATE UNIQUE INDEX
      ON links (user_id, from_bucket_id, to_bucket_id, template)
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

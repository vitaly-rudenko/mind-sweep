const up = wrapInTransaction(async (client) => {
  await client.query(`
    CREATE TABLE integrations (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      name TEXT NOT NULL,
      query_id TEXT NOT NULL,
      integration_type INTEGRATION_TYPE NOT NULL,
      metadata JSONB NOT NULL
    );
  `)

  // Avoid duplicate integrations per user
  await client.query(`
    CREATE UNIQUE INDEX integrations_user_id_query_id_idx
      ON integrations (user_id, integration_type, query_id);
  `)
})

const down = wrapInTransaction(async (client) => {
  await client.query('DROP TABLE integrations;')
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

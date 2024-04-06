const up = wrapInTransaction(async (client) => {
  await client.query(`
    CREATE TABLE login_methods (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      name TEXT NOT NULL,
      query_id TEXT NOT NULL,
      login_method_type LOGIN_METHOD_TYPE NOT NULL,
      metadata JSONB NOT NULL
    );
  `)

  await client.query(`
    CREATE UNIQUE INDEX login_methods_login_method_type_query_id_idx
      ON login_methods (login_method_type, query_id);
  `)
})

const down = wrapInTransaction(async (client) => {
  await client.query(`
    DROP TABLE login_methods;
  `)
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

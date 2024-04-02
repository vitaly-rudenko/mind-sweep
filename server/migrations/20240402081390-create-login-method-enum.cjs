const up = wrapInTransaction(async (client) => {
  await client.query(`
    CREATE TYPE LOGIN_METHOD_TYPE AS ENUM ('telegram');
  `)
})

const down = wrapInTransaction(async (client) => {
  await client.query(`
    DROP TYPE LOGIN_METHOD_TYPE;
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

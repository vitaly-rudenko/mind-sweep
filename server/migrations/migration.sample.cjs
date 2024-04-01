const up = wrapInTransaction(async (client) => {
  await client.query(`
    -- TODO: make changes
  `)
})

const down = wrapInTransaction(async (client) => {
  await client.query(`
    -- TODO: revert changes
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

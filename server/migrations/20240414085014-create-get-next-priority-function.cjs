const up = wrapInTransaction(async (client) => {
  await client.query(`
    CREATE FUNCTION get_next_priority(user_id INT, mirror_bucket_id INT)
    RETURNS NUMERIC AS $$
    DECLARE
      next_priority NUMERIC;
    BEGIN
      SELECT COALESCE(MAX(priority), 0) + 1 INTO next_priority
      FROM links l
      WHERE l.user_id = $1 AND l.mirror_bucket_id = $2;

      RETURN next_priority;
    END;
    $$ LANGUAGE plpgsql;
  `)
})

const down = wrapInTransaction(async (client) => {
  await client.query(`
    DROP FUNCTION get_next_priority(INT, INT);
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

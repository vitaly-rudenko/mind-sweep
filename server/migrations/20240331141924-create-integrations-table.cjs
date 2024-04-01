module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    await db.query('BEGIN;')

    await db.query(`
      CREATE TABLE integrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        user_id INT NOT NULL REFERENCES users(id),
        query_id TEXT NOT NULL,
        integration_type INTEGRATION_TYPE NOT NULL,
        metadata JSONB NOT NULL
      );
    `)

    await db.query(`
      CREATE UNIQUE INDEX integrations_user_id_query_id_idx
        ON integrations (user_id, query_id);
    `)

    await db.query('COMMIT;')
  },

  /** @param {{ context: import('pg').Pool }} context */
  async down({ context: db }) {
    await db.query('DROP TABLE integrations;')
  },
}

module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    await db.query('BEGIN;')

    await db.query(`
      CREATE TABLE integrations (
        id INT PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        query_id TEXT NOT NULL,
        type INTEGRATION_TYPE NOT NULL,
        metadata JSONB NOT NULL
      );
    `)

    // Integration's Query ID must be globally unique per type
    await db.query(`
      CREATE UNIQUE INDEX integrations_type_query_id_unique_idx
      ON integrations (type, query_id);
    `)

    await db.query('COMMIT;')
  },

  /** @param {{ context: import('pg').Pool }} context */
  async down({ context: db }) {
    await db.query('DROP TABLE integrations;')
  },
}

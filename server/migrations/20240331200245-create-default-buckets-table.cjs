module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    await db.query('BEGIN;')

    await db.query(`
      CREATE TABLE default_buckets (
        user_id INT NOT NULL REFERENCES users(id),
        bucket_id INT NOT NULL REFERENCES buckets(id),
        integration_id INT NOT NULL REFERENCES integrations(id),
        PRIMARY KEY (user_id, integration_id)
      );
    `)

    await db.query('COMMIT;')
  },

  /** @param {{ context: import('pg').Pool }} context */
  async down({ context: db }) {
    await db.query('BEGIN;')

    await db.query(`
      DROP TABLE default_buckets;
    `)

    await db.query('COMMIT;')
  },
}

module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    await db.query('BEGIN;')

    await db.query(`
      CREATE TABLE default_integrations (
        user_id INT NOT NULL REFERENCES users(id),
        integration_id INT NOT NULL REFERENCES integrations(id),
        integration_type INTEGRATION_TYPE NOT NULL,
        PRIMARY KEY (user_id, integration_type)
      );
    `)

    await db.query('COMMIT;')
  },

  /** @param {{ context: import('pg').Pool }} context */
  async down({ context: db }) {
    await db.query('BEGIN;')

    await db.query(`
      DROP TABLE default_integrations;
    `)

    await db.query('COMMIT;')
  },
}

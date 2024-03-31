module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    await db.query('BEGIN;')

    await db.query(`
      CREATE TABLE default_integrations (
        id INT PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        integration_id INT NOT NULL REFERENCES integrations(id),
        integration_type INTEGRATION_TYPE NOT NULL
      );
    `)

    // Integration ID must be globally unique
    await db.query(`
      CREATE UNIQUE INDEX default_integrations_integration_id_unique_idx
      ON default_integrations (integration_id);
    `)

    // Allow one default integration type per user
    await db.query(`
      CREATE UNIQUE INDEX default_integrations_user_id_integration_type_unique_idx
      ON default_integrations (user_id, integration_type);
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

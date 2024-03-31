module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    await db.query(`
      CREATE TYPE INTEGRATION_TYPE AS ENUM ('telegram', 'notion', 'todoist');
    `)
  },

  /** @param {{ context: import('pg').Pool }} context */
  async down({ context: db }) {
    await db.query('DROP TYPE INTEGRATION_TYPE;')
  },
}

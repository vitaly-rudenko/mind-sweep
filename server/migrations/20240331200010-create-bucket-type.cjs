module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    await db.query(`
      CREATE TYPE BUCKET_TYPE AS ENUM ('telegram_chat', 'notion_database');
    `)
  },

  /** @param {{ context: import('pg').Pool }} context */
  async down({ context: db }) {
    await db.query('DROP TYPE BUCKET_TYPE;')
  },
}

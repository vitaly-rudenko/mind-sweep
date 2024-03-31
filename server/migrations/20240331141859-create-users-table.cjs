module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    await db.query(`
      CREATE TABLE users (
        id INT PRIMARY KEY
      );
    `)
  },

  /** @param {{ context: import('pg').Pool }} context */
  async down({ context: db }) {
    await db.query('DROP TABLE users;')
  },
}

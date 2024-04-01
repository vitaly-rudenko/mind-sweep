module.exports = {
  /** @param {{ context: import('pg').Pool }} context */
  async up({ context: db }) {
    await db.query('BEGIN;')

    await db.query(`
      CREATE TABLE links (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        from_bucket_id INT NOT NULL REFERENCES buckets(id),
        to_bucket_id INT NOT NULL REFERENCES buckets(id),
        template TEXT,
        default_tags TEXT[]
      );
    `)

    await db.query(`
      CREATE UNIQUE INDEX
        ON links (user_id, from_bucket_id, to_bucket_id, template)
        NULLS NOT DISTINCT;
    `)

    await db.query('COMMIT;')
  },

  /** @param {{ context: import('pg').Pool }} context */
  async down({ context: db }) {
    await db.query('BEGIN;')

    await db.query(`
      DROP TABLE links;
    `)

    await db.query('COMMIT;')
  },
}

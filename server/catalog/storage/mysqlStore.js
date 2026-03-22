class MySqlCatalogStore {
  constructor() {
    this.pool = null;
  }

  async connect() {
    if (this.pool) return this.pool;

    let mysql;
    try {
      mysql = require('mysql2/promise');
    } catch (error) {
      throw new Error('MySQL driver is not installed. Install "mysql2" to use STORAGE_DRIVER=mysql.');
    }

    const host = process.env.MYSQL_HOST;
    const user = process.env.MYSQL_USER;
    const password = process.env.MYSQL_PASSWORD;
    const database = process.env.MYSQL_DATABASE;

    if (!host || !user || !database) {
      throw new Error('Missing MYSQL_HOST, MYSQL_USER, or MYSQL_DATABASE for STORAGE_DRIVER=mysql.');
    }

    this.pool = mysql.createPool({
      host,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10
    });

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS external_videos (
        id VARCHAR(255) PRIMARY KEY,
        provider VARCHAR(64) NOT NULL,
        external_id VARCHAR(255) NOT NULL,
        payload JSON NOT NULL,
        fetched_at DATETIME NOT NULL,
        UNIQUE KEY provider_external_idx (provider, external_id)
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS external_metadata (
        id VARCHAR(255) PRIMARY KEY,
        provider VARCHAR(64) NOT NULL,
        type VARCHAR(64) NOT NULL,
        items JSON NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE KEY provider_type_idx (provider, type)
      )
    `);

    return this.pool;
  }

  async upsertVideos(provider, videos) {
    const pool = await this.connect();
    if (!videos.length) return 0;

    await Promise.all(
      videos.map((video) =>
        pool.query(
          `
            INSERT INTO external_videos (id, provider, external_id, payload, fetched_at)
            VALUES (?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
              payload = VALUES(payload),
              fetched_at = NOW()
          `,
          [
            `${provider}:${video.externalId}`,
            provider,
            String(video.externalId),
            JSON.stringify({
              id: `${provider}:${video.externalId}`,
              provider,
              ...video,
              fetchedAt: new Date().toISOString()
            })
          ]
        )
      )
    );

    return videos.length;
  }

  async getVideo(provider, externalId) {
    const pool = await this.connect();
    const [rows] = await pool.query(
      'SELECT payload FROM external_videos WHERE provider = ? AND external_id = ? LIMIT 1',
      [provider, String(externalId)]
    );
    return rows[0] ? JSON.parse(rows[0].payload) : null;
  }

  async saveMetadata(provider, type, items) {
    const pool = await this.connect();
    await pool.query(
      `
        INSERT INTO external_metadata (id, provider, type, items, updated_at)
        VALUES (?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          items = VALUES(items),
          updated_at = NOW()
      `,
      [`${provider}:${type}`, provider, type, JSON.stringify(items)]
    );
  }

  async getMetadata(provider, type) {
    const pool = await this.connect();
    const [rows] = await pool.query(
      'SELECT items FROM external_metadata WHERE provider = ? AND type = ? LIMIT 1',
      [provider, type]
    );
    return rows[0] ? JSON.parse(rows[0].items) : [];
  }
}

module.exports = {
  MySqlCatalogStore
};

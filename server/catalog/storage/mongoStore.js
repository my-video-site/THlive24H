class MongoCatalogStore {
  constructor() {
    this.client = null;
    this.db = null;
  }

  async connect() {
    if (this.db) return this.db;

    let MongoClient;
    try {
      ({ MongoClient } = require('mongodb'));
    } catch (error) {
      throw new Error('MongoDB driver is not installed. Install "mongodb" to use STORAGE_DRIVER=mongodb.');
    }

    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB || 'streamboost';

    if (!uri) {
      throw new Error('Missing MONGODB_URI for STORAGE_DRIVER=mongodb.');
    }

    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(dbName);
    return this.db;
  }

  async upsertVideos(provider, videos) {
    const db = await this.connect();
    const collection = db.collection('external_videos');
    if (!videos.length) return 0;

    await Promise.all(
      videos.map((video) =>
        collection.updateOne(
          { provider, externalId: String(video.externalId) },
          {
            $set: {
              provider,
              ...video,
              fetchedAt: new Date().toISOString()
            }
          },
          { upsert: true }
        )
      )
    );

    return videos.length;
  }

  async getVideo(provider, externalId) {
    const db = await this.connect();
    return db.collection('external_videos').findOne({ provider, externalId: String(externalId) });
  }

  async saveMetadata(provider, type, items) {
    const db = await this.connect();
    await db.collection('external_metadata').updateOne(
      { provider, type },
      { $set: { provider, type, items, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  }

  async getMetadata(provider, type) {
    const db = await this.connect();
    const doc = await db.collection('external_metadata').findOne({ provider, type });
    return doc?.items || [];
  }
}

module.exports = {
  MongoCatalogStore
};

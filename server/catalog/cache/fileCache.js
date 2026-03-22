const fs = require('fs/promises');

class FileCache {
  constructor({ file }) {
    this.file = file;
  }

  async readStore() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  async writeStore(store) {
    await fs.writeFile(this.file, JSON.stringify(store, null, 2));
  }

  async get(key) {
    const store = await this.readStore();
    const entry = store[key];
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      delete store[key];
      await this.writeStore(store);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttlMs) {
    const store = await this.readStore();
    store[key] = {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
      updatedAt: new Date().toISOString()
    };
    await this.writeStore(store);
  }

  async clearExpired() {
    const store = await this.readStore();
    const now = Date.now();
    let changed = false;

    Object.keys(store).forEach((key) => {
      if (store[key]?.expiresAt && now > store[key].expiresAt) {
        delete store[key];
        changed = true;
      }
    });

    if (changed) {
      await this.writeStore(store);
    }
  }
}

module.exports = {
  FileCache
};

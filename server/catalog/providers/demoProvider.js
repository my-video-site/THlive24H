const path = require('path');
const fs = require('fs/promises');

const { BaseVideoProvider } = require('./baseProvider');

const SEED_FILE = path.join(__dirname, '..', '..', '..', 'data', 'providerSeed.json');

async function loadSeed() {
  const raw = await fs.readFile(SEED_FILE, 'utf8');
  return JSON.parse(raw);
}

function paginate(items, page, limit) {
  const safePage = Math.max(Number(page || 1), 1);
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
  const start = (safePage - 1) * safeLimit;

  return {
    items: items.slice(start, start + safeLimit),
    page: safePage,
    limit: safeLimit,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / safeLimit))
  };
}

class DemoProvider extends BaseVideoProvider {
  constructor() {
    super({ name: 'demo' });
  }

  normalizeVideo(video) {
    return {
      externalId: String(video.externalId),
      title: video.title,
      description: video.description || '',
      thumbnail: video.thumbnail || '',
      durationSeconds: Number(video.durationSeconds || 0),
      categories: Array.isArray(video.categories) ? video.categories : [],
      tags: Array.isArray(video.tags) ? video.tags : [],
      embedUrl: video.embedUrl || '',
      videoUrl: video.videoUrl || '',
      publishedAt: video.publishedAt || null,
      creator: video.creator || '',
      stats: video.stats || {}
    };
  }

  async searchVideos({ query = '', page = 1, limit = 20, category, tag }) {
    const seed = await loadSeed();
    const normalizedQuery = String(query || '').trim().toLowerCase();

    const filtered = seed.videos
      .filter((video) => {
        const haystack = [
          video.title,
          video.description,
          ...(video.tags || []),
          ...(video.categories || [])
        ]
          .join(' ')
          .toLowerCase();

        if (normalizedQuery && !haystack.includes(normalizedQuery)) {
          return false;
        }

        if (category && !(video.categories || []).includes(category)) {
          return false;
        }

        if (tag && !(video.tags || []).includes(tag)) {
          return false;
        }

        return true;
      })
      .map((video) => this.normalizeVideo(video));

    return paginate(filtered, page, limit);
  }

  async getVideoById(externalId) {
    const seed = await loadSeed();
    const found = seed.videos.find((video) => String(video.externalId) === String(externalId));
    return found ? this.normalizeVideo(found) : null;
  }

  async getCategories() {
    const seed = await loadSeed();
    return [...seed.categories];
  }

  async getTags({ query = '', page = 1, limit = 50 } = {}) {
    const seed = await loadSeed();
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const filtered = seed.tags.filter((tag) => String(tag).toLowerCase().includes(normalizedQuery));
    return paginate(filtered, page, limit);
  }
}

module.exports = {
  DemoProvider
};

const axios = require('axios');

const { BaseVideoProvider } = require('./baseProvider');

const BASE = process.env.PYTHON_BRIDGE_URL || 'http://127.0.0.1:5001';

class PythonProvider extends BaseVideoProvider {
  constructor({ baseUrl } = {}) {
    super({ name: 'python' });
    this.client = axios.create({
      baseURL: baseUrl || BASE,
      timeout: 5000,
      validateStatus: (status) => status >= 200 && status < 500
    });
  }

  async requestJson(url, options = {}) {
    try {
      const response = await this.client.get(url, options);

      if (response.status >= 400) {
        if (response.status === 404) {
          return null;
        }

        throw new Error(`Python bridge request failed with status ${response.status}.`);
      }

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Python bridge request timed out.');
      }

      if (error.code === 'ECONNREFUSED') {
        throw new Error('Python bridge is unavailable. Start py_api.py first.');
      }

      if (error.response?.status) {
        throw new Error(`Python bridge request failed with status ${error.response.status}.`);
      }

      throw new Error(`Python bridge request failed: ${error.message}`);
    }
  }

  normalizeVideo(video) {
    return {
      externalId: String(video.id),
      title: video.title || '',
      description: video.description || '',
      thumbnail: video.thumb || '',
      durationSeconds: Number(video.durationSeconds || 0),
      categories: Array.isArray(video.categories) ? video.categories : [],
      tags: Array.isArray(video.tags) ? video.tags : [],
      embedUrl: video.embedUrl || '',
      videoUrl: video.url || '',
      publishedAt: video.publishedAt || null,
      creator: video.creator || '',
      stats: video.stats || {}
    };
  }

  async searchVideos({ query = '', page = 1, limit = 20, category = '', tag = '' } = {}) {
    const payload = (await this.requestJson('/search', {
      params: {
        q: query,
        page,
        limit,
        category,
        tag
      }
    })) || {};
    const items = Array.isArray(payload.items) ? payload.items : [];

    return {
      items: items.map((video) => this.normalizeVideo(video)),
      page: Number(payload.page || page || 1),
      limit: Number(payload.limit || limit || 20),
      total: Number(payload.total || items.length),
      totalPages: Number(payload.totalPages || 1)
    };
  }

  async getVideoById(externalId) {
    const payload = await this.requestJson(`/video/${encodeURIComponent(externalId)}`);
    if (!payload) {
      return null;
    }
    return this.normalizeVideo(payload);
  }

  async getCategories() {
    const payload = (await this.requestJson('/categories')) || {};
    return Array.isArray(payload.items) ? payload.items : [];
  }

  async getTags({ query = '', page = 1, limit = 50 } = {}) {
    const payload = (await this.requestJson('/tags', {
      params: {
        q: query,
        page,
        limit
      }
    })) || {};
    const items = Array.isArray(payload.items) ? payload.items : [];

    return {
      items,
      page: Number(payload.page || page || 1),
      limit: Number(payload.limit || limit || 50),
      total: Number(payload.total || items.length),
      totalPages: Number(payload.totalPages || 1)
    };
  }
}

module.exports = {
  PythonProvider
};

const fs = require('fs/promises');

function createInitialState() {
  return {
    videos: [],
    metadata: {}
  };
}

class JsonCatalogStore {
  constructor({ file }) {
    this.file = file;
  }

  async readState() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object'
        ? {
            videos: Array.isArray(parsed.videos) ? parsed.videos : [],
            metadata: parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {}
          }
        : createInitialState();
    } catch (error) {
      return createInitialState();
    }
  }

  async writeState(state) {
    await fs.writeFile(this.file, JSON.stringify(state, null, 2));
  }

  async upsertVideos(provider, videos) {
    const state = await this.readState();
    const indexMap = new Map(
      state.videos.map((video, index) => [`${video.provider}:${video.externalId}`, index])
    );

    videos.forEach((video) => {
      const key = `${provider}:${video.externalId}`;
      const payload = {
        id: key,
        provider,
        ...video,
        fetchedAt: new Date().toISOString()
      };
      const existingIndex = indexMap.get(key);
      if (existingIndex === undefined) {
        state.videos.push(payload);
      } else {
        state.videos[existingIndex] = {
          ...state.videos[existingIndex],
          ...payload
        };
      }
    });

    await this.writeState(state);
    return videos.length;
  }

  async getVideo(provider, externalId) {
    const state = await this.readState();
    return (
      state.videos.find(
        (video) => video.provider === provider && String(video.externalId) === String(externalId)
      ) || null
    );
  }

  async saveMetadata(provider, type, items) {
    const state = await this.readState();
    state.metadata[provider] = state.metadata[provider] || {};
    state.metadata[provider][type] = {
      items,
      updatedAt: new Date().toISOString()
    };
    await this.writeState(state);
  }

  async getMetadata(provider, type) {
    const state = await this.readState();
    return state.metadata?.[provider]?.[type]?.items || [];
  }
}

module.exports = {
  JsonCatalogStore
};

class BaseVideoProvider {
  constructor({ name }) {
    this.name = name;
  }

  async searchVideos() {
    throw new Error(`searchVideos is not implemented for provider "${this.name}".`);
  }

  async getVideoById() {
    throw new Error(`getVideoById is not implemented for provider "${this.name}".`);
  }

  async getCategories() {
    return [];
  }

  async getTags() {
    return [];
  }
}

module.exports = {
  BaseVideoProvider
};

const path = require('path');

const { FileCache } = require('./cache/fileCache');
const { createCatalogStore } = require('./storage');
const { getProvider, listProviders } = require('./providers/registry');

const cache = new FileCache({
  file: path.join(__dirname, '..', '..', 'data', 'providerCache.json')
});

const store = createCatalogStore();

function normalizeLimit(limit, fallback = 20, max = 100) {
  return Math.min(Math.max(Number(limit || fallback), 1), max);
}

function normalizePage(page) {
  return Math.max(Number(page || 1), 1);
}

async function resolveWithCache(key, ttlMs, loader, { refresh = false } = {}) {
  if (!refresh) {
    const cached = await cache.get(key);
    if (cached) return cached;
  }

  const value = await loader();
  await cache.set(key, value, ttlMs);
  return value;
}

async function searchVideos({ providerName, query, page, limit, category, tag, refresh = false }) {
  const provider = getProvider(providerName);
  const safePage = normalizePage(page);
  const safeLimit = normalizeLimit(limit);
  const cacheKey = [
    'search',
    provider.name,
    query || '',
    category || '',
    tag || '',
    safePage,
    safeLimit
  ].join(':');

  const result = await resolveWithCache(
    cacheKey,
    5 * 60 * 1000,
    async () => provider.searchVideos({ query, page: safePage, limit: safeLimit, category, tag }),
    { refresh }
  );

  await store.upsertVideos(provider.name, result.items);
  return {
    provider: provider.name,
    ...result
  };
}

async function getVideoDetails({ providerName, externalId, refresh = false }) {
  const provider = getProvider(providerName);
  const cacheKey = ['video', provider.name, externalId].join(':');

  const video = await resolveWithCache(
    cacheKey,
    10 * 60 * 1000,
    async () => provider.getVideoById(externalId),
    { refresh }
  );

  if (!video) return null;

  await store.upsertVideos(provider.name, [video]);
  return {
    provider: provider.name,
    ...video
  };
}

async function getCategories({ providerName, refresh = false }) {
  const provider = getProvider(providerName);
  const cacheKey = ['categories', provider.name].join(':');

  const categories = await resolveWithCache(
    cacheKey,
    60 * 60 * 1000,
    async () => provider.getCategories(),
    { refresh }
  );

  await store.saveMetadata(provider.name, 'categories', categories);
  return {
    provider: provider.name,
    items: categories
  };
}

async function getTags({ providerName, query, page, limit, refresh = false }) {
  const provider = getProvider(providerName);
  const safePage = normalizePage(page);
  const safeLimit = normalizeLimit(limit, 50);
  const cacheKey = ['tags', provider.name, query || '', safePage, safeLimit].join(':');

  const result = await resolveWithCache(
    cacheKey,
    30 * 60 * 1000,
    async () => provider.getTags({ query, page: safePage, limit: safeLimit }),
    { refresh }
  );

  await store.saveMetadata(provider.name, 'tags', result.items);
  return {
    provider: provider.name,
    ...result
  };
}

async function importVideosByIds({ providerName, ids = [], refresh = false }) {
  const provider = getProvider(providerName);
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id).trim()).filter(Boolean))];
  const results = [];

  for (const externalId of uniqueIds) {
    const video = await getVideoDetails({ providerName: provider.name, externalId, refresh });
    if (video) {
      results.push(video);
    }
  }

  return {
    provider: provider.name,
    total: results.length,
    items: results
  };
}

async function refreshProviderMetadata(providerName) {
  await Promise.all([
    getCategories({ providerName, refresh: true }),
    getTags({ providerName, query: '', page: 1, limit: 100, refresh: true })
  ]);
}

module.exports = {
  listProviders,
  searchVideos,
  getVideoDetails,
  getCategories,
  getTags,
  importVideosByIds,
  refreshProviderMetadata,
  clearExpiredCache: () => cache.clearExpired()
};

const express = require('express');

const {
  listProviders,
  searchVideos,
  getVideoDetails,
  getCategories,
  getTags,
  importVideosByIds
} = require('./service');

function toBoolean(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
}

function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const status = /not found/i.test(error.message) ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }
  };
}

function createCatalogRouter({ requireAuth, logEvent }) {
  const router = express.Router();

  router.get('/providers', withErrorHandling(async (req, res) => {
    return res.json({
      items: listProviders()
    });
  }));

  router.get('/videos/search', withErrorHandling(async (req, res) => {
    const providerName = String(req.query.provider || process.env.CATALOG_DEFAULT_PROVIDER || 'demo');
    const payload = await searchVideos({
      providerName,
      query: req.query.q || req.query.query || '',
      page: req.query.page,
      limit: req.query.limit,
      category: req.query.category || '',
      tag: req.query.tag || '',
      refresh: toBoolean(req.query.refresh)
    });

    return res.json(payload);
  }));

  router.get('/videos/:provider/:externalId', withErrorHandling(async (req, res) => {
    const item = await getVideoDetails({
      providerName: req.params.provider,
      externalId: req.params.externalId,
      refresh: toBoolean(req.query.refresh)
    });

    if (!item) {
      return res.status(404).json({ error: 'External video not found.' });
    }

    return res.json(item);
  }));

  router.get('/meta/categories', withErrorHandling(async (req, res) => {
    const providerName = String(req.query.provider || process.env.CATALOG_DEFAULT_PROVIDER || 'demo');
    const payload = await getCategories({
      providerName,
      refresh: toBoolean(req.query.refresh)
    });

    return res.json(payload);
  }));

  router.get('/meta/tags', withErrorHandling(async (req, res) => {
    const providerName = String(req.query.provider || process.env.CATALOG_DEFAULT_PROVIDER || 'demo');
    const payload = await getTags({
      providerName,
      query: req.query.q || req.query.query || '',
      page: req.query.page,
      limit: req.query.limit,
      refresh: toBoolean(req.query.refresh)
    });

    return res.json(payload);
  }));

  router.post('/sync/videos', requireAuth, withErrorHandling(async (req, res) => {
    const providerName = String(req.body.provider || process.env.CATALOG_DEFAULT_PROVIDER || 'demo');
    const payload = await importVideosByIds({
      providerName,
      ids: req.body.ids,
      refresh: toBoolean(req.body.refresh)
    });

    await logEvent('catalog.sync.videos', {
      provider: providerName,
      total: payload.total
    });

    return res.json(payload);
  }));

  return router;
}

module.exports = {
  createCatalogRouter
};

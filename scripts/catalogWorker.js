const cron = require('node-cron');

const { searchVideos } = require('../server/catalog/service');

async function fetchBatch() {
  const providerName = process.env.CATALOG_FETCH_PROVIDER || 'python';
  const query = process.env.CATALOG_FETCH_QUERY || 'trending';
  const pages = Math.max(Number(process.env.CATALOG_FETCH_PAGES || 5), 1);
  const limit = Math.min(Math.max(Number(process.env.CATALOG_FETCH_LIMIT || 20), 1), 100);

  console.log(`[catalog-worker] Fetching ${pages} page(s) from ${providerName}...`);

  for (let page = 1; page <= pages; page += 1) {
    const result = await searchVideos({
      providerName,
      query,
      page,
      limit,
      refresh: true
    });

    console.log(`[catalog-worker] Page ${page} -> ${result.items.length}`);

    if (!result.items.length || page >= result.totalPages) {
      break;
    }
  }
}

cron.schedule('*/10 * * * *', () => {
  fetchBatch().catch((error) => {
    console.error('[catalog-worker]', error.message);
  });
});

console.log('[catalog-worker] Started. Schedule: every 10 minutes.');
fetchBatch().catch((error) => {
  console.error('[catalog-worker]', error.message);
});

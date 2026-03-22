const { searchVideos } = require('../server/catalog/service');

async function run() {
  const providerName = process.env.CATALOG_FETCH_PROVIDER || 'python';
  const query = process.env.CATALOG_FETCH_QUERY || 'trending';
  const maxPages = Math.max(Number(process.env.CATALOG_FETCH_PAGES || 50), 1);
  const limit = Math.min(Math.max(Number(process.env.CATALOG_FETCH_LIMIT || 20), 1), 100);

  let imported = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await searchVideos({
      providerName,
      query,
      page,
      limit,
      refresh: true
    });

    console.log(`Page ${page} -> ${result.items.length}`);
    imported += result.items.length;

    if (!result.items.length || page >= result.totalPages) {
      break;
    }
  }

  console.log(`Imported ${imported} videos from provider "${providerName}".`);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

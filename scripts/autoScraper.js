const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'videos.json');

const MAX_PER_ROUND = 300;
const DELAY_BETWEEN_PAGES = 4000;
const DELAY_BETWEEN_ROUNDS = 20000;
const MAX_PAGES = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadOld() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function save(videos) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(videos, null, 2));
}

function dedupeVideos(videos) {
  const map = new Map();
  videos.forEach((video) => {
    const key = String(video.id || `${video.source}_${video.videoId}`).trim();
    if (key) {
      map.set(key, video);
    }
  });
  return Array.from(map.values());
}

async function scrapeMlivevkx(page) {
  const url =
    page === 1
      ? 'https://mlivevkx.net/category/thlive/'
      : `https://mlivevkx.net/category/thlive/page/${page}/`;

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const results = [];

    $('article').each((i, el) => {
      const link = $(el).find('a').attr('href');
      const title = $(el).find('a').text().trim();
      const thumbnail = $(el).find('img').attr('src');

      if (!link) return;

      const id = link.split('/').filter(Boolean).pop();
      results.push({
        id: `mlivevkx_${id}`,
        title: title || 'Clip',
        source: 'mlivevkx',
        videoId: id,
        embedUrl: link,
        thumbnail: thumbnail || '',
        createdAt: Date.now()
      });
    });

    console.log(`mlivevkx page ${page}: ${results.length}`);
    return results;
  } catch (error) {
    console.log('mlivevkx error:', error.message);
    return [];
  }
}

async function scrapeMlivehub(page) {
  const url =
    page === 1
      ? 'https://mlivehub3.com/category/%E0%B8%84%E0%B8%A5%E0%B8%B4%E0%B8%9B%E0%B8%AB%E0%B8%A5%E0%B8%B8%E0%B8%94-thlive/'
      : `https://mlivehub3.com/category/%E0%B8%84%E0%B8%A5%E0%B8%B4%E0%B8%9B%E0%B8%AB%E0%B8%A5%E0%B8%B8%E0%B8%94-thlive/page/${page}/`;

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const results = [];

    $('article').each((i, el) => {
      const link = $(el).find('a').attr('href');
      const title = $(el).find('a').text().trim();
      const thumbnail = $(el).find('img').attr('src');

      if (!link) return;

      const id = link.split('/').filter(Boolean).pop();
      results.push({
        id: `mlivehub_${id}`,
        title: title || 'Clip',
        source: 'mlivehub',
        videoId: id,
        embedUrl: link,
        thumbnail: thumbnail || '',
        createdAt: Date.now()
      });
    });

    console.log(`mlivehub page ${page}: ${results.length}`);
    return results;
  } catch (error) {
    console.log('mlivehub error:', error.message);
    return [];
  }
}

async function collectRound({ maxPages = MAX_PAGES, maxPerRound = MAX_PER_ROUND } = {}) {
  const collected = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const first = await scrapeMlivevkx(page);
    const second = await scrapeMlivehub(page);
    collected.push(...first, ...second);

    if (collected.length >= maxPerRound) {
      break;
    }

    if (page < maxPages) {
      await sleep(DELAY_BETWEEN_PAGES);
    }
  }

  return collected.slice(0, maxPerRound);
}

async function runAutoScraper(options = {}) {
  const limit = Math.max(1, Number(options.limit || options.maxPerRound || MAX_PER_ROUND));
  const maxPages = Math.max(1, Number(options.maxPages || MAX_PAGES));
  const oldVideos = loadOld();
  const collected = await collectRound({ maxPages, maxPerRound: limit });
  const merged = dedupeVideos([...collected, ...oldVideos]);

  save(merged);

  const oldIds = new Set(oldVideos.map((video) => String(video.id || '')));
  const added = collected.filter((video) => !oldIds.has(String(video.id || ''))).length;

  return {
    success: true,
    added,
    collected: collected.length,
    total: merged.length
  };
}

async function runLoop() {
  while (true) {
    console.log('Start scraping round...');
    const result = await runAutoScraper();
    console.log(`Round done: +${result.collected} | Added: ${result.added} | Total: ${result.total}`);
    await sleep(DELAY_BETWEEN_ROUNDS);
  }
}

if (require.main === module) {
  runLoop().catch((error) => {
    console.error('autoScraper failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  runAutoScraper,
  runLoop
};

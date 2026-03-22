const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "../data/videos.json");

const provider = (id) => `https://www.pornhub.com/embed/${id}`;

// 🔥 ตั้งค่า
const MAX_PER_ROUND = 300;
const DELAY_BETWEEN_PAGES = 4000;
const DELAY_BETWEEN_ROUNDS = 20000;
const MAX_PAGES = 10;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadOld() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    return [];
  }
}

function save(videos) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(videos, null, 2));
}

async function scrapePage(page) {
  const url =
    page === 1
      ? "https://www.pornhub.com/video?o=ht"
      : `https://www.pornhub.com/video?o=ht&page=${page}`;

  try {
    const res = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      timeout: 10000
    });

    const $ = cheerio.load(res.data);
    const results = [];

    $(".pcVideoListItem").each((i, el) => {
      const link = $(el).find("a").attr("href");
      const title = $(el).find("a").attr("title");

      const match = link && link.match(/viewkey=([\w\d]+)/);
      if (!match) return;

      const videoId = match[1];

      const img = $(el).find("img").first();

      // 🔥 FIX THUMBNAIL
      let thumbnail =
        img.attr("data-mediumthumb") ||
        img.attr("data-path") ||
        img.attr("data-src") ||
        img.attr("data-original") ||
        img.attr("src");

      // ❌ กัน base64 / placeholder
      if (!thumbnail || thumbnail.startsWith("data:")) {
        thumbnail = "";
      }

      // 🔥 fallback (กันไม่มีรูป)
      if (!thumbnail) {
        thumbnail = "https://via.placeholder.com/300x200?text=No+Image";
      }

      results.push({
        id: `pornhub_${videoId}`,
        title: title || "🔥 คลิปมาแรง",
        source: "pornhub",
        videoId,
        embedUrl: provider(videoId),
        thumbnail,
        createdAt: Date.now()
      });
    });

    console.log(`📄 Page ${page}: ${results.length} clips`);
    return results;
  } catch (err) {
    console.log(`❌ Page ${page} error:`, err.message);
    return [];
  }
}

async function runLoop() {
  while (true) {
    console.log("🚀 Start scraping round...");

    let collected = [];
    let page = 1;

    while (collected.length < MAX_PER_ROUND && page <= MAX_PAGES) {
      const data = await scrapePage(page);

      collected.push(...data);
      page++;

      await sleep(DELAY_BETWEEN_PAGES);
    }

    const old = loadOld();

    const map = new Map();

    [...collected, ...old].forEach((v) => {
      map.set(v.id, v);
    });

    const merged = Array.from(map.values());

    save(merged);

    console.log(
      `✅ Round done: +${collected.length} | Total: ${merged.length}`
    );

    await sleep(DELAY_BETWEEN_ROUNDS);
  }
}

runLoop();
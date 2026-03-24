const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "../data/videos.json");

// 🔥 ตั้งค่า
const MAX_PER_ROUND = 300;
const DELAY_BETWEEN_PAGES = 4000;
const DELAY_BETWEEN_ROUNDS = 20000;
const MAX_PAGES = 5;

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

// =========================
// 🔥 SCRAPER 1
// =========================
async function scrapeMlivevkx(page) {
  const url =
    page === 1
      ? "https://mlivevkx.net/category/thlive/"
      : `https://mlivevkx.net/category/thlive/page/${page}/`;

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    const results = [];

    $("article").each((i, el) => {
      const link = $(el).find("a").attr("href");
      const title = $(el).find("a").text().trim();
      const thumbnail = $(el).find("img").attr("src");

      if (!link) return;

      const id = link.split("/").filter(Boolean).pop();

      results.push({
        id: `mlivevkx_${id}`,
        title: title || "🔥 คลิป",
        source: "mlivevkx",
        videoId: id,
        embedUrl: link,
        thumbnail: thumbnail || "",
        createdAt: Date.now()
      });
    });

    console.log(`📄 mlivevkx page ${page}: ${results.length}`);
    return results;
  } catch (err) {
    console.log("❌ mlivevkx error:", err.message);
    return [];
  }
}

// =========================
// 🔥 SCRAPER 2
// =========================
async function scrapeMlivehub(page) {
  const url =
    page === 1
      ? "https://mlivehub3.com/category/%E0%B8%84%E0%B8%A5%E0%B8%B4%E0%B8%9B%E0%B8%AB%E0%B8%A5%E0%B8%B8%E0%B8%94-thlive/"
      : `https://mlivehub3.com/category/%E0%B8%84%E0%B8%A5%E0%B8%B4%E0%B8%9B%E0%B8%AB%E0%B8%A5%E0%B8%B8%E0%B8%94-thlive/page/${page}/`;

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    const results = [];

    $("article").each((i, el) => {
      const link = $(el).find("a").attr("href");
      const title = $(el).find("a").text().trim();
      const thumbnail = $(el).find("img").attr("src");

      if (!link) return;

      const id = link.split("/").filter(Boolean).pop();

      results.push({
        id: `mlivehub_${id}`,
        title: title || "🔥 คลิป",
        source: "mlivehub",
        videoId: id,
        embedUrl: link,
        thumbnail: thumbnail || "",
        createdAt: Date.now()
      });
    });

    console.log(`📄 mlivehub page ${page}: ${results.length}`);
    return results;
  } catch (err) {
    console.log("❌ mlivehub error:", err.message);
    return [];
  }
}

// =========================
// 🔥 LOOP หลัก
// =========================
async function runLoop() {
  while (true) {
    console.log("🚀 Start scraping round...");

    let collected = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const a = await scrapeMlivevkx(page);
      const b = await scrapeMlivehub(page);

      collected.push(...a, ...b);

      if (collected.length >= MAX_PER_ROUND) break;

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
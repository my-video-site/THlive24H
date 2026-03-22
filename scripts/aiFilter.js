const fs = require('fs/promises');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'videos.json');

const TRENDING_KEYWORDS = ['trending', 'hot', 'viral', 'new', 'top', 'best', 'live', 'must watch'];

function getKeywordScore(title) {
  const normalized = String(title || '').toLowerCase();
  return TRENDING_KEYWORDS.reduce((score, keyword) => {
    return normalized.includes(keyword) ? score + 8 : score;
  }, 0);
}

function getLengthScore(title) {
  const length = String(title || '').trim().length;
  if (length >= 28 && length <= 72) return 20;
  if (length >= 16 && length <= 90) return 12;
  return 4;
}

function getFreshnessScore(date) {
  const createdAt = new Date(date).getTime();
  if (!createdAt) return 0;
  const hours = Math.max(0, (Date.now() - createdAt) / 3600000);
  if (hours <= 24) return 20;
  if (hours <= 72) return 12;
  if (hours <= 168) return 6;
  return 2;
}

function computeScore(video) {
  const randomScore = Math.floor(Math.random() * 51);
  const keywordScore = getKeywordScore(video.title);
  const lengthScore = getLengthScore(video.title);
  const freshnessScore = getFreshnessScore(video.createdAt || video.updatedAt);
  return {
    ...video,
    score: randomScore + keywordScore + lengthScore + freshnessScore
  };
}

async function runAiFilter() {
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const videos = JSON.parse(raw);

  const ranked = videos
    .map(computeScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((video, index) => ({
      ...video,
      rank: index + 1,
      updatedAt: new Date().toISOString()
    }));

  await fs.writeFile(DATA_FILE, JSON.stringify(ranked, null, 2));
  return ranked;
}

if (require.main === module) {
  runAiFilter()
    .then((result) => console.log(`AI filter ranked ${result.length} videos.`))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  runAiFilter,
  computeScore
};

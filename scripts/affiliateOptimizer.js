const fs = require('fs/promises');
const path = require('path');

const VIDEOS_FILE = path.join(__dirname, '..', 'data', 'videos.json');
const ADS_FILE = path.join(__dirname, '..', 'data', 'ads.json');

const MESSAGES = [
  '🔥 ดูคลิปนี้ + ดีลแรงวันนี้',
  '💥 ของที่ใช้ในคลิป คลิกดูเลย',
  '🚀 Creator setup ราคาพิเศษ',
  '⚡ โปรลับสำหรับสายคอนเทนต์'
];

function randomFrom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function runAffiliateOptimizer() {
  const [videosRaw, adsRaw] = await Promise.all([
    fs.readFile(VIDEOS_FILE, 'utf8'),
    fs.readFile(ADS_FILE, 'utf8')
  ]);

  const videos = JSON.parse(videosRaw);
  const ads = JSON.parse(adsRaw).filter((ad) => ad.active);

  if (!ads.length) {
    await fs.writeFile(VIDEOS_FILE, JSON.stringify(videos, null, 2));
    return videos;
  }

  const optimized = videos.map((video, index) => {
    const buttonAd = ads[index % ads.length];
    const popupAd = ads[(index + 1) % ads.length];
    const prerollAd = ads[(index + 2) % ads.length];

    return {
      ...video,
      featuredAdId: buttonAd.id,
      affiliateSlots: {
        button: {
          ...buttonAd,
          message: randomFrom(MESSAGES)
        },
        popup: {
          ...popupAd,
          message: randomFrom(MESSAGES)
        },
        preroll: {
          ...prerollAd,
          message: randomFrom(MESSAGES)
        }
      },
      updatedAt: new Date().toISOString()
    };
  });

  await fs.writeFile(VIDEOS_FILE, JSON.stringify(optimized, null, 2));
  return optimized;
}

if (require.main === module) {
  runAffiliateOptimizer()
    .then((result) => console.log(`Affiliate optimizer updated ${result.length} videos.`))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  runAffiliateOptimizer
};

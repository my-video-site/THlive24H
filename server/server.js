const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');

const { signToken, hashPassword } = require('./auth');
const { sanitizeInput, rateLimit, requireAuth, logEvent } = require('./middleware');
const { runAutoScraper } = require('../scripts/autoScraper');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const FILES = {
  videos: path.join(DATA_DIR, 'videos.json'),
  ads: path.join(DATA_DIR, 'ads.json'),
  users: path.join(DATA_DIR, 'users.json'),
  logs: path.join(DATA_DIR, 'logs.json')
};

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false
  })
);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);
app.use(rateLimit());
app.use(express.static(PUBLIC_DIR));

async function readJson(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

function ensureLogsShape(logs) {
  const safeLogs = logs && typeof logs === 'object' ? logs : {};
  const events = Array.isArray(safeLogs.events) ? safeLogs.events : [];
  const analytics = safeLogs.analytics && typeof safeLogs.analytics === 'object'
    ? safeLogs.analytics
    : {};

  return {
    events,
    analytics: {
      views: Number(analytics.views || 0),
      clicks: Number(analytics.clicks || 0),
      topVideos: Array.isArray(analytics.topVideos) ? analytics.topVideos : []
    }
  };
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPublicFileUrl(req, filename) {
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
}

function getBaseUrl(req) {
  return String(process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildVideoPageUrl(req, videoId) {
  return `${getBaseUrl(req)}/watch/${encodeURIComponent(videoId)}`;
}

function buildVideoSeo(video, req) {
  const title = `${String(video.title || 'ดูคลิป').trim()} | THlive24H`;
  const description = `ดูคลิป ${String(video.title || '').trim()} บน THlive24H พร้อมหน้าเล่นคลิปที่เปิดง่ายบนมือถือและเดสก์ท็อป`;
  const canonical = buildVideoPageUrl(req, video.id);
  const image = String(video.thumbnail || `${getBaseUrl(req)}/favicon.ico`).trim();

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: String(video.title || 'THlive24H'),
    description,
    thumbnailUrl: image ? [image] : [],
    uploadDate: new Date(video.createdAt || Date.now()).toISOString(),
    embedUrl: video.embedUrl || canonical,
    contentUrl: video.url || video.embedUrl || canonical,
    url: canonical,
    publisher: {
      '@type': 'Organization',
      name: 'THlive24H'
    }
  };

  return {
    title,
    description,
    canonical,
    image,
    structuredData: JSON.stringify(structuredData)
  };
}

function injectVideoSeo(html, seo) {
  const metaBlock = `
    <title>${escapeHtml(seo.title)}</title>
    <meta name="description" content="${escapeHtml(seo.description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${escapeHtml(seo.canonical)}" />
    <meta property="og:type" content="video.other" />
    <meta property="og:title" content="${escapeHtml(seo.title)}" />
    <meta property="og:description" content="${escapeHtml(seo.description)}" />
    <meta property="og:url" content="${escapeHtml(seo.canonical)}" />
    <meta property="og:image" content="${escapeHtml(seo.image)}" />
    <meta property="og:site_name" content="THlive24H" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(seo.title)}" />
    <meta name="twitter:description" content="${escapeHtml(seo.description)}" />
    <meta name="twitter:image" content="${escapeHtml(seo.image)}" />
    <script type="application/ld+json">${seo.structuredData}</script>
  `;

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, metaBlock)
    .replace('<body data-page="video">', `<body data-page="video" data-video-id="${escapeHtml(seo.canonical.split('/').pop())}">`);
}

function resolveUploadedFilePath(fileUrl) {
  const value = String(fileUrl || '').trim();
  if (!value) return null;

  try {
    const url = new URL(value, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname || '');
    if (!pathname.startsWith('/uploads/')) {
      return null;
    }

    const filename = path.basename(pathname);
    if (!filename) return null;
    return path.join(UPLOADS_DIR, filename);
  } catch (error) {
    return null;
  }
}

async function deleteUploadedAssets(ad) {
  const assetPaths = [resolveUploadedFilePath(ad?.image), resolveUploadedFilePath(ad?.mediaUrl)].filter(Boolean);

  await Promise.all(
    assetPaths.map(async (assetPath) => {
      await fs.unlink(assetPath).catch(() => {});
    })
  );
}

function deriveVideoCategory(video) {
  if (video.category) {
    return String(video.category).trim();
  }

  if (Array.isArray(video.tags) && video.tags.length) {
    return String(video.tags[0]).trim();
  }

  const source = String(video.source || '').toLowerCase();
  const sourceLabels = {
    youtube: 'YouTube',
    vimeo: 'Vimeo',
    dailymotion: 'Dailymotion',
    demo: 'เดโม',
    python: 'Python Bridge'
  };

  return sourceLabels[source] || 'ทั่วไป';
}

function normalizeVideoRecord(video, index = 0) {
  return {
    ...video,
    category: deriveVideoCategory(video),
    displayViews: deriveFakeViews(video, index)
  };
}

async function updateTopVideos() {
  const [videos, rawLogs] = await Promise.all([readJson(FILES.videos), readJson(FILES.logs)]);
  const logs = ensureLogsShape(rawLogs);
  logs.analytics.topVideos = [...videos]
    .sort((a, b) => (b.views || 0) + (b.clicks || 0) - ((a.views || 0) + (a.clicks || 0)))
    .slice(0, 10)
    .map((video) => ({
      id: video.id,
      title: video.title,
      views: video.views || 0,
      clicks: video.clicks || 0,
      score: video.score || 0
    }));
  await writeJson(FILES.logs, logs);
}

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const users = await readJson(FILES.users);
  const user = users.find(
    (item) => item.username === username && item.passwordHash === hashPassword(password)
  );

  if (!user) {
    await logEvent('login.failed', { username });
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = signToken(user);
  await logEvent('login.success', { username: user.username });
  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    }
  });
});

app.get('/videos', async (req, res) => {
  const videos = await readJson(FILES.videos);
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 40), 1), 100);
  const q = String(req.query.q || '').toLowerCase();
  const source = String(req.query.source || '').toLowerCase();
  const category = String(req.query.category || '').toLowerCase();

  let filtered = videos.map((video, index) => normalizeVideoRecord(video, index));
  if (q) {
    filtered = filtered.filter((video) => video.title.toLowerCase().includes(q));
  }
  if (source) {
    filtered = filtered.filter((video) => String(video.source).toLowerCase() === source);
  }
  if (category) {
    filtered = filtered.filter((video) => String(video.category || '').toLowerCase() === category);
  }

  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit).map((video, index) => normalizeVideoRecord(video, start + index));

  return res.json({
    items,
    page,
    limit,
    total: filtered.length,
    hasMore: start + limit < filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / limit))
  });
});

app.get('/videos/categories', async (req, res) => {
  const videos = (await readJson(FILES.videos)).map((video, index) => normalizeVideoRecord(video, index));
  const counts = new Map();

  videos.forEach((video) => {
    const category = String(video.category || 'ทั่วไป');
    counts.set(category, (counts.get(category) || 0) + 1);
  });

  const items = [...counts.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return res.json({ items });
});

function deriveFakeViews(video, index = 0) {
  const seed = String(video.id || video.videoId || index)
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const scoreBoost = Number(video.score || 0) * 1937;
  const base = 15000 + seed * 321 + scoreBoost;
  if (base >= 1000000) {
    return Math.min(base, 9500000);
  }
  if (base >= 100000) {
    return base;
  }
  return 10000 + (base % 900000);
}

app.post('/videos', requireAuth, async (req, res) => {
  const { title, source, videoId, embedUrl, url, thumbnail, category } = req.body;
  if (!title || !source || !videoId || !embedUrl) {
    return res.status(400).json({ error: 'title, source, videoId, and embedUrl are required.' });
  }

  const videos = await readJson(FILES.videos);
  const record = {
    id: createId('video'),
    title,
    source,
    videoId,
    embedUrl,
    url: url || '',
    thumbnail: thumbnail || '',
    category: category || '',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    views: 0,
    clicks: 0,
    score: 0,
    rank: null,
    featuredAdId: null,
    affiliateSlots: {}
  };

  videos.unshift(record);
  await writeJson(FILES.videos, videos);
  await updateTopVideos();
  await logEvent('video.create', { id: record.id, title: record.title });
  return res.status(201).json(record);
});

app.delete('/videos/:id', requireAuth, async (req, res) => {
  const videos = await readJson(FILES.videos);
  const nextVideos = videos.filter((video) => video.id !== req.params.id);

  if (nextVideos.length === videos.length) {
    return res.status(404).json({ error: 'Video not found.' });
  }

  await writeJson(FILES.videos, nextVideos);
  await updateTopVideos();
  await logEvent('video.delete', { id: req.params.id });
  return res.json({ success: true });
});

app.delete('/videos', requireAuth, async (req, res) => {
  await writeJson(FILES.videos, []);
  await updateTopVideos();
  await logEvent('video.delete_all', { by: req.user?.username || 'admin' });
  return res.json({ success: true });
});

app.get('/videos/:id', async (req, res) => {
  const videos = await readJson(FILES.videos);
  const logs = ensureLogsShape(await readJson(FILES.logs));
  const index = videos.findIndex((video) => video.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Video not found.' });
  }

  videos[index].views = (videos[index].views || 0) + 1;
  videos[index].updatedAt = new Date().toISOString();
  logs.analytics.views += 1;

  await Promise.all([writeJson(FILES.videos, videos), writeJson(FILES.logs, logs)]);
  await updateTopVideos();
  await logEvent('video.view', { id: videos[index].id });

  const related = videos.filter((video) => video.id !== req.params.id).slice(0, 6);
  return res.json({
    video: normalizeVideoRecord(videos[index], index),
    related: related.map((video, relatedIndex) => normalizeVideoRecord(video, relatedIndex))
  });
});

app.post('/videos/:id/click', async (req, res) => {
  const videos = await readJson(FILES.videos);
  const logs = ensureLogsShape(await readJson(FILES.logs));
  const index = videos.findIndex((video) => video.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Video not found.' });
  }

  videos[index].clicks = (videos[index].clicks || 0) + 1;
  logs.analytics.clicks += 1;

  await Promise.all([writeJson(FILES.videos, videos), writeJson(FILES.logs, logs)]);
  await updateTopVideos();
  await logEvent('affiliate.click', { id: videos[index].id });
  return res.json({ success: true });
});

app.get('/ads', async (req, res) => {
  const ads = await readJson(FILES.ads);
  return res.json(ads);
});

app.post('/ads', requireAuth, async (req, res) => {
  const { title, message, link, image, mediaUrl, cta, slot } = req.body;
  if (!slot) {
    return res.status(400).json({ error: 'slot is required.' });
  }

  if (slot === 'O1' && !link) {
    return res.status(400).json({ error: 'O1 requires link only.' });
  }

  if (/^E[1-5]$/.test(slot) && !mediaUrl) {
    return res.status(400).json({ error: 'E1-E5 require mediaUrl.' });
  }

  if (/^[ABCD][1-4]$/.test(slot) || ['C1', 'C2', 'D1', 'D2', 'D3', 'button', 'popup'].includes(slot)) {
    if (!image) {
      return res.status(400).json({ error: 'This slot requires image.' });
    }
  }

  const ads = await readJson(FILES.ads);
  const record = {
    id: createId('ad'),
    title: title || '',
    message: message || '',
    link: link || '',
    image: image || '',
    mediaUrl: mediaUrl || '',
    cta: cta || 'Learn More',
    slot: slot || 'button',
    active: true,
    clicks: 0,
    views: 0,
    createdAt: new Date().toISOString()
  };

  ads.unshift(record);
  await writeJson(FILES.ads, ads);
  await logEvent('ad.create', { id: record.id, title: record.title });
  return res.status(201).json(record);
});

app.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  const kind = String(req.body.kind || '').toLowerCase();
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'file is required.' });
  }

  const mime = String(file.mimetype || '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');

  if (kind === 'image' && !isImage) {
    await fs.unlink(file.path).catch(() => {});
    return res.status(400).json({ error: 'Please upload an image file.' });
  }

  if (kind === 'video' && !isVideo) {
    await fs.unlink(file.path).catch(() => {});
    return res.status(400).json({ error: 'Please upload a video file.' });
  }

  if (!isImage && !isVideo) {
    await fs.unlink(file.path).catch(() => {});
    return res.status(400).json({ error: 'Only image or video files are allowed.' });
  }

  const url = buildPublicFileUrl(req, file.filename);
  await logEvent('upload.create', {
    kind: isVideo ? 'video' : 'image',
    filename: file.filename
  });

  return res.status(201).json({
    success: true,
    kind: isVideo ? 'video' : 'image',
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
    url
  });
});

app.delete('/ads/:id', requireAuth, async (req, res) => {
  const ads = await readJson(FILES.ads);
  const targetAd = ads.find((ad) => ad.id === req.params.id);
  const nextAds = ads.filter((ad) => ad.id !== req.params.id);

  if (nextAds.length === ads.length) {
    return res.status(404).json({ error: 'Ad not found.' });
  }

  await deleteUploadedAssets(targetAd);
  await writeJson(FILES.ads, nextAds);
  await logEvent('ad.delete', { id: req.params.id });
  return res.json({ success: true });
});

app.get('/analytics', requireAuth, async (req, res) => {
  const [videos, ads, rawLogs] = await Promise.all([
    readJson(FILES.videos),
    readJson(FILES.ads),
    readJson(FILES.logs)
  ]);
  const logs = ensureLogsShape(rawLogs);

  return res.json({
    views: logs.analytics.views || 0,
    clicks: logs.analytics.clicks || 0,
    topVideos: logs.analytics.topVideos || [],
    totalVideos: videos.length,
    totalAds: ads.length,
    recentEvents: logs.events.slice(0, 12)
  });
});

app.get('/robots.txt', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (req, res) => {
  const baseUrl = getBaseUrl(req);
  const videos = await readJson(FILES.videos);
  const urls = [
    {
      loc: `${baseUrl}/`,
      changefreq: 'daily',
      priority: '1.0',
      lastmod: new Date().toISOString()
    },
    ...videos.slice(0, 500).map((video) => ({
      loc: buildVideoPageUrl(req, video.id),
      changefreq: 'daily',
      priority: '0.8',
      lastmod: new Date(video.updatedAt || video.createdAt || Date.now()).toISOString()
    }))
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (item) => `  <url>
    <loc>${item.loc}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.type('application/xml');
  res.send(body);
});

app.get('/feed.xml', async (req, res) => {
  const videos = await readJson(FILES.videos);
  const baseUrl = getBaseUrl(req);
  const items = videos.slice(0, 50).map((video) => {
    const url = buildVideoPageUrl(req, video.id);
    const title = escapeHtml(video.title || 'THlive24H');
    const description = escapeHtml(`ดูคลิป ${video.title || ''} บน THlive24H`);
    const pubDate = new Date(video.updatedAt || video.createdAt || Date.now()).toUTCString();
    return `
      <item>
        <title>${title}</title>
        <link>${url}</link>
        <guid>${url}</guid>
        <pubDate>${pubDate}</pubDate>
        <description>${description}</description>
      </item>`;
  });

  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>THlive24H</title>
    <link>${baseUrl}/</link>
    <description>อัปเดตคลิปล่าสุดจาก THlive24H</description>
    ${items.join('\n')}
  </channel>
</rss>`);
});

app.get('/watch/:id', async (req, res) => {
  const videos = await readJson(FILES.videos);
  const video = videos.find((item) => item.id === req.params.id);
  if (!video) {
    return res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }

  const template = await fs.readFile(path.join(PUBLIC_DIR, 'video.html'), 'utf8');
  const seo = buildVideoSeo(video, req);
  const html = injectVideoSeo(template, seo);
  return res.type('html').send(html);
});

app.post('/admin/run-autoscraper', requireAuth, async (req, res) => {
  const query = String(req.body.query || '');
  const limit = Number(req.body.limit || 20);
  const result = await runAutoScraper({ query, limit });
  await updateTopVideos();
  await logEvent('autoscraper.run_manual', { total: result.total, query, limit });
  return res.json({ success: true, ...result });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, async () => {
  const rawLogs = await readJson(FILES.logs).catch(() => ({}));
  await writeJson(FILES.logs, ensureLogsShape(rawLogs));
  await updateTopVideos().catch(() => {});
  console.log(`StreamBoost AI Pro running on http://localhost:${PORT}`);
});

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
app.use(express.static(PUBLIC_DIR, { index: false }));

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

function isDirectVideoUrl(url) {
  return /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(String(url || '').trim());
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  const slug = String(value || 'video')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'video';
}

function getPublicVideoId(video) {
  return String(video?.videoId || video?.id || '').trim();
}

function buildVideoPageUrl(req, video) {
  return `${getBaseUrl(req)}/watch/${encodeURIComponent(getPublicVideoId(video))}/${slugify(video?.title)}`;
}

function resolveSeoImage(req, imageUrl) {
  const raw = String(imageUrl || '').trim();
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith('/uploads/')) {
    return `${getBaseUrl(req)}${raw}`;
  }

  return `${getBaseUrl(req)}/site-social.svg`;
}

function findVideoIndex(videos, lookupValue) {
  const needle = String(lookupValue || '').trim();
  return videos.findIndex(
    (video) => String(video.id || '').trim() === needle || String(video.videoId || '').trim() === needle
  );
}

function buildHomeSeo(videos, req) {
  const baseUrl = getBaseUrl(req);
  const image = videos
    .map((video) => resolveSeoImage(req, video.thumbnail))
    .find(Boolean) || `${baseUrl}/site-social.svg`;
  const items = videos.slice(0, 12).map((video, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: buildVideoPageUrl(req, video),
    name: String(video.title || 'THlive24H')
  }));

  return {
    image,
    scripts: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'THlive24H',
        url: `${baseUrl}/`,
        logo: `${baseUrl}/site-social.svg`
      },
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'THlive24H',
        url: `${baseUrl}/`,
        description: 'Browse the latest videos, categories, and featured watch pages on THlive24H.',
        primaryImageOfPage: image,
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: items
        }
      }
    ]
  };
}

function injectHomeSeo(html, seo) {
  const block = `
    <meta property="og:image" content="${escapeHtml(seo.image)}" />
    <meta name="twitter:image" content="${escapeHtml(seo.image)}" />
    ${seo.scripts
      .map((item) => `<script type="application/ld+json">${JSON.stringify(item)}</script>`)
      .join('\n    ')}
  `;

  return html.replace('</head>', `${block}\n  </head>`);
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
    displayViews: deriveFakeViews(video, index),
    publicId: getPublicVideoId(video)
  };
}

function buildVideoSeo(video, req) {
  const title = `${String(video.title || 'Watch video').trim()} | THlive24H`;
  const description = `Watch ${String(video.title || 'this video').trim()} on THlive24H. Browse related videos, categories, and the latest updates from the homepage.`;
  const canonical = buildVideoPageUrl(req, video);
  const image = resolveSeoImage(req, video.thumbnail);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: String(video.title || 'THlive24H'),
    description,
    thumbnailUrl: [image],
    uploadDate: new Date(video.createdAt || Date.now()).toISOString(),
    url: canonical,
    mainEntityOfPage: canonical,
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: {
        '@type': 'WatchAction'
      },
      userInteractionCount: Number(video.views || 0)
    },
    publisher: {
      '@type': 'Organization',
      name: 'THlive24H',
      logo: {
        '@type': 'ImageObject',
        url: `${getBaseUrl(req)}/site-social.svg`
      }
    }
  };

  if (isDirectVideoUrl(video.url)) {
    structuredData.contentUrl = video.url;
  } else if (video.embedUrl) {
    structuredData.embedUrl = video.embedUrl;
  }

  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${getBaseUrl(req)}/`
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: String(video.title || 'Video'),
        item: canonical
      }
    ]
  };

  return {
    title,
    description,
    canonical,
    image,
    publicId: getPublicVideoId(video),
    structuredData: JSON.stringify(structuredData),
    breadcrumbData: JSON.stringify(breadcrumbData)
  };
}

function injectVideoSeo(html, seo) {
  const metaBlock = `
    <title>${escapeHtml(seo.title)}</title>
    <meta name="description" content="${escapeHtml(seo.description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
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
    <script type="application/ld+json">${seo.breadcrumbData}</script>
  `;

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, metaBlock)
    .replace('<body data-page="video">', `<body data-page="video" data-video-id="${escapeHtml(seo.publicId)}">`);
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
  const index = findVideoIndex(videos, req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Video not found.' });
  }

  videos[index].views = (videos[index].views || 0) + 1;
  videos[index].updatedAt = new Date().toISOString();
  logs.analytics.views += 1;

  await Promise.all([writeJson(FILES.videos, videos), writeJson(FILES.logs, logs)]);
  await updateTopVideos();
  await logEvent('video.view', { id: videos[index].id });

  const related = videos.filter((video) => video.id !== videos[index].id).slice(0, 6);
  return res.json({
    video: normalizeVideoRecord(videos[index], index),
    related: related.map((video, relatedIndex) => normalizeVideoRecord(video, relatedIndex))
  });
});

app.post('/videos/:id/click', async (req, res) => {
  const videos = await readJson(FILES.videos);
  const logs = ensureLogsShape(await readJson(FILES.logs));
  const index = findVideoIndex(videos, req.params.id);

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

app.get('/', async (req, res) => {
  const [videos, template] = await Promise.all([
    readJson(FILES.videos),
    fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
  ]);
  const seo = buildHomeSeo(videos, req);
  return res.type('html').send(injectHomeSeo(template, seo));
});

app.get('/video.html', async (req, res, next) => {
  const lookupId = String(req.query.id || '').trim();
  if (!lookupId) {
    return next();
  }

  const videos = await readJson(FILES.videos);
  const index = findVideoIndex(videos, lookupId);
  if (index === -1) {
    return next();
  }

  return res.redirect(301, buildVideoPageUrl(req, videos[index]));
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
      loc: buildVideoPageUrl(req, video),
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
    const url = buildVideoPageUrl(req, video);
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

app.get('/watch/:id/:slug?', async (req, res) => {
  const videos = await readJson(FILES.videos);
  const index = findVideoIndex(videos, req.params.id);
  if (index === -1) {
    return res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }

  const video = videos[index];
  const expectedSlug = slugify(video.title);
  if (req.params.slug !== expectedSlug) {
    return res.redirect(301, buildVideoPageUrl(req, video));
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

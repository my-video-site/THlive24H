const page = document.body.dataset.page;

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error('à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸•à¹ˆà¸­à¹€à¸‹à¸´à¸£à¹Œà¸Ÿà¹€à¸§à¸­à¸£à¹Œà¹„à¸¡à¹ˆà¹„à¸”à¹‰ à¸à¸£à¸¸à¸“à¸²à¹€à¸›à¸´à¸” node server/server.js à¸à¹ˆà¸­à¸™');
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'à¹€à¸à¸´à¸”à¸‚à¹‰à¸­à¸œà¸´à¸”à¸žà¸¥à¸²à¸”à¹ƒà¸™à¸à¸²à¸£à¹‚à¸«à¸¥à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥');
  }
  return response.json();
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
  return (
    String(value || 'video')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'video'
  );
}

function buildWatchUrl(video) {
  const publicId = encodeURIComponent(String(video?.publicId || video?.videoId || video?.id || '').trim());
  return `/watch/${publicId}/${slugify(video?.title)}`;
}

function createPosterPlaceholder(video) {
  const source = String(video?.source || 'VIDEO').toUpperCase();
  const title = String(video?.title || 'THlive24H').trim() || 'THlive24H';
  const shortTitle = title.length > 42 ? `${title.slice(0, 39)}...` : title;
  const safeSource = escapeHtml(source);
  const safeTitle = escapeHtml(shortTitle);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 900">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#151515" />
          <stop offset="55%" stop-color="#2f2110" />
          <stop offset="100%" stop-color="#9e7722" />
        </linearGradient>
      </defs>
      <rect width="640" height="900" fill="url(#bg)" />
      <rect x="32" y="32" width="576" height="836" rx="28" fill="rgba(0,0,0,0.22)" stroke="rgba(255,255,255,0.16)" />
      <text x="64" y="128" fill="#f5d06f" font-size="44" font-family="Arial, sans-serif" font-weight="700">${safeSource}</text>
      <text x="64" y="205" fill="#ffffff" font-size="34" font-family="Arial, sans-serif">${safeTitle}</text>
      <circle cx="320" cy="474" r="102" fill="rgba(255,255,255,0.12)" />
      <polygon points="292,420 292,528 388,474" fill="#ffffff" />
      <text x="64" y="805" fill="rgba(255,255,255,0.72)" font-size="24" font-family="Arial, sans-serif">THlive24H</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function isUsableThumbnailUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  return !/^(data:)|px\.gif(?:$|\?)|placeholder|blank\.gif|\/assets\/img\/px\.gif/i.test(value);
}

function buildThumbnailUrl(video) {
  const thumbnail = String(video?.thumbnail || '').trim();
  return isUsableThumbnailUrl(thumbnail) ? thumbnail : createPosterPlaceholder(video);
}

function formatViews(value) {
  return `${Number(value || 0).toLocaleString('th-TH')} à¸„à¸£à¸±à¹‰à¸‡`;
}

function createSlotRenderer(slotSelector = '.ad-slot[data-slot]') {
  const slotMap = new Map();
  document.querySelectorAll(slotSelector).forEach((node) => {
    slotMap.set(node.dataset.slot, node);
  });

  function fillAdPlaceholders() {
    slotMap.forEach((slot) => {
      if (!slot.innerHTML.trim()) {
        slot.innerHTML = '<div class="ad-slot--placeholder">à¸žà¸·à¹‰à¸™à¸—à¸µà¹ˆà¹‚à¸†à¸©à¸“à¸²</div>';
      }
    });
  }

  function closeAdContainer(button) {
    const host = button.closest('.ad-card')?.parentElement;
    if (host) {
      host.innerHTML = '<div class="ad-slot--placeholder">à¸žà¸·à¹‰à¸™à¸—à¸µà¹ˆà¹‚à¸†à¸©à¸“à¸²</div>';
    }
  }

  function buildAdMarkup(ad) {
    const imageHtml = ad.image
      ? `<img class="ad-card__media" src="${escapeHtml(ad.image)}" alt="${escapeHtml(ad.title || ad.slot)}" />`
      : `<div class="ad-card__media"></div>`;

    return `
      <article class="ad-card">
        <button class="ad-card__close" type="button" data-close-ad>Ã—</button>
        ${String(ad.link || '').trim()
          ? `<a class="ad-card__link" href="${escapeHtml(ad.link)}" target="_blank" rel="noreferrer" data-ad-click>${imageHtml}</a>`
          : `<div class="ad-card__link">${imageHtml}</div>`}
      </article>
    `;
  }

  function renderSlotAds(ads, onClick) {
    ads.forEach((ad) => {
      if (/^E[1-5]$/.test(ad.slot)) return;
      const slot = slotMap.get(ad.slot);
      if (!slot) return;
      slot.innerHTML = buildAdMarkup(ad);

      slot.querySelector('[data-close-ad]')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeAdContainer(event.currentTarget);
      });

      slot.querySelector('[data-ad-click]')?.addEventListener('click', () => {
        if (typeof onClick === 'function') {
          onClick(ad);
        }
      });

      slot.querySelector('.ad-card__media')?.addEventListener('error', () => {
        slot.innerHTML = '<div class="ad-slot--placeholder">à¸žà¸·à¹‰à¸™à¸—à¸µà¹ˆà¹‚à¸†à¸©à¸“à¸²</div>';
      });
    });

    fillAdPlaceholders();
  }

  return {
    renderSlotAds,
    fillAdPlaceholders
  };
}

function mountOverlayAd(ads) {
  const overlayAd = ads.find((ad) => ad.active !== false && ad.slot === 'O1' && ad.link);
  if (!overlayAd) return;

  const existing = document.getElementById('o1-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('a');
  overlay.id = 'o1-overlay';
  overlay.className = 'o1-overlay';
  overlay.href = overlayAd.link;
  overlay.target = '_blank';
  overlay.rel = 'noreferrer noopener';
  overlay.setAttribute('aria-label', 'overlay-ad');
  overlay.addEventListener('click', () => {
    overlay.remove();
  });
  document.body.appendChild(overlay);
}

function buildVideoCard(template, video) {
  const node = template.content.cloneNode(true);
  const image = node.querySelector('[data-video-image]');

  node.querySelector('[data-video-link]').href = buildWatchUrl(video);
  image.src = buildThumbnailUrl(video);
  image.alt = video.title;
  image.loading = 'lazy';
  image.onerror = () => {
    image.onerror = null;
    image.src = createPosterPlaceholder(video);
  };

  const categoryNode = node.querySelector('[data-video-category]');
  const viewsNode = node.querySelector('[data-video-views]');
  const rankNode = node.querySelector('[data-video-rank]');

  if (rankNode) {
    rankNode.textContent = video.rank ? `à¸­à¸±à¸™à¸”à¸±à¸š ${video.rank}` : 'à¸¡à¸²à¹ƒà¸«à¸¡à¹ˆ';
  }

  node.querySelector('[data-video-source]').textContent = String(video.source || '').toUpperCase();
  if (categoryNode) {
    categoryNode.textContent = video.category || 'à¸—à¸±à¹ˆà¸§à¹„à¸›';
  }
  if (viewsNode) {
    viewsNode.textContent = formatViews(video.displayViews || video.views || 0);
  }
  node.querySelector('[data-video-title]').textContent = video.title;

  return node;
}

function renderCardList(container, template, items, emptyText) {
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = `<div class="panel panel--empty"><p>${emptyText}</p></div>`;
    return;
  }

  items.forEach((video) => {
    container.appendChild(buildVideoCard(template, video));
  });
}

if (page === 'index') {
  const indexParams = new URLSearchParams(window.location.search);
  const state = {
    page: 1,
    limit: 40,
    loading: false,
    query: indexParams.get('q') || '',
    source: indexParams.get('source') || '',
    category: indexParams.get('category') || '',
    loaded: [],
    total: 0,
    totalPages: 1,
    overviewItems: [],
    categories: []
  };

  const grid = document.getElementById('video-grid');
  const latestGrid = document.getElementById('latest-grid');
  const popularGrid = document.getElementById('popular-grid');
  const categoryTabGrid = document.getElementById('category-tab-grid');
  const categoryPills = document.getElementById('category-pills');
  const loadingIndicator = document.getElementById('loading-indicator');
  const template = document.getElementById('video-card-template');
  const statsRow = document.getElementById('stats-row');
  const pagination = document.getElementById('pagination');
  const sourceFilter = document.getElementById('source-filter');
  const categoryFilter = document.getElementById('category-filter');
  const searchInput = document.getElementById('search-input');
  const slotRenderer = createSlotRenderer();

  searchInput.value = state.query;
  sourceFilter.value = state.source;

  function renderStats(items) {
    const categories = new Set(items.map((item) => item.category || 'à¸—à¸±à¹ˆà¸§à¹„à¸›')).size;

    statsRow.innerHTML = `
      <div class="metric-card"><span>à¸„à¸¥à¸´à¸›à¸—à¸µà¹ˆà¸žà¸š</span><strong>${state.total}</strong></div>
      <div class="metric-card"><span>à¸«à¸¡à¸§à¸”à¸«à¸¡à¸¹à¹ˆ</span><strong>${categories}</strong></div>
      <div class="metric-card"><span>à¹à¸«à¸¥à¹ˆà¸‡à¸—à¸µà¹ˆà¸¡à¸²</span><strong>${sources}</strong></div>
    `;
  }

  renderStats = function (items) {
    const categories = new Set(items.map((item) => item.category || 'à¸—à¸±à¹ˆà¸§à¹„à¸›')).size;

    statsRow.innerHTML = `
      <div class="metric-card"><span>à¸„à¸¥à¸´à¸›à¸—à¸µà¹ˆà¸žà¸š</span><strong>${state.total}</strong></div>
      <div class="metric-card"><span>à¸«à¸¡à¸§à¸”à¸«à¸¡à¸¹à¹ˆ</span><strong>${categories}</strong></div>
      <div class="metric-card"><span>à¹à¸ªà¸”à¸‡à¹ƒà¸™à¸«à¸™à¹‰à¸²à¸™à¸µà¹‰</span><strong>${items.length}</strong></div>
    `;
  };

  function renderPagination() {
    pagination.innerHTML = '';

    const info = document.createElement('div');
    info.className = 'pagination__info';
    info.textContent = `à¸«à¸™à¹‰à¸² ${state.page} / ${state.totalPages} , à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸” ${state.total} à¸„à¸¥à¸´à¸›`;
    pagination.appendChild(info);

    const prev = document.createElement('button');
    prev.className = 'button button--ghost';
    prev.textContent = 'à¸à¹ˆà¸­à¸™à¸«à¸™à¹‰à¸²';
    prev.disabled = state.page <= 1;
    prev.addEventListener('click', () => {
      if (state.page > 1) {
        state.page -= 1;
        loadVideos();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    pagination.appendChild(prev);

    const startPage = Math.max(1, state.page - 2);
    const endPage = Math.min(state.totalPages, state.page + 2);
    for (let i = startPage; i <= endPage; i += 1) {
      const pageButton = document.createElement('button');
      pageButton.className = `button button--ghost${i === state.page ? ' is-active' : ''}`;
      pageButton.textContent = String(i);
      pageButton.addEventListener('click', () => {
        state.page = i;
        loadVideos();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      pagination.appendChild(pageButton);
    }

    const next = document.createElement('button');
    next.className = 'button button--ghost';
    next.textContent = 'à¸–à¸±à¸”à¹„à¸›';
    next.disabled = state.page >= state.totalPages;
    next.addEventListener('click', () => {
      if (state.page < state.totalPages) {
        state.page += 1;
        loadVideos();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    pagination.appendChild(next);
  }

  function renderCategoryFilter() {
    categoryFilter.innerHTML = '<option value="">à¸—à¸¸à¸à¸«à¸¡à¸§à¸”à¸«à¸¡à¸¹à¹ˆ</option>';
    state.categories.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.name;
      option.textContent = `${item.name} (${item.total})`;
      if (item.name === state.category) {
        option.selected = true;
      }
      categoryFilter.appendChild(option);
    });
  }

  function renderCategoryPills() {
    categoryPills.innerHTML = '';
    const allButton = document.createElement('button');
    allButton.className = `category-pill${!state.category ? ' is-active' : ''}`;
    allButton.textContent = 'à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”';
    allButton.addEventListener('click', () => {
      state.category = '';
      categoryFilter.value = '';
      state.page = 1;
      loadVideos();
    });
    categoryPills.appendChild(allButton);

    state.categories.slice(0, 8).forEach((item) => {
      const button = document.createElement('button');
      button.className = `category-pill${state.category === item.name ? ' is-active' : ''}`;
      button.textContent = item.name;
      button.addEventListener('click', () => {
        state.category = item.name;
        categoryFilter.value = item.name;
        state.page = 1;
        loadVideos();
      });
      categoryPills.appendChild(button);
    });
  }

  function renderOverviewSections() {
    const latest = [...state.overviewItems]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 8);
    const popular = [...state.overviewItems]
      .sort((a, b) => (b.displayViews || 0) - (a.displayViews || 0))
      .slice(0, 8);

    renderCardList(latestGrid, template, latest, 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸„à¸¥à¸´à¸›à¹ƒà¸«à¸¡à¹ˆ');
    renderCardList(popularGrid, template, popular, 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸„à¸¥à¸´à¸›à¸¢à¸­à¸”à¸™à¸´à¸¢à¸¡');
    const activeCategory = state.category || state.categories[0]?.name || '';
    const groupItems = activeCategory
      ? state.overviewItems
          .filter((video) => String(video.category || 'à¸—à¸±à¹ˆà¸§à¹„à¸›') === activeCategory)
          .slice(0, 8)
      : state.overviewItems.slice(0, 8);

    renderCardList(categoryTabGrid, template, groupItems, 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸„à¸¥à¸´à¸›à¹ƒà¸™à¸«à¸¡à¸§à¸”à¸™à¸µà¹‰');
  }

  async function loadOverview() {
    const [overviewData, categoryData] = await Promise.all([
      request('/videos?limit=120'),
      request('/videos/categories')
    ]);

    state.overviewItems = overviewData.items || [];
    state.categories = categoryData.items || [];
    renderCategoryFilter();
    renderCategoryPills();
    renderOverviewSections();
  }

  async function loadVideos() {
    if (state.loading) return;
    state.loading = true;
    loadingIndicator.style.display = 'block';
    loadingIndicator.textContent = 'à¸à¸³à¸¥à¸±à¸‡à¹‚à¸«à¸¥à¸”à¸„à¸¥à¸´à¸›...';

    try {
      const data = await request(
        `/videos?page=${state.page}&limit=${state.limit}&q=${encodeURIComponent(state.query)}&source=${encodeURIComponent(state.source)}&category=${encodeURIComponent(state.category)}`
      );

      state.loaded = data.items;
      state.total = data.total;
      state.totalPages = data.totalPages || 1;

      renderCardList(grid, template, data.items, 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸žà¸šà¸„à¸¥à¸´à¸›à¸—à¸µà¹ˆà¸•à¸£à¸‡à¸à¸±à¸šà¸•à¸±à¸§à¸à¸£à¸­à¸‡à¸™à¸µà¹‰');
      renderStats(state.loaded);
      renderPagination();
    } catch (error) {
      grid.innerHTML = `<div class="panel panel--empty"><p>${escapeHtml(error.message)}</p></div>`;
      pagination.innerHTML = '';
    } finally {
      state.loading = false;
      loadingIndicator.style.display = 'none';
    }
  }

  async function handleFilterChange() {
    state.query = searchInput.value.trim();
    state.source = sourceFilter.value;
    state.category = categoryFilter.value;
    state.page = 1;
    renderCategoryPills();
    await loadVideos();
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(window.__streamboostSearchTimer);
    window.__streamboostSearchTimer = setTimeout(handleFilterChange, 250);
  });

  sourceFilter.addEventListener('change', handleFilterChange);
  categoryFilter.addEventListener('change', handleFilterChange);

  request('/ads')
    .then((ads) => {
      const activeAds = ads.filter((ad) => ad.active !== false);
      slotRenderer.renderSlotAds(activeAds, () => {});
      mountOverlayAd(activeAds);
    })
    .catch(() => {
      slotRenderer.fillAdPlaceholders();
    });

  Promise.all([loadOverview(), loadVideos()]).catch((error) => {
    loadingIndicator.textContent = error.message;
  });
}

if (page === 'video') {
  const params = new URLSearchParams(window.location.search);
  const pathSegments = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/');
  const pathId = pathSegments[0] === 'watch' ? decodeURIComponent(pathSegments[1] || '') : '';
  const id = params.get('id') || pathId;
  const slotRenderer = createSlotRenderer();
  let artplayerInstance = null;

  const elements = {
    artShell: document.getElementById('artplayer-shell'),
    artContainer: document.getElementById('artplayer-app'),
    frame: document.getElementById('video-frame'),
    source: document.getElementById('video-source'),
    category: document.getElementById('video-category'),
    title: document.getElementById('video-title'),
    views: document.getElementById('video-views'),
    banner: document.getElementById('affiliate-banner'),
    related: document.getElementById('related-videos'),
    preroll: document.getElementById('preroll-overlay'),
    prerollTitle: document.getElementById('preroll-title'),
    prerollMessage: document.getElementById('preroll-message'),
    prerollLink: document.getElementById('preroll-link'),
    prerollMediaWrap: document.getElementById('preroll-media-wrap'),
    prerollClose: document.getElementById('preroll-close-button'),
    skip: document.getElementById('skip-preroll'),
    popup: document.getElementById('offer-popup'),
    popupTitle: document.getElementById('popup-title'),
    popupMessage: document.getElementById('popup-message'),
    popupLink: document.getElementById('popup-link'),
    popupTrigger: document.getElementById('popup-trigger')
  };

  let prerollAds = [];
  let prerollIndex = 0;
  let prerollCountdown = 5;
  let prerollTimer = null;
  let activeEmbedUrl = '';

  function isDirectVideoUrl(url) {
    return /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(String(url || '').trim());
  }

  function destroyPlayer() {
    if (artplayerInstance && typeof artplayerInstance.destroy === 'function') {
      artplayerInstance.destroy(false);
    }
    artplayerInstance = null;
  }

  function resetEmbeddedFrame(embedUrl) {
    const nextUrl = String(embedUrl || '').trim();
    elements.frame.src = 'about:blank';
    if (!nextUrl) return;
    window.setTimeout(() => {
      elements.frame.src = nextUrl;
    }, 120);
  }

  function mountArtplayer(video) {
    const candidateUrl = video.url || video.embedUrl;
    if (!window.Artplayer || !isDirectVideoUrl(candidateUrl)) {
      return false;
    }

    destroyPlayer();
    activeEmbedUrl = String(video.embedUrl || candidateUrl || '').trim();
    elements.frame.classList.add('hidden');
    elements.artShell.classList.remove('hidden');
    elements.artContainer.innerHTML = '';

    artplayerInstance = new window.Artplayer({
      container: elements.artContainer,
      url: candidateUrl,
      poster: video.thumbnail || '',
      theme: '#f3c95b',
      muted: false,
      autoplay: false,
      autoSize: true,
      autoMini: true
    });

    return true;
  }

  function mountFallbackFrame(video) {
    destroyPlayer();
    activeEmbedUrl = String(video.embedUrl || '').trim();
    elements.artShell.classList.add('hidden');
    elements.frame.classList.remove('hidden');
    resetEmbeddedFrame(activeEmbedUrl);
  }


  function trackClick() {
    return fetch(`/videos/${id}/click`, { method: 'POST' }).catch(() => {});
  }

  function sortPrerollAds(items) {
    return items
      .filter((ad) => /^E[1-5]$/.test(ad.slot))
      .sort((a, b) => Number(a.slot.slice(1)) - Number(b.slot.slice(1)));
  }

  function stopPrerollSequence() {
    clearInterval(prerollTimer);
    prerollTimer = null;
    elements.preroll.classList.add('hidden');
    elements.prerollMediaWrap.innerHTML = '';
  }

  function showPreroll(ad) {
    prerollCountdown = 5;
    elements.skip.disabled = true;
    elements.skip.textContent = `à¸‚à¹‰à¸²à¸¡à¹„à¸”à¹‰à¹ƒà¸™ ${prerollCountdown} à¸§à¸´à¸™à¸²à¸—à¸µ`;
    elements.preroll.querySelector('.preroll__card').classList.add('preroll__titleless');
    elements.prerollTitle.textContent = ad.title || '';
    elements.prerollMessage.textContent = ad.message || '';
    elements.prerollLink.href = ad.link || '#';
    elements.prerollLink.style.display = 'none';

    elements.prerollMediaWrap.innerHTML = ad.mediaUrl
      ? `<video src="${escapeHtml(ad.mediaUrl)}" autoplay muted playsinline controls></video>`
      : ad.image
        ? `<img src="${escapeHtml(ad.image)}" alt="${escapeHtml(ad.title || ad.slot)}" />`
        : '';

    elements.prerollMediaWrap.onclick = () => {
      if (ad.link) {
        window.open(ad.link, '_blank', 'noopener,noreferrer');
        trackClick();
      }
    };

    const videoNode = elements.prerollMediaWrap.querySelector('video');
    if (videoNode) {
      videoNode.addEventListener('ended', () => {
        prerollIndex += 1;
        playNextPreroll();
      });
    }

    clearInterval(prerollTimer);
    prerollTimer = setInterval(() => {
      prerollCountdown -= 1;
      if (prerollCountdown > 0) {
        elements.skip.textContent = `à¸‚à¹‰à¸²à¸¡à¹„à¸”à¹‰à¹ƒà¸™ ${prerollCountdown} à¸§à¸´à¸™à¸²à¸—à¸µ`;
        return;
      }

      clearInterval(prerollTimer);
      prerollTimer = null;
      elements.skip.disabled = false;
      elements.skip.textContent = 'à¸‚à¹‰à¸²à¸¡';
    }, 1000);
  }

  function playNextPreroll() {
    if (prerollIndex >= prerollAds.length) {
      stopPrerollSequence();
      return;
    }

    elements.preroll.classList.remove('hidden');
    showPreroll(prerollAds[prerollIndex]);
  }


  function renderRelated(items) {
    elements.related.innerHTML = items
      .map(
        (item) => `
          <a class="related-item" href="${buildWatchUrl(item)}">
            <span>${escapeHtml(item.title)}</span>
            <strong>${escapeHtml(item.category || 'à¸—à¸±à¹ˆà¸§à¹„à¸›')}</strong>
          </a>
        `
      )
      .join('');
  }

  function wireOfferLink(anchor) {
    if (!anchor) return;
    anchor.addEventListener('click', () => {
      trackClick();
    });
  }

  request(`/videos/${id}`)
    .then(async ({ video, related }) => {
      const usedArtplayer = mountArtplayer(video);
      if (!usedArtplayer) {
        mountFallbackFrame(video);
      }
      elements.source.textContent = `à¹à¸«à¸¥à¹ˆà¸‡à¸—à¸µà¹ˆà¸¡à¸²: ${String(video.source || '').toUpperCase()}`;
      elements.category.textContent = `à¸«à¸¡à¸§à¸”à¸«à¸¡à¸¹à¹ˆ: ${video.category || 'à¸—à¸±à¹ˆà¸§à¹„à¸›'}`;
      elements.title.textContent = video.title;
      elements.views.textContent = `à¸¢à¸­à¸”à¸”à¸¹ ${formatViews(video.displayViews || 0)}`;
      renderRelated(related);

      const buttonAd = video.affiliateSlots?.button;
      const popupAd = video.affiliateSlots?.popup;

      if (buttonAd) {
        elements.banner.innerHTML = `
          <button class="ad-card__close" type="button" id="close-affiliate-banner">Ã—</button>
          ${buttonAd.link
            ? `<a href="${escapeHtml(buttonAd.link)}" target="_blank" rel="noreferrer">
                <img class="ad-card__media" src="${escapeHtml(buttonAd.image || '')}" alt="" />
              </a>`
            : `<div>
                <img class="ad-card__media" src="${escapeHtml(buttonAd.image || '')}" alt="" />
              </div>`}
        `;
        wireOfferLink(elements.banner.querySelector('a'));
        elements.banner.querySelector('#close-affiliate-banner')?.addEventListener('click', () => {
          elements.banner.innerHTML = '<div class="ad-slot--placeholder">à¸žà¸·à¹‰à¸™à¸—à¸µà¹ˆà¹‚à¸†à¸©à¸“à¸²</div>';
        });
      } else {
        elements.banner.innerHTML = '<div class="ad-slot--placeholder">à¸žà¸·à¹‰à¸™à¸—à¸µà¹ˆà¹‚à¸†à¸©à¸“à¸²</div>';
      }

      if (popupAd) {
        elements.popupTitle.textContent = popupAd.title;
        elements.popupMessage.textContent = popupAd.message;
        elements.popupLink.href = popupAd.link || '#';
        elements.popupLink.textContent = popupAd.cta || 'à¹€à¸›à¸´à¸”à¸‚à¹‰à¸­à¹€à¸ªà¸™à¸­';
        elements.popupLink.style.display = popupAd.link ? 'inline-flex' : 'none';
        wireOfferLink(elements.popupLink);
      } else {
        elements.popupTrigger.style.display = 'none';
      }

      const ads = (await request('/ads')).filter((ad) => ad.active !== false);
      slotRenderer.renderSlotAds(ads, () => trackClick());
      mountOverlayAd(ads);
      prerollAds = sortPrerollAds(ads).slice(0, 5);

      if (prerollAds.length) {
        prerollIndex = 0;
        playNextPreroll();
      } else {
        elements.preroll.classList.add('hidden');
      }
    })
    .catch(() => {
      elements.title.textContent = 'à¹„à¸¡à¹ˆà¸žà¸šà¸„à¸¥à¸´à¸›à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸à¸²à¸£';
      elements.preroll.classList.add('hidden');
    });


  elements.skip.addEventListener('click', () => {
    if (elements.skip.disabled) return;
    prerollIndex += 1;
    playNextPreroll();
  });

  elements.prerollClose.addEventListener('click', () => {
    stopPrerollSequence();
  });

  elements.prerollLink.addEventListener('click', () => {
    trackClick();
  });

  elements.popupTrigger.addEventListener('click', () => {
    elements.popup.classList.remove('hidden');
  });

  document.getElementById('popup-close-backdrop').addEventListener('click', () => {
    elements.popup.classList.add('hidden');
  });

  document.getElementById('popup-close-button').addEventListener('click', () => {
    elements.popup.classList.add('hidden');
  });
}

const page = document.body.dataset.page;

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาเปิด node server/server.js ก่อน');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
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

function repairText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/[\u00C3\u00E0\u00E2]/.test(text)) {
    return text;
  }

  try {
    const bytes = Uint8Array.from([...text].map((char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8').decode(bytes).trim();
    return decoded || text;
  } catch (error) {
    return text;
  }
}

function slugify(value) {
  return (
    repairText(value || 'video')
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
  return `/watch/${publicId}/${slugify(video?.displayTitle || video?.title)}`;
}

function isUsableThumbnailUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  return !/^(data:)|px\.gif(?:$|\?)|placeholder|blank\.gif|\/assets\/img\/px\.gif/i.test(value);
}

function createPosterPlaceholder(video) {
  const category = repairText(video?.displayCategory || video?.category || 'ทั่วไป').toUpperCase();
  const title = repairText(video?.displayTitle || video?.title || 'THlive24H');
  const shortTitle = title.length > 38 ? `${title.slice(0, 35)}...` : title;
  const safeCategory = escapeHtml(category);
  const safeTitle = escapeHtml(shortTitle);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 960">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#151515" />
          <stop offset="55%" stop-color="#261f10" />
          <stop offset="100%" stop-color="#8d6718" />
        </linearGradient>
      </defs>
      <rect width="720" height="960" fill="url(#bg)" />
      <rect x="28" y="28" width="664" height="904" rx="28" fill="rgba(0,0,0,0.18)" stroke="rgba(255,255,255,0.16)" />
      <text x="60" y="110" fill="#f5d06f" font-size="40" font-family="Arial, sans-serif" font-weight="700">${safeCategory}</text>
      <text x="60" y="170" fill="#ffffff" font-size="30" font-family="Arial, sans-serif">${safeTitle}</text>
      <circle cx="360" cy="490" r="98" fill="rgba(255,255,255,0.12)" />
      <polygon points="332,440 332,540 420,490" fill="#ffffff" />
      <text x="60" y="860" fill="rgba(255,255,255,0.72)" font-size="24" font-family="Arial, sans-serif">THlive24H</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildThumbnailUrl(video) {
  const thumbnail = String(video?.thumbnail || '').trim();
  return isUsableThumbnailUrl(thumbnail) ? thumbnail : createPosterPlaceholder(video);
}

function formatViews(value) {
  return `${Number(value || 0).toLocaleString('th-TH')} ครั้ง`;
}

function extractDurationFromTitle(title) {
  const text = repairText(title);
  const match = text.match(/(^|\s)(\d{1,2}:\d{2}(?::\d{2})?)(?=\s|$)/);
  return match ? match[2] : '';
}

function stripDurationFromTitle(title) {
  const text = repairText(title)
    .replace(/(^|\s)\d{1,2}:\d{2}(?::\d{2})?(?=\s|$)/, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\-–—|/:\s]+|[\-–—|/:\s]+$/g, '')
    .trim();

  return text || repairText(title);
}

function normalizeVideo(video) {
  const displayTitle = stripDurationFromTitle(video.title || '');
  const duration = extractDurationFromTitle(video.title || '');
  const displayCategory = repairText(video.category || 'ทั่วไป');

  return {
    ...video,
    title: repairText(video.title),
    displayTitle,
    duration,
    displayCategory,
    displayViews: Number(video.displayViews || video.views || 0),
    thumbnail: buildThumbnailUrl(video)
  };
}

function createSlotRenderer(slotSelector = '.ad-slot[data-slot]') {
  const slotMap = new Map();
  document.querySelectorAll(slotSelector).forEach((node) => {
    slotMap.set(node.dataset.slot, node);
  });

  function fillAdPlaceholders() {
    slotMap.forEach((slot) => {
      if (!slot.innerHTML.trim()) {
        slot.innerHTML = '<div class="ad-slot--placeholder">พื้นที่โฆษณา</div>';
      }
    });
  }

  function closeAdContainer(button) {
    const host = button.closest('.ad-card')?.parentElement;
    if (host) {
      host.innerHTML = '<div class="ad-slot--placeholder">พื้นที่โฆษณา</div>';
    }
  }

  function buildAdMarkup(ad) {
    const image = String(ad.image || '').trim();
    const title = repairText(ad.title || ad.slot || 'Advertisement');
    const imageHtml = image
      ? `<img class="ad-card__media" src="${escapeHtml(image)}" alt="${escapeHtml(title)}" />`
      : `<div class="ad-card__media"></div>`;

    if (String(ad.link || '').trim()) {
      return `
        <article class="ad-card">
          <button class="ad-card__close" type="button" data-close-ad>×</button>
          <a class="ad-card__link" href="${escapeHtml(ad.link)}" target="_blank" rel="noreferrer" data-ad-click>
            ${imageHtml}
          </a>
        </article>
      `;
    }

    return `
      <article class="ad-card">
        <button class="ad-card__close" type="button" data-close-ad>×</button>
        <div class="ad-card__link">${imageHtml}</div>
      </article>
    `;
  }

  function renderSlotAds(ads, onClick) {
    ads.forEach((ad) => {
      if (/^E[1-5]$/.test(ad.slot) || ad.slot === 'O1') return;
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
        slot.innerHTML = '<div class="ad-slot--placeholder">พื้นที่โฆษณา</div>';
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
  document.getElementById('o1-overlay')?.remove();
  if (!overlayAd) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'o1-overlay';
  wrapper.className = 'o1-overlay';
  wrapper.innerHTML = `
    <a class="o1-overlay__link" href="${escapeHtml(overlayAd.link)}" target="_blank" rel="noreferrer">
      <strong>โปรโมชัน</strong>
      <span>คลิกดูข้อเสนอวันนี้</span>
    </a>
    <button class="o1-overlay__close" type="button" aria-label="close">×</button>
  `;

  wrapper.querySelector('.o1-overlay__close')?.addEventListener('click', () => {
    wrapper.remove();
  });

  document.body.appendChild(wrapper);
}

function buildVideoCard(template, rawVideo) {
  const video = normalizeVideo(rawVideo);
  const node = template.content.cloneNode(true);
  const link = node.querySelector('[data-video-link]');
  const image = node.querySelector('[data-video-image]');
  const durationNode = node.querySelector('[data-video-duration]');
  const rankNode = node.querySelector('[data-video-rank]');

  link.href = buildWatchUrl(video);
  link.target = '_blank';
  link.rel = 'noreferrer noopener';

  image.src = video.thumbnail;
  image.alt = video.displayTitle;
  image.loading = 'lazy';
  image.onerror = () => {
    image.onerror = null;
    image.src = createPosterPlaceholder(video);
  };

  node.querySelector('[data-video-title]').textContent = video.displayTitle;
  node.querySelector('[data-video-category]').textContent = video.displayCategory;
  node.querySelector('[data-video-views]').textContent = formatViews(video.displayViews);

  if (rankNode) {
    rankNode.textContent = video.rank ? `อันดับ ${video.rank}` : 'มาใหม่';
  }

  if (durationNode) {
    if (video.duration) {
      durationNode.hidden = false;
      durationNode.textContent = video.duration;
    } else {
      durationNode.hidden = true;
      durationNode.textContent = '';
    }
  }

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
  const searchParams = new URLSearchParams(window.location.search);
  const state = {
    page: 1,
    limit: 40,
    loading: false,
    query: searchParams.get('q') || '',
    category: searchParams.get('category') || '',
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
  const categoryFilter = document.getElementById('category-filter');
  const searchInput = document.getElementById('search-input');
  const slotRenderer = createSlotRenderer();

  searchInput.value = state.query;

  function renderStats(items) {
    const categories = new Set(items.map((item) => normalizeVideo(item).displayCategory || 'ทั่วไป')).size;
    statsRow.innerHTML = `
      <div class="metric-card"><span>คลิปทั้งหมด</span><strong>${state.total}</strong></div>
      <div class="metric-card"><span>หมวดหมู่</span><strong>${categories}</strong></div>
      <div class="metric-card"><span>แสดงในหน้านี้</span><strong>${items.length}</strong></div>
    `;
  }

  function renderPagination() {
    pagination.innerHTML = '';

    const info = document.createElement('div');
    info.className = 'pagination__info';
    info.textContent = `หน้า ${state.page} / ${state.totalPages} · ทั้งหมด ${state.total} คลิป`;
    pagination.appendChild(info);

    const prev = document.createElement('button');
    prev.className = 'button button--ghost';
    prev.textContent = 'ก่อนหน้า';
    prev.disabled = state.page <= 1;
    prev.addEventListener('click', () => {
      if (state.page <= 1) return;
      state.page -= 1;
      loadVideos();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    pagination.appendChild(prev);

    const startPage = Math.max(1, state.page - 2);
    const endPage = Math.min(state.totalPages, state.page + 2);
    for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
      const button = document.createElement('button');
      button.className = `button button--ghost${pageNumber === state.page ? ' is-active' : ''}`;
      button.textContent = String(pageNumber);
      button.addEventListener('click', () => {
        state.page = pageNumber;
        loadVideos();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      pagination.appendChild(button);
    }

    const next = document.createElement('button');
    next.className = 'button button--ghost';
    next.textContent = 'ถัดไป';
    next.disabled = state.page >= state.totalPages;
    next.addEventListener('click', () => {
      if (state.page >= state.totalPages) return;
      state.page += 1;
      loadVideos();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    pagination.appendChild(next);
  }

  function renderCategoryFilter() {
    categoryFilter.innerHTML = '<option value="">ทุกหมวดหมู่</option>';
    state.categories.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.name;
      option.textContent = `${repairText(item.name)} (${item.total})`;
      option.selected = item.name === state.category;
      categoryFilter.appendChild(option);
    });
  }

  function renderCategoryPills() {
    categoryPills.innerHTML = '';

    const allButton = document.createElement('button');
    allButton.className = `category-pill${!state.category ? ' is-active' : ''}`;
    allButton.textContent = 'ทั้งหมด';
    allButton.addEventListener('click', () => {
      state.category = '';
      categoryFilter.value = '';
      state.page = 1;
      loadVideos();
      renderCategoryPills();
    });
    categoryPills.appendChild(allButton);

    state.categories.slice(0, 10).forEach((item) => {
      const button = document.createElement('button');
      button.className = `category-pill${state.category === item.name ? ' is-active' : ''}`;
      button.textContent = repairText(item.name);
      button.addEventListener('click', () => {
        state.category = item.name;
        categoryFilter.value = item.name;
        state.page = 1;
        loadVideos();
        renderCategoryPills();
      });
      categoryPills.appendChild(button);
    });
  }

  function renderOverviewSections() {
    const normalized = state.overviewItems.map(normalizeVideo);
    const latest = [...normalized]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 8);
    const popular = [...normalized]
      .sort((a, b) => (b.displayViews || 0) - (a.displayViews || 0))
      .slice(0, 8);
    const activeCategory = state.category || state.categories[0]?.name || '';
    const categoryItems = activeCategory
      ? normalized.filter((item) => item.displayCategory === repairText(activeCategory)).slice(0, 8)
      : normalized.slice(0, 8);

    renderCardList(latestGrid, template, latest, 'ยังไม่มีคลิปใหม่');
    renderCardList(popularGrid, template, popular, 'ยังไม่มีคลิปยอดนิยม');
    renderCardList(categoryTabGrid, template, categoryItems, 'ยังไม่มีคลิปในหมวดนี้');
  }

  async function loadOverview() {
    const [overviewData, categoryData, ads] = await Promise.all([
      request('/videos?limit=120'),
      request('/videos/categories'),
      request('/ads').catch(() => [])
    ]);

    state.overviewItems = overviewData.items || [];
    state.categories = (categoryData.items || []).map((item) => ({
      ...item,
      name: repairText(item.name)
    }));

    renderCategoryFilter();
    renderCategoryPills();
    renderOverviewSections();

    const activeAds = (ads || []).filter((ad) => ad.active !== false);
    slotRenderer.renderSlotAds(activeAds, () => {});
    mountOverlayAd(activeAds);
  }

  async function loadVideos() {
    if (state.loading) return;
    state.loading = true;
    loadingIndicator.style.display = 'block';
    loadingIndicator.textContent = 'กำลังโหลดคลิป...';

    try {
      const data = await request(
        `/videos?page=${state.page}&limit=${state.limit}&q=${encodeURIComponent(state.query)}&category=${encodeURIComponent(state.category)}`
      );

      state.loaded = data.items || [];
      state.total = Number(data.total || 0);
      state.totalPages = Number(data.totalPages || 1);

      renderCardList(grid, template, state.loaded.map(normalizeVideo), 'ยังไม่พบคลิปที่ตรงกับตัวกรองนี้');
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
    state.category = categoryFilter.value;
    state.page = 1;
    renderCategoryPills();
    await loadVideos();
    renderOverviewSections();
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(window.__thliveSearchTimer);
    window.__thliveSearchTimer = setTimeout(handleFilterChange, 250);
  });

  categoryFilter.addEventListener('change', handleFilterChange);

  Promise.all([loadOverview(), loadVideos()]).catch((error) => {
    loadingIndicator.style.display = 'block';
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
    const candidateUrl = String(video.url || video.embedUrl || '').trim();
    if (!window.Artplayer || !isDirectVideoUrl(candidateUrl)) {
      return false;
    }

    destroyPlayer();
    activeEmbedUrl = String(video.embedUrl || candidateUrl).trim();
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
    elements.skip.textContent = `ข้ามได้ใน ${prerollCountdown} วินาที`;
    elements.preroll.querySelector('.preroll__card').classList.add('preroll__titleless');
    elements.prerollTitle.textContent = repairText(ad.title || '');
    elements.prerollMessage.textContent = repairText(ad.message || '');
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
        elements.skip.textContent = `ข้ามได้ใน ${prerollCountdown} วินาที`;
        return;
      }

      clearInterval(prerollTimer);
      prerollTimer = null;
      elements.skip.disabled = false;
      elements.skip.textContent = 'ข้าม';
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
      .map((item) => {
        const video = normalizeVideo(item);
        return `
          <a class="related-item" href="${buildWatchUrl(video)}" target="_blank" rel="noreferrer noopener">
            <span>${escapeHtml(video.displayTitle)}</span>
            <strong>${escapeHtml(video.displayCategory)}</strong>
          </a>
        `;
      })
      .join('');
  }

  function wireOfferLink(anchor) {
    if (!anchor) return;
    anchor.addEventListener('click', () => {
      trackClick();
    });
  }

  request(`/videos/${id}`)
    .then(async ({ video: rawVideo, related }) => {
      const video = normalizeVideo(rawVideo);
      if (!mountArtplayer(video)) {
        mountFallbackFrame(video);
      }

      elements.source.textContent = 'คลิปที่กำลังดู';
      elements.category.textContent = `หมวดหมู่: ${video.displayCategory}`;
      elements.title.textContent = video.displayTitle;
      elements.views.textContent = `ยอดดู ${formatViews(video.displayViews)}`;
      renderRelated(related || []);

      const buttonAd = rawVideo.affiliateSlots?.button;
      const popupAd = rawVideo.affiliateSlots?.popup;

      if (buttonAd) {
        elements.banner.innerHTML = `
          <button class="ad-card__close" type="button" id="close-affiliate-banner">×</button>
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
          elements.banner.innerHTML = '<div class="ad-slot--placeholder">พื้นที่โฆษณา</div>';
        });
      } else {
        elements.banner.innerHTML = '<div class="ad-slot--placeholder">พื้นที่โฆษณา</div>';
      }

      if (popupAd) {
        elements.popupTitle.textContent = repairText(popupAd.title || '');
        elements.popupMessage.textContent = repairText(popupAd.message || '');
        elements.popupLink.href = popupAd.link || '#';
        elements.popupLink.textContent = repairText(popupAd.cta || 'เปิดข้อเสนอ');
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
      elements.title.textContent = 'ไม่พบคลิปที่ต้องการ';
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

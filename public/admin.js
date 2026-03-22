const tokenKey = 'streamboost_admin_token';

async function request(url, options = {}) {
  const token = localStorage.getItem(tokenKey);
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch (error) {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาเปิด node server/server.js ก่อน');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'เกิดข้อผิดพลาด');
  }

  return response.json();
}

function formToJson(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function uploadFile(kind, file) {
  const payload = new FormData();
  payload.append('kind', kind);
  payload.append('file', file);
  return request('/upload', {
    method: 'POST',
    body: payload
  });
}

const loginPanel = document.getElementById('login-panel');
const dashboardPanel = document.getElementById('dashboard-panel');
const loginForm = document.getElementById('login-form');
const adForm = document.getElementById('ad-form');
const analyticsCards = document.getElementById('analytics-cards');
const videosList = document.getElementById('admin-videos');
const adsList = document.getElementById('admin-ads');
const adSlotField = adForm.querySelector('[name="slot"]');
const adTitleField = adForm.querySelector('[name="title"]');
const adMessageField = adForm.querySelector('[name="message"]');
const adLinkField = adForm.querySelector('[name="link"]');
const adImageField = adForm.querySelector('[name="image"]');
const adMediaField = adForm.querySelector('[name="mediaUrl"]');
const adCtaField = adForm.querySelector('[name="cta"]');
const adImageFileField = adForm.querySelector('[name="imageFile"]');
const adVideoFileField = adForm.querySelector('[name="videoFile"]');
const adSlotHint = document.getElementById('ad-slot-hint');
const uploadStatus = document.getElementById('upload-status');
const uploadImageButton = document.getElementById('upload-image-button');
const uploadVideoButton = document.getElementById('upload-video-button');

function togglePanels(authenticated) {
  loginPanel.classList.toggle('hidden', authenticated);
  dashboardPanel.classList.toggle('hidden', !authenticated);
}

function applyAdSlotRules() {
  const slot = adSlotField.value;
  const isOverlay = slot === 'O1';
  const isVideo = /^E[1-5]$/.test(slot);
  const isImage = !isOverlay && !isVideo;

  adLinkField.required = isOverlay;
  adImageField.required = isImage;
  adMediaField.required = isVideo;

  adTitleField.disabled = true;
  adMessageField.disabled = true;
  adCtaField.disabled = true;
  adImageField.disabled = !isImage;
  adMediaField.disabled = !isVideo;
  adImageFileField.disabled = !isImage;
  adVideoFileField.disabled = !isVideo;
  uploadImageButton.disabled = !isImage;
  uploadVideoButton.disabled = !isVideo;

  adTitleField.value = '';
  adMessageField.value = '';
  adCtaField.value = '';

  if (isOverlay) {
    adSlotHint.textContent = 'ตำแหน่ง O1 ใช้แค่ลิงก์ปลายทางอย่างเดียว';
    adImageField.value = '';
    adMediaField.value = '';
    adImageFileField.value = '';
    adVideoFileField.value = '';
  } else if (isVideo) {
    adSlotHint.textContent = 'ตำแหน่ง E1-E5 ใช้วิดีโออย่างเดียวก็ได้ ถ้าใส่ลิงก์เพิ่ม เวลากดวิดีโอจะเด้งไปลิงก์นั้น';
    adImageField.value = '';
    adImageFileField.value = '';
  } else {
    adSlotHint.textContent = 'ตำแหน่งทั่วไปใช้รูปภาพอย่างเดียวก็ได้ ถ้าใส่ลิงก์เพิ่ม เวลากดรูปจะเด้งไปลิงก์นั้น';
    adMediaField.value = '';
    adVideoFileField.value = '';
  }
}

async function loadDashboard() {
  const [videosData, adsData, analytics] = await Promise.all([
    request('/videos?limit=100'),
    request('/ads'),
    request('/analytics')
  ]);

  analyticsCards.innerHTML = `
    <div class="metric-card"><span>ยอดดูรวม</span><strong>${analytics.views}</strong></div>
    <div class="metric-card"><span>ยอดคลิกรวม</span><strong>${analytics.clicks}</strong></div>
    <div class="metric-card"><span>คลิปทั้งหมด</span><strong>${analytics.totalVideos}</strong></div>
    <div class="metric-card"><span>โฆษณาทั้งหมด</span><strong>${analytics.totalAds}</strong></div>
  `;

  videosList.innerHTML = videosData.items
    .map(
      (video) => `
        <div class="admin-item">
          <div>
            <strong>${video.title}</strong>
            <div class="hint">${video.category || 'ทั่วไป'} | ${video.source} | ยอดดู ${video.views || 0}</div>
          </div>
          <button class="button danger" data-delete-video="${video.id}">ลบ</button>
        </div>
      `
    )
    .join('');

  adsList.innerHTML = adsData
    .map(
      (ad) => `
        <div class="admin-item">
          <div>
            <strong>${ad.title || ad.slot}</strong>
            <div class="hint">${ad.slot} | คลิก ${ad.clicks || 0}</div>
          </div>
          <button class="button danger" data-delete-ad="${ad.id}">ลบ</button>
        </div>
      `
    )
    .join('');
}

async function handleAssetUpload(kind) {
  const fileField = kind === 'image' ? adImageFileField : adVideoFileField;
  const targetField = kind === 'image' ? adImageField : adMediaField;
  const file = fileField.files?.[0];

  if (!file) {
    alert(kind === 'image' ? 'กรุณาเลือกไฟล์รูปก่อน' : 'กรุณาเลือกไฟล์วิดีโอก่อน');
    return;
  }

  try {
    uploadStatus.textContent = kind === 'image' ? 'กำลังอัปโหลดรูป...' : 'กำลังอัปโหลดวิดีโอ...';
    const result = await uploadFile(kind, file);
    targetField.value = result.url;
    uploadStatus.textContent = `อัปโหลดสำเร็จ: ${result.url}`;
  } catch (error) {
    uploadStatus.textContent = error.message;
    alert(error.message);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const payload = formToJson(loginForm);
    const data = await request('/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    localStorage.setItem(tokenKey, data.token);
    togglePanels(true);
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  }
});

adForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await request('/ads', {
      method: 'POST',
      body: JSON.stringify(formToJson(adForm))
    });
    adForm.reset();
    applyAdSlotRules();
    uploadStatus.textContent = 'ถ้าอัปโหลดสำเร็จ ระบบจะใส่ลิงก์ลงช่องให้เอง';
    await loadDashboard();
    alert('เพิ่มโฆษณาเรียบร้อย');
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById('clear-videos').addEventListener('click', async () => {
  const confirmed = window.confirm('ต้องการล้างคลิปทั้งหมดใช่หรือไม่');
  if (!confirmed) return;

  try {
    await request('/videos', { method: 'DELETE' });
    await loadDashboard();
    alert('ล้างคลิปทั้งหมดแล้ว');
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById('logout-button').addEventListener('click', () => {
  localStorage.removeItem(tokenKey);
  togglePanels(false);
});

document.addEventListener('click', async (event) => {
  const videoId = event.target.getAttribute('data-delete-video');
  const adId = event.target.getAttribute('data-delete-ad');

  try {
    if (videoId) {
      await request(`/videos/${videoId}`, { method: 'DELETE' });
      await loadDashboard();
    }
    if (adId) {
      await request(`/ads/${adId}`, { method: 'DELETE' });
      await loadDashboard();
    }
  } catch (error) {
    alert(error.message);
  }
});

adSlotField.addEventListener('change', applyAdSlotRules);
uploadImageButton.addEventListener('click', () => handleAssetUpload('image'));
uploadVideoButton.addEventListener('click', () => handleAssetUpload('video'));
applyAdSlotRules();

if (localStorage.getItem(tokenKey)) {
  togglePanels(true);
  loadDashboard().catch(() => {
    localStorage.removeItem(tokenKey);
    togglePanels(false);
  });
}

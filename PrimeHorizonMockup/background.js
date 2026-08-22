// Bullstart — service worker: giữ token + gọi API import ý tưởng.
'use strict';

const DEFAULT_API_BASE = 'https://genmockup.primehorizon.studio';

async function getCfg() {
  const s = await chrome.storage.local.get(['apiBase', 'token', 'username', 'password']);
  let apiBase = (s.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  // Auto-migrate domain cũ → mới (token cùng backend nên vẫn dùng được).
  if (/tool\.bullstart\.us/i.test(apiBase)) {
    apiBase = DEFAULT_API_BASE;
    await chrome.storage.local.set({ apiBase });
  }
  return {
    apiBase,
    token: s.token || '',
    username: s.username || '',
    password: s.password || '',
  };
}

async function login(apiBase, username, password) {
  const r = await fetch(apiBase + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) {
    throw new Error(j.error === 'invalid_credentials' ? 'Sai tài khoản hoặc mật khẩu' : j.error || 'Đăng nhập thất bại');
  }
  return j.token;
}

async function ensureToken(cfg) {
  if (cfg.token) return cfg.token;
  if (cfg.username && cfg.password) {
    const token = await login(cfg.apiBase, cfg.username, cfg.password);
    await chrome.storage.local.set({ token });
    return token;
  }
  throw new Error('Chưa đăng nhập. Mở Options của extension để đăng nhập.');
}

function bufToDataURL(buf, mime) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return 'data:' + (mime || 'image/png') + ';base64,' + btoa(bin);
}

// Chuyển payload thành dataURL base64. Ảnh 'url' được fetch NGAY trong trình duyệt
// (IP + cookie của user) nên qua được link bảo vệ của ChatGPT mà server không tải nổi.
async function payloadToDataUrl(payload) {
  if (payload.kind === 'dataUrl') return payload.dataUrl;
  let r;
  try {
    r = await fetch(payload.url, { credentials: 'include' });
  } catch (e) {
    throw new Error('Không tải được ảnh từ ChatGPT (' + (e && e.message ? e.message : 'network') + ')');
  }
  if (!r.ok) {
    throw new Error('Không tải được ảnh từ ChatGPT (HTTP ' + r.status + '). Thử mở ảnh cỡ lớn rồi lưu lại.');
  }
  const mime = r.headers.get('content-type') || 'image/png';
  const buf = await r.arrayBuffer();
  return bufToDataURL(buf, mime);
}

// ---- Generic authed request (Bearer + tự re-login khi 401) ----------------
async function authFetch(cfg, token, path, opts, retried) {
  const headers = Object.assign({}, (opts && opts.headers) || {}, {
    Authorization: 'Bearer ' + token,
  });
  const r = await fetch(cfg.apiBase + path, Object.assign({}, opts, { headers }));
  if (r.status === 401 && !retried) {
    await chrome.storage.local.remove('token');
    const fresh = await ensureToken({ ...cfg, token: '' });
    return authFetch(cfg, fresh, path, opts, true);
  }
  return r;
}

async function apiGet(cfg, token, path) {
  const r = await authFetch(cfg, token, path, { method: 'GET' }, false);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('API lỗi: ' + (j.message || j.error || 'HTTP ' + r.status));
  return j;
}

// Design (url ChatGPT hoặc dataUrl) → Blob để đẩy multipart designFile.
async function designToBlob(design) {
  const dataUrl = await payloadToDataUrl(design); // xử lý kind 'dataUrl' | 'url'
  const resp = await fetch(dataUrl);
  return await resp.blob();
}

// Gửi bộ mockup/áo tới API generate. productType 'card' → /api/generate (mockupIds),
// còn lại → /api/generate/shirt (setIds + count/colors). Design đi kèm dưới dạng file.
async function generate(cfg, token, msg) {
  const isShirt = msg.productType !== 'card';
  const design = msg.design || {};
  const fd = new FormData();

  if (design.kind === 'ideaId') {
    // Ảnh ý tưởng đã lưu trên server → chỉ cần gửi ID, server tự đọc file.
    fd.append('designImageId', design.ideaId);
  } else if (design.kind === 'dataUrl') {
    const resp = await fetch(design.dataUrl);
    fd.append('designFile', await resp.blob(), 'design.png');
  } else if (design.kind === 'url') {
    // Thử tải trong trình duyệt (qua được ảnh ChatGPT nhờ cookie + host_permissions).
    // Nếu host không có quyền / lỗi → gửi designUrl để CHÍNH SERVER tải.
    try {
      fd.append('designFile', await designToBlob(design), 'design.png');
    } catch {
      fd.append('designUrl', design.url);
    }
  } else {
    throw new Error('Thiếu design');
  }

  if (isShirt) {
    fd.append('setIds', JSON.stringify(msg.setIds || []));
    if (msg.count) fd.append('count', String(msg.count));
    if (msg.colors && Object.keys(msg.colors).length) {
      fd.append('colors', JSON.stringify(msg.colors));
    }
    if (msg.designAreas && Object.keys(msg.designAreas).length) {
      fd.append('designAreas', JSON.stringify(msg.designAreas));
    }
  } else {
    fd.append('mockupIds', JSON.stringify(msg.mockupIds || []));
  }
  if (msg.watermarkId) fd.append('watermarkId', msg.watermarkId);

  const path = isShirt ? '/api/generate/shirt' : '/api/generate';
  const r = await authFetch(cfg, token, path, { method: 'POST', body: fd }, false);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Generate lỗi: ' + (j.message || j.error || 'HTTP ' + r.status));
  return j;
}

async function importIdea(cfg, token, payload, retried) {
  const imageBase64 = await payloadToDataUrl(payload);

  const r = await fetch(cfg.apiBase + '/api/ideas/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ imageBase64, ideaTitle: payload.alt }),
  });

  if (r.status === 401 && !retried) {
    // token hết hạn → xoá, đăng nhập lại bằng creds đã lưu rồi thử 1 lần
    await chrome.storage.local.remove('token');
    const fresh = await ensureToken({ ...cfg, token: '' });
    return importIdea(cfg, fresh, payload, true);
  }

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('API lỗi: ' + (j.message || j.error || 'HTTP ' + r.status));
  return j;
}

// ---- Context menu: chuột phải 1 ảnh → mở trang generate với ảnh đó ---------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'genmockup-from-image',
    title: 'Generate mockup với ảnh này',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'genmockup-from-image' || !info.srcUrl) return;
  await chrome.storage.local.set({ pendingDesign: { kind: 'url', url: info.srcUrl } });
  await chrome.tabs.create({ url: chrome.runtime.getURL('generate.html') });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      const cfg = await getCfg();
      if (msg.type === 'saveIdea') {
        const token = await ensureToken(cfg);
        const idea = await importIdea(cfg, token, msg.payload, false);
        sendResponse({ ok: true, idea });
      } else if (msg.type === 'saveAndGenerate') {
        // Lưu ảnh vào Idea → nhớ làm design mặc định → mở trang generate.
        const token = await ensureToken(cfg);
        const idea = await importIdea(cfg, token, msg.payload, false);
        await chrome.storage.local.set({
          pendingDesign: { kind: 'ideaId', ideaId: idea.id, previewUrl: idea.fileUrl },
        });
        await chrome.tabs.create({ url: chrome.runtime.getURL('generate.html') });
        sendResponse({ ok: true, idea });
      } else if (msg.type === 'login') {
        const apiBase = (msg.apiBase || cfg.apiBase).replace(/\/$/, '');
        const username = msg.username || cfg.username;
        const password = msg.password || cfg.password;
        const token = await login(apiBase, username, password);
        await chrome.storage.local.set({ apiBase, username, password, token });
        sendResponse({ ok: true, username });
      } else if (msg.type === 'logout') {
        await chrome.storage.local.remove(['token', 'password']);
        sendResponse({ ok: true });
      } else if (msg.type === 'status') {
        sendResponse({ ok: true, apiBase: cfg.apiBase, username: cfg.username, loggedIn: !!cfg.token });
      } else if (msg.type === 'listSets') {
        const token = await ensureToken(cfg);
        sendResponse({ ok: true, sets: await apiGet(cfg, token, '/api/shirt-sets') });
      } else if (msg.type === 'listMockups') {
        const token = await ensureToken(cfg);
        sendResponse({ ok: true, mockups: await apiGet(cfg, token, '/api/mockups') });
      } else if (msg.type === 'listWatermarks') {
        const token = await ensureToken(cfg);
        sendResponse({ ok: true, watermarks: await apiGet(cfg, token, '/api/watermarks') });
      } else if (msg.type === 'listIdeas') {
        const token = await ensureToken(cfg);
        sendResponse({ ok: true, ideas: await apiGet(cfg, token, '/api/ideas') });
      } else if (msg.type === 'uploadMockup') {
        // Upload 1 ảnh làm mockup card mới (JSON base64 — tránh multipart dễ đứt qua tunnel).
        const token = await ensureToken(cfg);
        const r = await authFetch(cfg, token, '/api/mockups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: msg.name, imageBase64: msg.dataUrl }),
        }, false);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || j.error || 'HTTP ' + r.status);
        sendResponse({ ok: true, mockup: j });
      } else if (msg.type === 'createShirtSet') {
        const token = await ensureToken(cfg);
        const r = await authFetch(cfg, token, '/api/shirt-sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: msg.name }),
        }, false);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error === 'name_taken' ? 'Tên bộ đã tồn tại' : j.message || j.error || 'HTTP ' + r.status);
        sendResponse({ ok: true, set: j });
      } else if (msg.type === 'uploadVariant') {
        if (!msg.setId) throw new Error('Chưa chọn bộ');
        const token = await ensureToken(cfg);
        const r = await authFetch(cfg, token, '/api/shirt-sets/' + encodeURIComponent(msg.setId) + '/variants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ color: msg.color, imageBase64: msg.dataUrl, filename: msg.filename }),
        }, false);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || j.error || 'HTTP ' + r.status);
        sendResponse({ ok: true, set: j });
      } else if (msg.type === 'deleteVariant') {
        const token = await ensureToken(cfg);
        const r = await authFetch(cfg, token, '/api/shirt-sets/' + encodeURIComponent(msg.setId) + '/variants/' + encodeURIComponent(msg.variantId), { method: 'DELETE' }, false);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || j.error || 'HTTP ' + r.status);
        sendResponse({ ok: true, set: j });
      } else if (msg.type === 'deleteShirtSet') {
        const token = await ensureToken(cfg);
        const r = await authFetch(cfg, token, '/api/shirt-sets/' + encodeURIComponent(msg.setId), { method: 'DELETE' }, false);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || j.error || 'HTTP ' + r.status);
        sendResponse({ ok: true });
      } else if (msg.type === 'deleteIdea') {
        const token = await ensureToken(cfg);
        const r = await authFetch(cfg, token, '/api/ideas/' + encodeURIComponent(msg.id), { method: 'DELETE' }, false);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || j.error || 'HTTP ' + r.status);
        sendResponse({ ok: true });
      } else if (msg.type === 'generate') {
        const token = await ensureToken(cfg);
        sendResponse({ ok: true, generation: await generate(cfg, token, msg) });
      } else {
        sendResponse({ ok: false, error: 'unknown_message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  })();
  return true; // giữ kênh mở cho phản hồi bất đồng bộ
});

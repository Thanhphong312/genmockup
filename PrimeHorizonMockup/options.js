'use strict';

const DEFAULT_API_BASE = 'https://genmockup.primehorizon.studio';

const $ = (id) => document.getElementById(id);

function showStatus(msg, ok) {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status ' + (ok ? 'ok' : 'err');
}

async function refreshBadge() {
  const res = await chrome.runtime.sendMessage({ type: 'status' });
  const badge = $('badge');
  if (res && res.loggedIn) {
    badge.innerHTML = `Đang đăng nhập: <b>${res.username || '(?)'} </b> · ${res.apiBase}`;
  } else {
    badge.textContent = 'Chưa đăng nhập.';
  }
}

async function init() {
  const s = await chrome.storage.local.get(['apiBase', 'username']);
  // Bỏ qua domain cũ đã lưu → hiện mặc định mới.
  $('apiBase').value = s.apiBase && !/tool\.bullstart\.us/i.test(s.apiBase) ? s.apiBase : DEFAULT_API_BASE;
  $('username').value = s.username || '';
  refreshBadge();
}

$('loginBtn').addEventListener('click', async () => {
  const apiBase = ($('apiBase').value || DEFAULT_API_BASE).trim().replace(/\/$/, '');
  const username = $('username').value.trim();
  const password = $('password').value;
  if (!username || !password) {
    showStatus('Nhập tài khoản và mật khẩu.', false);
    return;
  }
  $('loginBtn').disabled = true;
  showStatus('Đang đăng nhập…', true);
  const res = await chrome.runtime.sendMessage({ type: 'login', apiBase, username, password });
  $('loginBtn').disabled = false;
  if (res && res.ok) {
    showStatus('Đăng nhập thành công. Giờ hover vào ảnh trong ChatGPT để lưu.', true);
    $('password').value = '';
    refreshBadge();
  } else {
    showStatus('Lỗi: ' + ((res && res.error) || 'unknown'), false);
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'logout' });
  showStatus('Đã đăng xuất.', true);
  refreshBadge();
});

init();

// Bullstart — chèn nút "Lưu Idea" lên ảnh trong ChatGPT.
(() => {
  'use strict';

  const MIN_SIZE = 200; // bỏ qua icon/avatar nhỏ
  const PROCESSED = 'bsDone';

  function isCandidate(img) {
    if (!img || img.dataset[PROCESSED]) return false;
    if (img.closest('.bs-img-host')) {
      // đã bọc rồi nhưng ảnh mới trong host? vẫn cần kiểm tra flag riêng
    }
    // chỉ trong khu vực chat
    if (!img.closest('main')) return false;
    const src = img.currentSrc || img.src || '';
    if (!/^(https?:|blob:|data:)/.test(src)) return false;
    // Bỏ svg/icon
    if (/\.svg(\?|$)/i.test(src)) return false;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w && h && (w < MIN_SIZE || h < MIN_SIZE)) return false;
    return true;
  }

  function guessFilename(src) {
    try {
      const u = new URL(src, location.href);
      const base = (u.pathname.split('/').pop() || 'chatgpt-image').split('?')[0];
      return base.includes('.') ? base : `${base}.png`;
    } catch {
      return 'chatgpt-image.png';
    }
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  // Vẽ ảnh (đã render trên trang) ra canvas → dataURL. Ném lỗi nếu canvas bị "taint"
  // (ảnh cross-origin không cho phép). Với ảnh blob:/same-origin thì luôn OK.
  function canvasToDataURL(img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('no-size');
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/png'); // ném SecurityError nếu tainted
  }

  // Lấy dataURL của ảnh, thử nhiều cách trong page. Trả null nếu bó tay
  // (khi đó gửi URL để background tự fetch trong trình duyệt).
  async function getImageDataUrl(img) {
    const src = img.currentSrc || img.src;
    if (src.startsWith('blob:') || src.startsWith('data:')) {
      const blob = await (await fetch(src)).blob();
      return await blobToDataURL(blob);
    }
    try {
      return canvasToDataURL(img);
    } catch (_) {
      /* tainted → thử cách khác */
    }
    try {
      const blob = await (await fetch(src, { mode: 'cors' })).blob();
      return await blobToDataURL(blob);
    } catch (_) {
      /* CORS chặn → để background lo */
    }
    return null;
  }

  let toastEl = null;
  let toastTimer = null;
  function toast(msg, kind) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'bs-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = `bs-toast bs-show ${kind === 'ok' ? 'bs-ok' : kind === 'err' ? 'bs-err' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toastEl) toastEl.className = 'bs-toast';
    }, 3200);
  }

  // Content script cũ vẫn còn trong tab sau khi extension được reload/cập nhật →
  // mọi lời gọi chrome.* sẽ ném "Extension context invalidated". Phát hiện sớm.
  function extAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  // Dựng payload ảnh (dataUrl nếu lấy được bytes trong page, ngược lại gửi URL).
  async function buildPayload(img) {
    const src = img.currentSrc || img.src;
    let payload;
    const dataUrl = await getImageDataUrl(img);
    if (dataUrl) payload = { kind: 'dataUrl', dataUrl, filename: guessFilename(src) };
    else payload = { kind: 'url', url: src };
    payload.pageUrl = location.href;
    payload.alt = (img.alt || '').slice(0, 200) || null;
    return payload;
  }

  function looksLikeAuthErr(err) {
    return /chưa đăng nhập|unauthenticated|unauthorized|login/i.test(err || '');
  }

  // Xử lý chung cho cả 2 nút: chạy 1 action (message type) rồi hiện trạng thái.
  async function runAction(img, btn, type, labels) {
    const original = btn.textContent;
    if (!extAlive()) {
      btn.textContent = '↻ Tải lại trang';
      toast('Extension vừa được cập nhật. Tải lại trang ChatGPT (F5) rồi thử lại.', 'err');
      return;
    }
    btn.disabled = true;
    btn.textContent = labels.busy;
    try {
      const payload = await buildPayload(img);
      const res = await chrome.runtime.sendMessage({ type, payload });
      if (res && res.ok) {
        btn.textContent = labels.ok;
        toast(labels.toastOk, 'ok');
      } else {
        const err = (res && res.error) || 'unknown_error';
        btn.textContent = '❌ Lỗi';
        toast(looksLikeAuthErr(err) ? 'Chưa đăng nhập. Mở Options của extension để đăng nhập.' : 'Lỗi: ' + err, 'err');
      }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (/context invalidated|Extension context/i.test(msg)) {
        btn.textContent = '↻ Tải lại trang';
        toast('Extension vừa được cập nhật. Tải lại trang ChatGPT (F5) rồi thử lại.', 'err');
      } else {
        btn.textContent = '❌ Lỗi';
        toast('Lỗi: ' + msg, 'err');
      }
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = original;
      }, 2500);
    }
  }

  const onSave = (img, btn) =>
    runAction(img, btn, 'saveIdea', {
      busy: '⏳ Đang lưu…',
      ok: '✅ Đã lưu',
      toastOk: 'Đã lưu vào thư viện ý tưởng ✔',
    });

  function decorate(img) {
    if (!isCandidate(img)) return;
    img.dataset[PROCESSED] = '1';

    const host = img.parentElement;
    if (!host) return;
    // đánh dấu host để CSS hover hoạt động, đảm bảo positioning
    host.classList.add('bs-img-host');
    const cs = getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';

    // tránh trùng nút nếu nhiều ảnh cùng host
    if (host.querySelector(':scope > .bs-btns')) return;

    const wrap = document.createElement('div');
    wrap.className = 'bs-btns';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'bs-btn bs-save-btn';
    saveBtn.textContent = '💾 Lưu Idea';
    saveBtn.title = 'Lưu ảnh này vào thư viện ý tưởng Bullstart';
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSave(img, saveBtn);
    });

    wrap.appendChild(saveBtn);
    host.appendChild(wrap);
  }

  function scan(root) {
    const imgs = (root instanceof Element ? root : document).querySelectorAll('main img');
    imgs.forEach((img) => {
      if (img.complete && (img.naturalWidth || 0) > 0) decorate(img);
      else img.addEventListener('load', () => decorate(img), { once: true });
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'IMG') {
          const img = node;
          if (img.complete && (img.naturalWidth || 0) > 0) decorate(img);
          else img.addEventListener('load', () => decorate(img), { once: true });
        } else if (node.querySelectorAll) {
          scan(node);
        }
      }
    }
  });

  function start() {
    scan(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start, { once: true });
})();

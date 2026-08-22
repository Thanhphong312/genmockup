'use strict';

// ---- State (giữ trong module + persist vào chrome.storage) -----------------
let productType = 'shirt'; // 'shirt' | 'card'
let designSrc = 'file'; // 'file' | 'url' | 'idea'
let designData = null; // {kind:'dataUrl',dataUrl} | {kind:'url',url} | {kind:'ideaId',ideaId,previewUrl}
let items = []; // sets hoặc mockups đang hiển thị
const selected = new Set(); // id bộ/mockup đã chọn
const designAreas = {}; // setId → {x,y,width,height,rotation} (override vị trí design)
let ideasCache = [];
let ideasPromise = null;
let lastGen = null; // kết quả generate gần nhất (để khôi phục lưới)
let stateReady = false; // chặn saveState trong lúc đang khôi phục

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

// ---- Persist (debounce + flush khi popup ẩn/đóng) -------------------------
let saveTimer = null;
function saveState() {
  if (!stateReady) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushState, 200);
}
function flushState() {
  if (!stateReady) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const state = {
    productType,
    designSrc,
    designData,
    selected: [...selected],
    count: parseInt($('count').value, 10) || 6,
    watermarkId: $('watermark').value || '',
    search: $('search').value || '',
    designAreas,
    lastGen,
  };
  // dataUrl file lớn có thể vượt quota → nuốt lỗi, phần còn lại vẫn dùng được.
  chrome.storage.local.set({ popupState: state }).catch(() => {});
}
// Popup Chrome bị huỷ khi mất focus → ghi ngay thao tác cuối trước khi đóng.
window.addEventListener('pagehide', flushState);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushState();
});

// ---- Helpers ---------------------------------------------------------------
function setStatus(kind, text) {
  const el = $('status');
  el.className = 'status ' + kind;
  el.textContent = text;
}
function clearStatus() {
  $('status').className = 'status';
  $('status').textContent = '';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Không đọc được file'));
    fr.readAsDataURL(file);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function sanitizeName(s) {
  let n = String(s || 'image').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80);
  if (!/\.(png|jpe?g|webp)$/i.test(n)) n += '.png';
  return n;
}

// Tải ảnh về máy qua chrome.downloads (chạy được cả cross-origin nhờ host_permissions).
function downloadImage(url, filename) {
  try {
    chrome.downloads.download({ url, filename: sanitizeName(filename) });
  } catch (e) {
    window.open(url, '_blank');
  }
}

// Đổi URL /files/<rel> → /thumb?w=..&path=<rel> để tải ảnh nhỏ (WebP) cho lưới,
// tránh kéo ảnh gốc ~2.5MB (gây ERR_HTTP2/520 khi tải nhiều ảnh cùng lúc qua tunnel).
function thumbUrl(fileUrl, w) {
  if (!fileUrl) return fileUrl;
  const i = fileUrl.indexOf('/files/');
  if (i < 0) return fileUrl;
  const base = fileUrl.slice(0, i);
  const rel = fileUrl.slice(i + '/files/'.length);
  return base + '/thumb?w=' + (w || 240) + '&path=' + encodeURIComponent(rel);
}

function previewUrlOf(d) {
  if (!d) return null;
  if (d.kind === 'dataUrl') return d.dataUrl;
  if (d.kind === 'url') return d.url;
  if (d.kind === 'ideaId') return d.previewUrl || null;
  return null;
}

function updatePreview() {
  const box = $('preview');
  box.innerHTML = '';
  const url = previewUrlOf(designData);
  if (url) {
    const img = new Image();
    img.src = url;
    box.appendChild(img);
  } else {
    box.textContent = 'Chưa có design';
  }
  refreshGenBtn();
  saveState();
}

function refreshGenBtn() {
  $('genBtn').disabled = !designData || selected.size === 0;
}

function updateSelCount() {
  $('selCount').textContent = 'Đã chọn ' + selected.size;
  refreshGenBtn();
  saveState();
}

// ---- Áp UI theo state ------------------------------------------------------
function applySrcTabUI(src) {
  designSrc = src;
  document.querySelectorAll('.tab[data-src]').forEach((x) => x.classList.toggle('active', x.dataset.src === src));
  $('srcFile').style.display = src === 'file' ? '' : 'none';
  $('srcUrl').style.display = src === 'url' ? '' : 'none';
  $('srcIdea').style.display = src === 'idea' ? '' : 'none';
}

function applyProductTypeUI() {
  document.querySelectorAll('.tab[data-type]').forEach((x) => x.classList.toggle('active', x.dataset.type === productType));
  $('shirtOpts').style.display = productType === 'shirt' ? '' : 'none';
  $('listTitle').textContent = productType === 'shirt' ? 'Chọn bộ áo' : 'Chọn mockup';
  // Chỉ mockup card mới upload trực tiếp được (server không có API upload bộ áo).
  const up = $('uploadMockupBtn');
  if (up) up.style.display = productType === 'card' ? '' : 'none';
  // Quản lý bộ áo (tạo folder + upload màu) chỉ cho shirt.
  const mg = $('manageSetsBtn');
  if (mg) mg.style.display = productType === 'shirt' ? '' : 'none';
}

// Upload nhiều ảnh làm mockup card mới.
async function onUploadMockups(e) {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  let ok = 0;
  let fail = 0;
  clearStatus();
  setStatus('info', 'Đang upload 0/' + files.length + '…');
  for (let i = 0; i < files.length; i++) {
    try {
      const dataUrl = await fileToDataUrl(files[i]);
      const res = await send({
        type: 'uploadMockup',
        dataUrl,
        filename: files[i].name,
        name: files[i].name.replace(/\.[^.]+$/, ''),
      });
      if (res && res.ok) ok++;
      else fail++;
    } catch {
      fail++;
    }
    setStatus('info', 'Đang upload ' + (i + 1) + '/' + files.length + '…');
  }
  setStatus(fail ? 'err' : 'ok', 'Upload xong: ' + ok + ' ok' + (fail ? ', ' + fail + ' lỗi' : '') + '.');
  if (productType === 'card') await loadList();
}

// ---- Danh sách bộ/mockup ---------------------------------------------------
function renderList(filter) {
  const list = $('list');
  const q = (filter || '').trim().toLowerCase();
  const rows = items.filter((it) => !q || (it.name || '').toLowerCase().includes(q));
  if (!rows.length) {
    list.innerHTML = '<div class="hint">Không có mục nào.</div>';
    return;
  }
  list.innerHTML = '';
  for (const it of rows) {
    const thumb = it.representativeUrl || it.fileUrl || '';
    const edited = productType === 'shirt' && designAreas[it.id] ? ' · ✎ đã chỉnh' : '';
    const sub =
      productType === 'shirt'
        ? (it.variants ? it.variants.length + ' màu' : '') + (it.shared ? ' · shared' : '') + edited
        : (it.width && it.height ? it.width + '×' + it.height : '');
    const row = document.createElement('div');
    row.className = 'item' + (selected.has(it.id) ? ' sel' : '');
    row.innerHTML =
      (thumb ? `<img src="${thumbUrl(thumb, 96)}" loading="lazy" />` : '<img />') +
      `<div class="meta"><b>${escapeHtml(it.name || it.id)}</b><span>${escapeHtml(sub)}</span></div>` +
      `<input type="checkbox" ${selected.has(it.id) ? 'checked' : ''} />`;
    row.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const cb = row.querySelector('input');
        cb.checked = !cb.checked;
      }
      toggle(it.id, row.querySelector('input').checked, row);
    });
    // Nút căn chỉnh vị trí design (chỉ bộ áo — server chỉ nhận designAreas override cho shirt)
    if (productType === 'shirt') {
      const edit = document.createElement('button');
      edit.className = 'row-edit' + (designAreas[it.id] ? ' on' : '');
      edit.textContent = '✎';
      edit.title = 'Căn chỉnh vị trí design trên mockup';
      edit.addEventListener('click', (e) => {
        e.stopPropagation();
        openAreaEditor(it);
      });
      row.insertBefore(edit, row.querySelector('input'));
    }
    list.appendChild(row);
  }
}

// Kích thước mockup (px) của bộ, lấy từ variant đại diện.
function repVariant(set) {
  const vs = set.variants || [];
  return vs.find((v) => v.color === set.representativeColor) || vs[0] || null;
}

function toggle(id, on, row) {
  if (on) selected.add(id);
  else selected.delete(id);
  if (row) row.classList.toggle('sel', on);
  updateSelCount();
}

async function loadList() {
  $('list').innerHTML = '<div class="hint">Đang tải…</div>';
  const res = await send({ type: productType === 'shirt' ? 'listSets' : 'listMockups' });
  if (!res || !res.ok) {
    $('list').innerHTML = '<div class="hint err">Lỗi: ' + escapeHtml((res && res.error) || 'không tải được') + '</div>';
    return;
  }
  items = productType === 'shirt' ? res.sets : res.mockups;
  // Bỏ khỏi selection các id không còn tồn tại (vd đổi loại sản phẩm).
  const ids = new Set(items.map((it) => it.id));
  [...selected].forEach((id) => { if (!ids.has(id)) selected.delete(id); });
  renderList($('search').value);
  updateSelCount();
}

async function loadWatermarks() {
  const res = await send({ type: 'listWatermarks' });
  if (!res || !res.ok) return;
  const sel = $('watermark');
  for (const w of res.watermarks) {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.name || w.id;
    sel.appendChild(opt);
  }
}

// ---- Ideas (lưới ảnh) ------------------------------------------------------
function loadIdeas() {
  if (!ideasPromise) {
    ideasPromise = (async () => {
      const grid = $('ideaGrid');
      grid.innerHTML = '<div class="idea-empty">Đang tải ý tưởng…</div>';
      const res = await send({ type: 'listIdeas' });
      if (!res || !res.ok) {
        grid.innerHTML = '<div class="idea-empty">Lỗi tải ý tưởng</div>';
        ideasPromise = null;
        return;
      }
      ideasCache = res.ideas || [];
      renderIdeaGrid();
    })();
  }
  return ideasPromise;
}

function ideaName(it) {
  return it.title || it.ideaTitle || it.keyword || it.id;
}

function renderIdeaGrid() {
  const grid = $('ideaGrid');
  if (!ideasCache.length) {
    grid.innerHTML = '<div class="idea-empty">(Chưa có ý tưởng đã lưu)</div>';
    return;
  }
  const selId = designData && designData.kind === 'ideaId' ? designData.ideaId : null;
  grid.innerHTML = '';
  for (const it of ideasCache) {
    const cell = document.createElement('div');
    cell.className = 'idea-cell' + (it.id === selId ? ' sel' : '');
    cell.title = ideaName(it) + ' — bấm để chọn làm design';

    const img = document.createElement('img');
    img.src = thumbUrl(it.fileUrl, 160);
    img.loading = 'lazy';
    cell.appendChild(img);
    cell.addEventListener('click', () => selectIdea(it.id, it.fileUrl));

    // Cụm nút quản lý (hiện khi hover)
    const acts = document.createElement('div');
    acts.className = 'idea-acts';

    const dl = document.createElement('button');
    dl.className = 'ia-btn';
    dl.textContent = '⬇';
    dl.title = 'Tải ảnh ý tưởng về máy';
    dl.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadImage(it.fileUrl, ideaName(it));
    });

    const del = document.createElement('button');
    del.className = 'ia-btn ia-del';
    del.textContent = '🗑';
    del.title = 'Xóa ý tưởng';
    del.dataset.confirm = '0';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (del.dataset.confirm === '0') {
        del.dataset.confirm = '1';
        del.textContent = '✓?';
        del.classList.add('confirm');
        setTimeout(() => {
          del.dataset.confirm = '0';
          del.textContent = '🗑';
          del.classList.remove('confirm');
        }, 2500);
        return;
      }
      deleteIdea(it.id);
    });

    acts.appendChild(dl);
    acts.appendChild(del);
    cell.appendChild(acts);
    grid.appendChild(cell);
  }
}

async function deleteIdea(id) {
  const res = await send({ type: 'deleteIdea', id });
  if (!res || !res.ok) {
    setStatus('err', 'Xóa lỗi: ' + ((res && res.error) || 'unknown'));
    return;
  }
  ideasCache = ideasCache.filter((x) => x.id !== id);
  // Nếu đang chọn ý tưởng vừa xóa làm design → bỏ chọn.
  if (designData && designData.kind === 'ideaId' && designData.ideaId === id) {
    designData = null;
    updatePreview();
  }
  renderIdeaGrid();
}

function selectIdea(id, url) {
  designData = { kind: 'ideaId', ideaId: id, previewUrl: url };
  renderIdeaGrid();
  updatePreview();
}

// ---- Quản lý bộ áo (tạo folder + upload từng màu) --------------------------
let mgrSets = [];
let mgrCurrentId = null;

function mgrStatus(kind, text) {
  const el = $('mgrStatus');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = kind === 'err' ? '#dc2626' : kind === 'ok' ? '#059669' : '#94a3b8';
}

async function reloadMgrSets(keepId) {
  const res = await send({ type: 'listSets' });
  mgrSets = res && res.ok ? res.sets.filter((s) => !s.shared) : [];
  if (keepId && mgrSets.some((s) => s.id === keepId)) mgrCurrentId = keepId;
  else if (!mgrSets.some((s) => s.id === mgrCurrentId)) mgrCurrentId = mgrSets[0] ? mgrSets[0].id : null;
  renderMgr();
}

function renderMgr() {
  const sel = $('mgrSetSelect');
  sel.innerHTML = '';
  for (const s of mgrSets) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = (s.name || s.id) + ' (' + (s.variants ? s.variants.length : 0) + ' màu)';
    sel.appendChild(o);
  }
  if (mgrCurrentId) sel.value = mgrCurrentId;

  const grid = $('mgrVariants');
  grid.innerHTML = '';
  const set = mgrSets.find((s) => s.id === mgrCurrentId);
  if (!set) {
    grid.innerHTML = '<div class="idea-empty">Chưa có bộ nào. Tạo bộ mới ở trên.</div>';
    return;
  }
  if (!set.variants || !set.variants.length) {
    grid.innerHTML = '<div class="idea-empty">Bộ trống — bấm "⬆ Thêm màu" để upload.</div>';
    return;
  }
  for (const v of set.variants) {
    const cell = document.createElement('div');
    cell.className = 'mgr-cell';
    const img = document.createElement('img');
    img.src = thumbUrl(v.fileUrl, 160);
    img.loading = 'lazy';
    const lbl = document.createElement('div');
    lbl.className = 'mgr-lbl';
    lbl.textContent = v.color;
    const del = document.createElement('button');
    del.className = 'mgr-del';
    del.textContent = '🗑';
    del.title = 'Xoá màu ' + v.color;
    del.addEventListener('click', () => deleteVariant(set.id, v.id, v.color));
    cell.appendChild(img);
    cell.appendChild(lbl);
    cell.appendChild(del);
    grid.appendChild(cell);
  }
}

async function openSetManager() {
  if (!$('setMgr')) return;
  $('setMgr').style.display = 'flex';
  $('mgrVariants').innerHTML = '<div class="idea-empty">Đang tải…</div>';
  mgrStatus('info', '');
  await reloadMgrSets(mgrCurrentId);
}

async function createSet() {
  const name = $('mgrNewName').value.trim();
  if (!name) return mgrStatus('err', 'Nhập tên bộ.');
  mgrStatus('info', 'Đang tạo…');
  const res = await send({ type: 'createShirtSet', name });
  if (!res || !res.ok) return mgrStatus('err', (res && res.error) || 'Tạo lỗi');
  $('mgrNewName').value = '';
  mgrStatus('ok', 'Đã tạo bộ "' + name + '".');
  await reloadMgrSets(res.set && res.set.id);
}

async function addVariants(files) {
  const set = mgrSets.find((s) => s.id === mgrCurrentId);
  if (!set) return mgrStatus('err', 'Chọn/tạo bộ trước.');
  const list = [...files];
  if (!list.length) return;
  const colorField = $('mgrColor').value.trim();
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < list.length; i++) {
    mgrStatus('info', 'Đang upload ' + (i + 1) + '/' + list.length + '…');
    try {
      const dataUrl = await fileToDataUrl(list[i]);
      // 1 file → dùng ô màu nếu có; nhiều file → lấy màu theo tên file.
      const color = list.length === 1 && colorField ? colorField : list[i].name.replace(/\.[^.]+$/, '');
      const res = await send({ type: 'uploadVariant', setId: set.id, color, dataUrl, filename: list[i].name });
      if (res && res.ok) ok++;
      else fail++;
    } catch {
      fail++;
    }
  }
  $('mgrColor').value = '';
  mgrStatus(fail ? 'err' : 'ok', 'Thêm màu: ' + ok + ' ok' + (fail ? ', ' + fail + ' lỗi' : '') + '.');
  await reloadMgrSets(set.id);
}

let mgrDelConfirm = false;
async function deleteSet() {
  const set = mgrSets.find((s) => s.id === mgrCurrentId);
  if (!set) return;
  if (!mgrDelConfirm) {
    mgrDelConfirm = true;
    $('mgrDelSet').textContent = '⚠ Bấm lại để xoá';
    setTimeout(() => {
      mgrDelConfirm = false;
      $('mgrDelSet').textContent = '🗑 Xoá bộ';
    }, 2500);
    return;
  }
  mgrDelConfirm = false;
  $('mgrDelSet').textContent = '🗑 Xoá bộ';
  const res = await send({ type: 'deleteShirtSet', setId: set.id });
  if (!res || !res.ok) return mgrStatus('err', (res && res.error) || 'Xoá lỗi');
  mgrCurrentId = null;
  mgrStatus('ok', 'Đã xoá bộ.');
  await reloadMgrSets();
}

async function deleteVariant(setId, variantId, color) {
  const res = await send({ type: 'deleteVariant', setId, variantId });
  if (!res || !res.ok) return mgrStatus('err', (res && res.error) || 'Xoá màu lỗi');
  mgrStatus('ok', 'Đã xoá màu ' + color + '.');
  await reloadMgrSets(setId);
}

function closeSetManager() {
  $('setMgr').style.display = 'none';
  ideasPromise = null; // để idea/list load lại nếu cần
  if (productType === 'shirt') loadList(); // cập nhật danh sách bộ ở màn chính
}

function wireSetManager() {
  if (!$('setMgr')) return;
  $('mgrClose').addEventListener('click', closeSetManager);
  $('setMgr').addEventListener('click', (e) => {
    if (e.target.id === 'setMgr') closeSetManager();
  });
  $('mgrCreate').addEventListener('click', createSet);
  $('mgrSetSelect').addEventListener('change', (e) => {
    mgrCurrentId = e.target.value;
    renderMgr();
  });
  $('mgrDelSet').addEventListener('click', deleteSet);
  $('mgrAddBtn').addEventListener('click', () => $('mgrFiles').click());
  $('mgrFiles').addEventListener('change', (e) => {
    const files = e.target.files;
    e.target.value = '';
    addVariants(files);
  });
}

// ---- Editor vị trí design (kéo/thả · resize · xoay) ------------------------
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
let aeCtx = null; // { set, mockupW, mockupH, scale, area }
let aeDrag = null; // { mode, startX, startY, orig }

function openAreaEditor(set) {
  if (!$('areaEditor')) return;
  const rv = repVariant(set);
  const mockupW = (rv && rv.width) || 0;
  const mockupH = (rv && rv.height) || 0;
  const mockupUrl = set.representativeUrl || (rv && rv.fileUrl) || '';
  if (!mockupW || !mockupH || !mockupUrl) {
    setStatus('err', 'Bộ này thiếu ảnh/kích thước mockup, không chỉnh được.');
    return;
  }
  const base = designAreas[set.id] || set.designArea || { x: 0, y: 0, width: mockupW, height: mockupH, rotation: 0 };
  const area = {
    x: +base.x || 0,
    y: +base.y || 0,
    width: +base.width || Math.round(mockupW / 3),
    height: +base.height || Math.round(mockupH / 3),
    rotation: +base.rotation || 0,
  };

  const scale = Math.min(460 / mockupW, 460 / mockupH, 1);
  aeCtx = { set, mockupW, mockupH, scale, area };

  const stage = $('aeStage');
  stage.style.width = Math.round(mockupW * scale) + 'px';
  stage.style.height = Math.round(mockupH * scale) + 'px';
  $('aeMockup').src = mockupUrl;

  const dImg = $('aeDesign');
  const durl = previewUrlOf(designData);
  if (durl) {
    dImg.src = durl;
    dImg.style.display = '';
  } else {
    dImg.removeAttribute('src');
    dImg.style.display = 'none';
  }

  $('aeTitle').textContent = 'Vị trí design — ' + (set.name || set.id);
  $('aeRot').value = area.rotation;
  $('aeRotVal').textContent = Math.round(area.rotation) + '°';
  renderAeBox();
  $('areaEditor').style.display = 'flex';
}

function renderAeBox() {
  if (!aeCtx) return;
  const { scale, area } = aeCtx;
  const box = $('aeBox');
  box.style.left = Math.round(area.x * scale) + 'px';
  box.style.top = Math.round(area.y * scale) + 'px';
  box.style.width = Math.round(area.width * scale) + 'px';
  box.style.height = Math.round(area.height * scale) + 'px';
  box.style.transform = 'rotate(' + (area.rotation || 0) + 'deg)';
}

function commitAe() {
  if (!aeCtx) return;
  const a = aeCtx.area;
  designAreas[aeCtx.set.id] = {
    x: Math.round(a.x),
    y: Math.round(a.y),
    width: Math.round(a.width),
    height: Math.round(a.height),
    rotation: Math.round(a.rotation) || 0,
  };
}

function closeAe() {
  $('areaEditor').style.display = 'none';
  aeCtx = null;
  renderList($('search').value); // cập nhật marker "đã chỉnh"
  saveState();
}

function wireAreaEditor() {
  if (!$('areaEditor')) return;

  $('aeBox').addEventListener('pointerdown', (e) => {
    if (!aeCtx || e.target.classList.contains('ae-handle')) return;
    e.preventDefault();
    aeDrag = { mode: 'move', startX: e.clientX, startY: e.clientY, orig: { ...aeCtx.area } };
    $('aeBox').setPointerCapture(e.pointerId);
  });

  $('aeHandle').addEventListener('pointerdown', (e) => {
    if (!aeCtx) return;
    e.preventDefault();
    e.stopPropagation();
    aeDrag = { mode: 'resize', startX: e.clientX, startY: e.clientY, orig: { ...aeCtx.area } };
    $('aeHandle').setPointerCapture(e.pointerId);
  });

  document.addEventListener('pointermove', (e) => {
    if (!aeDrag || !aeCtx) return;
    const { scale, mockupW, mockupH, area } = aeCtx;
    const dx = (e.clientX - aeDrag.startX) / scale;
    const dy = (e.clientY - aeDrag.startY) / scale;
    const o = aeDrag.orig;
    if (aeDrag.mode === 'move') {
      area.x = clamp(o.x + dx, 0, mockupW - area.width);
      area.y = clamp(o.y + dy, 0, mockupH - area.height);
    } else {
      area.width = clamp(o.width + dx, 10, mockupW - area.x);
      area.height = clamp(o.height + dy, 10, mockupH - area.y);
    }
    renderAeBox();
  });

  document.addEventListener('pointerup', () => {
    if (aeDrag) {
      aeDrag = null;
      commitAe();
    }
  });

  $('aeRot').addEventListener('input', (e) => {
    if (!aeCtx) return;
    aeCtx.area.rotation = parseInt(e.target.value, 10) || 0;
    $('aeRotVal').textContent = aeCtx.area.rotation + '°';
    renderAeBox();
    commitAe();
  });

  $('aeReset').addEventListener('click', () => {
    if (!aeCtx) return;
    delete designAreas[aeCtx.set.id];
    const base = aeCtx.set.designArea || { x: 0, y: 0, width: aeCtx.mockupW, height: aeCtx.mockupH, rotation: 0 };
    aeCtx.area = {
      x: +base.x || 0,
      y: +base.y || 0,
      width: +base.width || 0,
      height: +base.height || 0,
      rotation: +base.rotation || 0,
    };
    $('aeRot').value = aeCtx.area.rotation;
    $('aeRotVal').textContent = Math.round(aeCtx.area.rotation) + '°';
    renderAeBox();
  });

  $('aeClose').addEventListener('click', closeAe);
  $('areaEditor').addEventListener('click', (e) => {
    if (e.target.id === 'areaEditor') closeAe();
  });
}

// ---- Generate --------------------------------------------------------------
async function doGenerate() {
  clearStatus();
  if (!designData) return setStatus('err', 'Chưa chọn design.');
  if (selected.size === 0) return setStatus('err', 'Chưa chọn bộ nào.');

  $('genBtn').disabled = true;
  setStatus('info', 'Đang generate… (chạy đồng bộ, chờ chút)');

  const msg = {
    type: 'generate',
    productType,
    design: designData,
    watermarkId: $('watermark').value || undefined,
  };
  if (productType === 'shirt') {
    msg.setIds = [...selected];
    msg.count = parseInt($('count').value, 10) || 6;
    const areas = {};
    for (const id of selected) if (designAreas[id]) areas[id] = designAreas[id];
    if (Object.keys(areas).length) msg.designAreas = areas;
  } else {
    msg.mockupIds = [...selected];
  }

  const res = await send(msg);
  if (!res || !res.ok) {
    setStatus('err', 'Thất bại: ' + ((res && res.error) || 'unknown'));
    refreshGenBtn();
    return;
  }
  lastGen = res.generation;
  renderResults(lastGen);
  setStatus('ok', 'Xong ' + lastGen.items.length + ' ảnh trong ' + (lastGen.durationMs || 0) + 'ms.');
  refreshGenBtn();
  saveState();
}

function renderResults(gen) {
  if (!gen) return;
  $('resultCard').style.display = '';
  $('resMeta').textContent = '· ' + gen.items.length + ' ảnh · id ' + gen.id;
  const grid = $('results');
  grid.innerHTML = '';
  for (const it of gen.items) {
    const label = it.label || it.mockupId || it.variantId || 'mockup';
    const cell = document.createElement('div');
    cell.className = 'result';

    const a = document.createElement('a');
    a.href = it.outputUrl;
    a.target = '_blank';
    a.title = 'Mở ảnh gốc';
    a.innerHTML =
      `<img src="${thumbUrl(it.outputUrl, 200)}" loading="lazy" />` +
      `<div class="lbl">${escapeHtml(label)}</div>`;

    const dl = document.createElement('button');
    dl.className = 'res-dl';
    dl.textContent = '⬇';
    dl.title = 'Tải ảnh này về máy';
    dl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      downloadImage(it.outputUrl, label);
    });

    cell.appendChild(a);
    cell.appendChild(dl);
    grid.appendChild(cell);
  }
}

function downloadAllResults() {
  if (!lastGen || !lastGen.items) return;
  for (const it of lastGen.items) {
    downloadImage(it.outputUrl, it.label || it.mockupId || it.variantId || 'mockup');
  }
}

// ---- Wire UI ---------------------------------------------------------------
function initTabs() {
  document.querySelectorAll('.tab[data-src]').forEach((t) => {
    t.addEventListener('click', () => {
      applySrcTabUI(t.dataset.src);
      designData = null;
      if (t.dataset.src === 'idea') loadIdeas();
      updatePreview();
    });
  });

  document.querySelectorAll('.tab[data-type]').forEach((t) => {
    t.addEventListener('click', () => {
      productType = t.dataset.type;
      applyProductTypeUI();
      selected.clear();
      loadList();
    });
  });
}

$('designFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  designData = { kind: 'dataUrl', dataUrl: await fileToDataUrl(f) };
  updatePreview();
});

$('designUrl').addEventListener('input', (e) => {
  const v = e.target.value.trim();
  designData = v ? { kind: 'url', url: v } : null;
  updatePreview();
});

$('count').addEventListener('input', saveState);
$('watermark').addEventListener('change', saveState);

$('search').addEventListener('input', (e) => {
  renderList(e.target.value);
  saveState();
});
$('selAll').addEventListener('click', () => {
  const q = $('search').value.trim().toLowerCase();
  items.filter((it) => !q || (it.name || '').toLowerCase().includes(q)).forEach((it) => selected.add(it.id));
  renderList($('search').value);
  updateSelCount();
});
$('selNone').addEventListener('click', () => {
  selected.clear();
  renderList($('search').value);
  updateSelCount();
});
$('genBtn').addEventListener('click', doGenerate);
const dlAllBtn = $('dlAll');
if (dlAllBtn) dlAllBtn.addEventListener('click', downloadAllResults);
// Popup Chrome bị ĐÓNG khi mở hộp thoại chọn file → mọi thao tác cần <input type=file>
// phải chạy trong TAB (generate.html). Ở popup thì mở tab thay vì làm inline.
const IS_POPUP = location.pathname.endsWith('popup.html');
function openInTab(query) {
  chrome.tabs.create({ url: chrome.runtime.getURL('generate.html' + (query || '')) });
}

const upBtn = $('uploadMockupBtn');
if (upBtn) upBtn.addEventListener('click', () => (IS_POPUP ? openInTab('?open=upload') : $('uploadInput').click()));
const upInput = $('uploadInput');
if (upInput) upInput.addEventListener('change', onUploadMockups);
const manageBtn = $('manageSetsBtn');
if (manageBtn) manageBtn.addEventListener('click', () => (IS_POPUP ? openInTab('?open=manage') : openSetManager()));
$('openOpts').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
const settingsBtn = document.getElementById('settingsBtn'); // chỉ có ở popup
if (settingsBtn) settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

// ---- Đăng nhập ngay trong popup -------------------------------------------
function showLogin(st) {
  const ov = $('loginOverlay');
  if (!ov) return;
  $('loginApiBase').value = (st && st.apiBase) || '';
  ov.style.display = 'flex';
  setTimeout(() => $('loginUser').focus(), 50);
}

async function doLogin() {
  const apiBase = $('loginApiBase').value.trim();
  const username = $('loginUser').value.trim();
  const password = $('loginPass').value;
  const status = $('loginStatus');
  if (!username || !password) {
    status.textContent = 'Nhập tài khoản + mật khẩu.';
    return;
  }
  $('loginBtn').disabled = true;
  status.style.color = '#64748b';
  status.textContent = 'Đang đăng nhập…';
  const res = await send({ type: 'login', apiBase, username, password });
  if (res && res.ok) {
    location.reload(); // đăng nhập xong → nạp lại toàn bộ UI
  } else {
    $('loginBtn').disabled = false;
    status.style.color = '#dc2626';
    status.textContent = (res && res.error) || 'Đăng nhập thất bại';
  }
}

const loginBtn = $('loginBtn');
if (loginBtn) loginBtn.addEventListener('click', doLogin);
const loginPass = $('loginPass');
if (loginPass) loginPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

// ---- Boot ------------------------------------------------------------------
(async () => {
  initTabs();
  wireAreaEditor();
  wireSetManager();

  const st = await send({ type: 'status' });
  if (!st || !st.loggedIn) {
    showLogin(st);
    return; // chưa đăng nhập → chỉ hiện form login, bỏ qua nạp dữ liệu
  }

  const store = await chrome.storage.local.get(['pendingDesign', 'popupState']);
  const pend = store.pendingDesign;
  const saved = store.popupState || {};

  // 1) Loại sản phẩm + count + watermark + search từ state đã lưu
  productType = saved.productType === 'card' ? 'card' : 'shirt';
  applyProductTypeUI();
  await loadWatermarks();
  if (saved.watermarkId) $('watermark').value = saved.watermarkId;
  if (saved.count) $('count').value = saved.count;
  if (saved.search) $('search').value = saved.search;
  if (Array.isArray(saved.selected)) saved.selected.forEach((id) => selected.add(id));
  if (saved.designAreas && typeof saved.designAreas === 'object') Object.assign(designAreas, saved.designAreas);

  // 2) Design: ưu tiên ảnh vừa gửi từ ChatGPT/context menu, sau đó tới state đã lưu
  if (pend) {
    await chrome.storage.local.remove('pendingDesign');
    if (pend.kind === 'ideaId') {
      applySrcTabUI('idea');
      designData = pend;
      await loadIdeas();
      renderIdeaGrid();
    } else {
      applySrcTabUI(pend.kind === 'url' ? 'url' : 'file');
      designData = pend;
      if (pend.kind === 'url') $('designUrl').value = pend.url || '';
    }
  } else if (saved.designData) {
    designData = saved.designData;
    const src = saved.designSrc || (designData.kind === 'ideaId' ? 'idea' : designData.kind === 'url' ? 'url' : 'file');
    applySrcTabUI(src);
    if (designData.kind === 'url') $('designUrl').value = designData.url || '';
    if (src === 'idea') {
      await loadIdeas();
      renderIdeaGrid();
    }
  } else {
    applySrcTabUI('file');
  }
  updatePreview();

  // 3) Danh sách bộ + khôi phục kết quả cũ
  await loadList();
  if (saved.lastGen) {
    lastGen = saved.lastGen;
    renderResults(lastGen);
  }

  stateReady = true;
  flushState(); // chốt lại state hợp lệ sau khi khôi phục

  // Mở sẵn theo yêu cầu từ popup (?open=manage / ?open=upload) — vì popup không chọn file được.
  const openWhat = new URLSearchParams(location.search).get('open');
  if (openWhat === 'manage') {
    openSetManager();
  } else if (openWhat === 'upload') {
    if (productType !== 'card') {
      productType = 'card';
      applyProductTypeUI();
      selected.clear();
      await loadList();
    }
    setStatus('info', 'Bấm "⬆ Upload mockup" để chọn ảnh.');
  }
})();

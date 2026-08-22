# PrimeHorizonMockup (Chrome extension)

Chèn nút **💾 Lưu Idea** lên ảnh trong ChatGPT để lưu thẳng vào **thư viện ý tưởng** (New Idea) của app Bullstart.

## Cài đặt (Load unpacked)

1. Mở `chrome://extensions`.
2. Bật **Developer mode** (góc trên phải).
3. Bấm **Load unpacked** → chọn thư mục `chrome-extension/` này.
4. Bấm icon extension → **Đăng nhập / Cài đặt**:
   - **API Base URL**: `https://genmockup.primehorizon.studio` (mặc định) hoặc `http://localhost:3000` khi chạy local.
   - Nhập **tài khoản + mật khẩu** đúng của app (ảnh sẽ vào thư viện ý tưởng của chính tài khoản đó).
   - Bấm **Đăng nhập & lưu**.

   > Hoặc đăng nhập **ngay trong popup**: bấm icon extension, nếu chưa login sẽ hiện form đăng nhập (API Base + tài khoản + mật khẩu) — đăng nhập xong tự vào thẳng màn Generate.

> Nếu đổi API Base sang domain khác `genmockup.primehorizon.studio` / `localhost:3000`, phải thêm domain đó vào `host_permissions` trong `manifest.json` rồi reload extension.

## Dùng

- Mở [chatgpt.com](https://chatgpt.com), hover chuột vào một ảnh → nút **💾 Lưu Idea** hiện ở góc trên phải → lưu ảnh vào **New Idea → Thư viện ý tưởng**.
- Ảnh đã lưu dùng bình thường: gen title, Apply lên áo, hoặc chọn làm design ở popup Generate (nguồn **Idea**).

## Cách hoạt động

- **Content script** (`content.js`) tìm ảnh trong khung chat, chèn nút, và lấy **bytes ảnh ngay trong trình duyệt** (ưu tiên: đọc `blob:`/`data:` → vẽ canvas → fetch CORS).
- Nếu content script không lấy được (ảnh cross-origin bị chặn), **background** tự `fetch` URL trong trình duyệt (IP + cookie của user) rồi chuyển base64.
- Server **luôn nhận base64**, không tự đi tải link ngoài → tránh lỗi 403 từ `oaiusercontent.com`.
- **Background** (`background.js`) giữ JWT token (lấy từ `/api/auth/login`) và gọi `POST /api/ideas/import` kèm `Authorization: Bearer <token>`.
- Token hết hạn sẽ tự đăng nhập lại bằng thông tin đã lưu.

## Generate mockup (mới)

Ngoài lưu Idea, extension gửi design tới API để **generate mockup** ngay từ trình duyệt.

- Mở qua: **bấm icon extension** → UI generate hiện ngay trong **popup**. Hoặc **chuột phải vào 1 ảnh bất kỳ → "Generate mockup với ảnh này"** (mở tab `generate.html` với ảnh đã điền sẵn — context menu buộc phải mở tab).
- UI cho:
  1. Chọn **design** — 3 nguồn:
     - **File**: upload ảnh từ máy.
     - **URL**: dán link ảnh (nếu vào từ context menu thì tự điền).
     - **Idea**: chọn 1 ảnh trong **thư viện ý tưởng** hiển thị dạng **lưới ảnh** (`GET /api/ideas`) → gửi `designImageId`, server tự đọc file đã lưu (tăng `usedCount`). Mỗi ô ý tưởng khi hover có nút **⬇ tải về máy** và **🗑 xóa** (bấm 🗑 lần 1 để xác nhận, lần 2 để xóa — `DELETE /api/ideas/:id`).
  2b. **Tải kết quả**: mỗi ảnh output có nút **⬇** tải riêng, hoặc bấm **⬇ Tải tất cả** ở khối Kết quả (dùng `chrome.downloads`, cần permission `downloads`).
  2c. **Căn chỉnh vị trí design** (chỉ bộ áo): mỗi dòng bộ áo có nút **✎** → mở editor hiện mockup + khung design; **kéo để di chuyển, kéo góc để resize, thanh trượt để xoay**. Lưu override vào `designAreas[setId]` và gửi kèm khi generate (server ưu tiên override thay cho vị trí mặc định của bộ). Nút **Reset** trả về vị trí gốc. Dòng đã chỉnh hiện dấu *✎ đã chỉnh*.
  2d. **Upload mockup** (chỉ loại **Mockup card**): ở thanh công cụ bấm **⬆ Upload mockup** → chọn nhiều ảnh → mỗi ảnh tạo 1 mockup mới (`POST /api/mockups`, designArea mặc định = full size), xong tự refresh danh sách.
  2e. **Quản lý bộ áo** (chỉ loại **Bộ áo**): bấm **⚙ Quản lý bộ**. *Lưu ý: popup Chrome tự đóng khi mở hộp thoại chọn file, nên khi bấm từ popup sẽ **mở sang tab** (generate.html) để upload ảnh chạy được; nếu đang ở tab thì mở modal ngay tại chỗ.* Modal cho phép:
     - **＋ Tạo bộ** — tạo "folder" bộ áo rỗng theo tên (`POST /api/shirt-sets`).
     - **⬆ Thêm màu** — chọn 1 hoặc nhiều ảnh, mỗi ảnh thành 1 variant màu (`POST /api/shirt-sets/:id/variants`). 1 file → dùng ô "Tên màu"; nhiều file → màu lấy theo **tên file**. Trùng màu thì thay ảnh.
     - **🗑** trên mỗi màu để xoá variant; **🗑 Xoá bộ** để xoá cả bộ.
     - Bộ mới: `designArea` tự tính mặc định (ô giữa ngực 5:7) theo ảnh màu đầu tiên; đóng modal → tự refresh danh sách bộ ở màn generate.

> **Giữ trạng thái:** popup Chrome bị đóng khi bấm ra ngoài, nhưng mọi lựa chọn (design, loại SP, bộ đã tick, count, watermark, kết quả gần nhất) được lưu vào `chrome.storage.local` và **khôi phục lại** khi mở popup lần sau.
  2. Chọn **loại**: *Bộ áo* (`/api/generate/shirt`, có `count` random màu) hoặc *Mockup card* (`/api/generate`).
  3. Tick chọn **các bộ** (đã lưu trên server — extension chỉ gửi **ID**, không upload lại mockup) + watermark tuỳ chọn.
  4. Bấm **Generate** → hiện lưới ảnh output (link tới `/files/...`).

**Design đi vào API thế nào:**
- Upload file / ảnh ChatGPT → tải bytes trong trình duyệt rồi đẩy `designFile` (multipart).
- URL công khai host khác → gửi field `designUrl`, để **server tự tải** (không cần thêm host_permissions).

## Endpoint backend liên quan

- `POST /api/auth/login` → trả `{ ok, username, token }` (token dùng cho extension).
- `POST /api/ideas/import` → nhận `{ imageUrl }` hoặc `{ imageBase64 }` (+ optional `title`, `keyword`, `ideaTitle`), lưu `IdeaImage(saved=true)` cho user, trả về DTO ảnh.
- `GET /api/shirt-sets`, `GET /api/mockups`, `GET /api/watermarks` → danh sách để chọn.
- `POST /api/generate/shirt` (multipart: `designFile`|`designUrl` + `setIds[]` + `count` + optional `colors`, `watermarkId`) → gen bộ áo.
- `POST /api/generate` (multipart: `designFile`|`designUrl` + `mockupIds[]` + optional `watermarkId`) → gen mockup card.
- `POST /api/mockups` (multipart: `file` + `name`) → tạo mockup card mới.
- `POST /api/shirt-sets` (JSON `{name}`) → tạo bộ áo rỗng.
- `POST /api/shirt-sets/:id/variants` (multipart: `file` + `color`) → thêm/thay variant màu.
- `DELETE /api/shirt-sets/:id/variants/:variantId` → xoá variant; `DELETE /api/shirt-sets/:id` → xoá bộ.

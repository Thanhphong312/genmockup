# Hướng dẫn kết nối Google Drive (per-user)

Từ bản multi-user, **mỗi user tự kết nối Google Drive của mình**. Token **không nhập tay** — hệ thống tự lấy qua OAuth và lưu **trong DB theo từng user**. File token chung cũ (`secrets/drive-token.json`) không còn dùng (đã tự migrate cho admin).

---

## 1. Cách hoạt động (tóm tắt)
- User bấm **Kết nối Google Drive** → đăng nhập Google → cấp quyền → Google trả `refresh_token` → server lưu vào DB.
- Lưu ở bảng `app_settings`, khoá `(userId, key = "drive_token")`, value = JSON chứa `refresh_token`. **Chỉ server đọc**, không trả ra client.
- Sau đó user upload output vào **Drive của chính họ** (quota/credit riêng).

---

## 2. Cấu hình OAuth app trên Google (ADMIN làm 1 lần)

> Bước này đã làm sẵn cho `genmockup.primehorizon.studio`. Chỉ cần làm lại nếu đổi domain, đổi Google project, hoặc muốn thêm người dùng.

1. Vào **https://console.cloud.google.com** → tạo/chọn **Project**.
2. **APIs & Services → Library** → bật **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - Điền App name, support email.
   - **Scopes**: thêm `https://www.googleapis.com/auth/drive`.
   - **Test users**: thêm email của những người sẽ dùng (xem mục 4 lưu ý).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs**: thêm CHÍNH XÁC:
     ```
     https://genmockup.primehorizon.studio/api/drive/oauth/callback
     ```
     (thêm `http://localhost:3000/api/drive/oauth/callback` nếu chạy local)
5. Copy **Client ID** + **Client secret** vào `.env` (repo root):
   ```
   GOOGLE_OAUTH_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxxxxxxx
   GOOGLE_OAUTH_REDIRECT_URI=https://genmockup.primehorizon.studio/api/drive/oauth/callback
   ```
   (Không còn dùng `GOOGLE_OAUTH_TOKEN_FILE` / `GOOGLE_DRIVE_PARENT_FOLDER_ID` cho per-user.)
6. **Restart API** (`scripts\windows\start.bat` hoặc `pnpm dev`).

---

## 3. Mỗi user tự lấy token (kết nối Drive)

1. Vào **Generate** → tạo ra 1 bộ ảnh → bấm **Upload to Drive**.
2. Nếu chưa kết nối → bấm **"Kết nối Google Drive"**.
3. Chọn/đăng nhập **tài khoản Google của bạn** → **Allow** quyền Drive.
4. Trình duyệt tự quay lại app → đã kết nối. Token lưu vào DB (của riêng bạn).
5. Chọn folder → **Upload**. File vào Drive của bạn.
6. Muốn đổi tài khoản: bấm **Disconnect** trong modal rồi kết nối lại.

---

## 4. Lưu ý quan trọng

- **App ở trạng thái "Testing"** (mặc định): **chỉ các email đã thêm ở "Test users"** mới kết nối được; người ngoài sẽ bị *"Access blocked / app isn't verified"*.
  - Cách nhanh: thêm từng email vào **Test users** (tối đa 100) — không cần Google verify.
  - Muốn mở cho public: **Publish app** (In production). Vì scope `/auth/drive` là **restricted**, Google có thể **yêu cầu xác minh (verification)** — quy trình lâu. Với nội bộ vài người, cứ để Testing + thêm test users là đủ.
- **Lỗi `no_refresh_token_returned`** khi kết nối: Google chỉ trả `refresh_token` ở lần cấp quyền **đầu tiên**. Nếu trước đó đã cấp quyền:
  - Vào **https://myaccount.google.com/permissions** → gỡ quyền app này → kết nối lại.
  - (App đã set sẵn `access_type=offline` + `prompt=consent` để luôn xin refresh_token.)
- **Lỗi `redirect_uri_mismatch`**: URI trong Google Console phải khớp **tuyệt đối** với `GOOGLE_OAUTH_REDIRECT_URI` (kể cả `https`, không dư dấu `/`).
- **Admin (`bullstart`)**: token Drive cũ đã **tự migrate**, không cần kết nối lại.

---

## 5. Kỹ thuật (cho dev)
- Token per-user: `services/drive.ts` đọc/ghi qua `settings.ts` → bảng `app_settings (userId, key='drive_token')`.
- Luồng OAuth: `/api/drive/oauth/start` (cần đăng nhập) gắn `userId` đã ký vào `state` → `/api/drive/oauth/callback` (public) verify `state` → `exchangeCode(userId, code)` lưu token.
- Ngắt: `/api/drive/oauth/disconnect` xoá token của user.
- Không có endpoint "nhập token thủ công" — token luôn lấy qua OAuth.

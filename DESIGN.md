# Gen Mockup Bull Start — Thiết kế hệ thống

## 1. Tổng quan

Web app gen mockup: nhận ảnh design (5x7 inch), ghép vào từng ảnh mockup theo vị trí + kích thước đã được cấu hình sẵn cho mỗi mockup, optional thêm watermark, output upload lên Firebase Storage.

### Mục tiêu
- Setup vị trí/kích thước design + watermark cho từng mockup qua editor canvas (kéo thả).
- Gen mockup theo 2 cách: Web UI hoặc API.
- Output dùng cho **preview online** (sRGB, PNG/JPG).
- Output **giữ nguyên kích thước của ảnh mockup gốc** (không resize cuối).

### Phi mục tiêu (giai đoạn 1)
- Không in ấn POD (không cần CMYK / 300 DPI / ICC profile).
- Không auth/multi-tenant.
- Không displacement mapping (ghép phẳng).
- Watermark chỉ có vị trí + size + rotation; **không** có opacity / blend mode tuỳ chỉnh (luôn dùng alpha mặc định của ảnh PNG upload).

---

## 2. Stack công nghệ

| Layer | Công nghệ | Lý do |
|---|---|---|
| Backend | **Node.js 20 + Fastify** | Nhanh, type-safe, cùng ngôn ngữ FE |
| Image | **Sharp** (libvips, Lanczos3) | Chất lượng resize đẹp nhất, nhanh, alpha chuẩn |
| Database | **SQLite** (file `storage/genmockup.db`) | Zero-config, không service riêng, không sợ chết như XAMPP. Đủ cho single-user. |
| ORM | **Prisma** | Migration tự động, type-safe, DX cực tốt |
| Storage | **Local filesystem** (`./storage/`) | Match deploy local + tunnel; phục vụ qua static route |
| Frontend | **React 18 + Vite + TypeScript** | Tooling nhanh, ecosystem mạnh |
| Editor canvas | **react-konva** | Kéo/thả/resize vùng design + watermark |
| UI | **TailwindCSS + shadcn/ui** | Build UI nhanh, đẹp |
| State/fetch | **TanStack Query** | Cache + invalidate API |
| Deploy | **Local + Cloudflare Tunnel** | Expose qua `genmockup.primehorizon.studio` |
| Process manager | **PM2** | Auto restart, log |

### Loại bỏ vì không cần ở giai đoạn 1
- BullMQ/Redis queue (chỉ vài chục ảnh/lần → sync OK).
- Firebase (chuyển sang SQLite + local storage).
- Cloud Run / serverless.

---

## 3. Kiến trúc

```
┌─────────────────────────────────────┐
│  Browser (React + Konva)            │
│  - Editor mockup                    │
│  - Form upload / Generate           │
└────────────────┬────────────────────┘
                 │ HTTPS
                 ▼
   ┌─────────────────────────────┐
   │  Cloudflare Tunnel          │
   │  genmockup.primehorizon.studio          │
   └────────────────┬────────────┘
                    │ localhost:3000
                    ▼
   ┌─────────────────────────────┐
   │  Fastify (local)            │
   │  - REST API + Sharp         │
   │  - Static /files/*          │
   └────┬───────────────────┬────┘
        │                   │
        ▼                   ▼
  ┌───────────┐      ┌─────────────────┐
  │ SQLite    │      │ ./storage/      │
  │ file:     │      │  mockups/       │
  │ genmockup │      │  watermarks/    │
  │           │      │  designs/       │
  │           │      │  outputs/       │
  └───────────┘      └─────────────────┘
```

---

## 4. Cấu trúc dự án (monorepo)

```
genmockupbullstart/
├── mockup/                    # ảnh mockup gốc (đã có)
├── flow.md                    # yêu cầu gốc
├── DESIGN.md                  # file này
├── package.json               # root workspaces
├── .env                       # FIREBASE_*, PORT...
├── docker-compose.yml         # optional cho local dev
│
├── storage/                   # ảnh user upload + output (gitignored)
│   ├── mockups/
│   ├── watermarks/
│   ├── designs/
│   └── outputs/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── apps/
│   ├── api/                   # Fastify backend
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   │   ├── mockups.ts
│   │   │   │   ├── watermarks.ts
│   │   │   │   └── generate.ts
│   │   │   ├── services/
│   │   │   │   ├── db.ts              # Prisma client
│   │   │   │   ├── storage.ts         # đọc/ghi ./storage/
│   │   │   │   └── composer.ts        # Sharp pipeline
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   └── web/                   # React frontend
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── MockupList.tsx
│       │   │   ├── MockupEditor.tsx   # Konva editor
│       │   │   ├── Generate.tsx
│       │   │   └── Watermarks.tsx
│       │   ├── components/
│       │   └── api/client.ts
│       └── package.json
│
└── packages/
    └── shared/                # types dùng chung FE/BE
        └── src/types.ts
```

---

## 5. Data model (SQLite — Prisma schema)

```prisma
// prisma/schema.prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Mockup {
  id            String   @id @default(cuid())
  name          String
  filePath      String              // "mockups/abc.png"
  width         Int
  height        Int

  // design area (always present)
  designX       Int
  designY       Int
  designWidth   Int
  designHeight  Int
  designRotation Float   @default(0)

  // watermark area (optional → all nullable)
  watermarkX        Int?
  watermarkY        Int?
  watermarkWidth    Int?
  watermarkHeight   Int?
  watermarkRotation Float?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  generationItems GenerationItem[]
}

model Watermark {
  id          String   @id @default(cuid())
  name        String
  filePath    String              // "watermarks/abc.png"
  width       Int
  height      Int
  createdAt   DateTime @default(now())

  generations Generation[]
}

model Generation {
  id           String   @id @default(cuid())
  designPath   String              // "designs/2026-05-20/uuid.png" hoặc URL gốc
  designIsUrl  Boolean  @default(false)
  watermarkId  String?
  watermark    Watermark? @relation(fields: [watermarkId], references: [id])
  status       String   @default("pending")  // pending | done | error
  error        String?
  durationMs   Int?
  createdAt    DateTime @default(now())

  items        GenerationItem[]
}

model GenerationItem {
  id           String   @id @default(cuid())
  generationId String
  generation   Generation @relation(fields: [generationId], references: [id], onDelete: Cascade)
  mockupId     String
  mockup       Mockup   @relation(fields: [mockupId], references: [id])
  outputPath   String              // "outputs/<genId>/<mockupId>.png"
  createdAt    DateTime @default(now())
}
```

### Lưu ý
- Tất cả `filePath` / `outputPath` là **đường dẫn tương đối** trong `./storage/`.
- URL public được build runtime: `https://genmockup.primehorizon.studio/files/<filePath>`.
- Watermark area nullable → mockup có thể không support watermark.

---

## 6. Storage layout (local filesystem)

Root: `D:\genmockupbullstart\storage\` (gitignored)

```
storage/
├── mockups/{mockupId}.{ext}
├── watermarks/{watermarkId}.{ext}
├── designs/{yyyy-mm-dd}/{uuid}.{ext}
└── outputs/{generationId}/{mockupId}.png
```

Fastify expose qua static route: `GET /files/*` → đọc trực tiếp từ `./storage/`.

Public URL: `https://genmockup.primehorizon.studio/files/mockups/abc.png`

---

## 7. API spec

Base URL local: `http://localhost:3000`
Base URL public: `https://genmockup.primehorizon.studio` (qua Cloudflare Tunnel)

### 7.1 Mockup
- `GET    /api/mockups` → list
- `POST   /api/mockups` (multipart: `file`, `name`) → upload ảnh mockup, trả về record (designArea mặc định = full size, user chỉnh sau)
- `GET    /api/mockups/:id` → chi tiết
- `PUT    /api/mockups/:id` (json: `{ name?, designArea?, watermarkArea? }`) → update setting vị trí
- `DELETE /api/mockups/:id`

### 7.2 Watermark
- `GET    /api/watermarks`
- `POST   /api/watermarks` (multipart: `file`, `name`)
- `DELETE /api/watermarks/:id`

### 7.3 Generate (core)
- `POST /api/generate`
  - **Body** (2 dạng):
    1. Multipart: `designFile` + `mockupIds[]` + `watermarkId?`
    2. JSON: `{ designUrl: string, mockupIds: string[], watermarkId?: string }`
  - **Response**:
    ```json
    {
      "id": "gen_abc",
      "status": "done",
      "outputs": [
        { "mockupId": "m1", "url": "https://..." },
        { "mockupId": "m2", "url": "https://..." }
      ],
      "durationMs": 1240
    }
    ```
- `GET /api/generations/:id` → tra cứu lại

### 7.4 Health
- `GET /health` → `{ ok: true, version }`

---

## 8. Sharp compose pipeline

### Thứ tự layer (z-index dưới → trên)
1. **Design** — dưới cùng
2. **Mockup** — đè lên design (cần có alpha trong suốt ở vùng đặt design)
3. **Watermark** — trên cùng (optional)

> **Quan trọng:** ảnh mockup phải có vùng trong suốt nơi muốn design hiện ra. Mockup PNG đặc (không alpha) sẽ che mất design. Đây là kỹ thuật chuẩn của realistic mockup — các chi tiết như nếp gấp, bóng đổ, vải cấu trúc của mockup sẽ phủ tự nhiên lên design.

Pseudo-code:

```ts
async function compose(opts) {
  const { width: W, height: H } = await sharp(opts.mockupBuf).metadata();

  // Resize design về kích thước designArea (Lanczos3)
  const designLayer = await sharp(opts.designBuf)
    .resize(designArea.width, designArea.height, { kernel: 'lanczos3', fit: 'fill' })
    .rotate(designArea.rotation, { background: transparent })
    .png().toBuffer();

  const layers = [
    { input: designLayer, top, left, blend: 'over' },         // dưới
    { input: opts.mockupBuf, top: 0, left: 0, blend: 'over' }, // giữa — đè lên design
  ];

  if (opts.watermarkBuf && opts.watermarkArea) {
    const wmLayer = await prepareLayer(opts.watermarkBuf, opts.watermarkArea);
    layers.push({ input: wmLayer, top, left, blend: 'over' });  // trên cùng
  }

  // Base = canvas trong suốt cùng kích thước mockup
  return sharp({
    create: { width: W, height: H, channels: 4, background: { r:0,g:0,b:0,alpha:0 } }
  })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();
}
```

### Lưu ý chất lượng
- **Luôn dùng `kernel: lanczos3`** khi resize → ảnh sắc nét nhất.
- **`fit: 'fill'`** vì design 5x7 đã đúng tỉ lệ designArea (user đã chỉnh sẵn).
- **`blend: 'over'`** = alpha compositing chuẩn.
- Output **giữ nguyên kích thước mockup gốc** (không resize cuối).
- Giữ định dạng PNG cho output để giữ alpha và không bị nén lossy.
- Nếu cần dung lượng nhỏ → option `.jpeg({ quality: 92, mozjpeg: true })` cho ảnh không alpha.

---

## 9. Flow Web UI

### Trang `Mockups`
- Danh sách thẻ mockup (thumbnail + tên).
- Nút **Upload mockup mới**.
- Mỗi mockup có nút **Sửa vị trí design**.

### Trang `Mockup Editor` (react-konva)
- Hiển thị ảnh mockup full size.
- 2 khung kéo/thả/resize/xoay:
  - Khung xanh = `designArea`
  - Khung tím = `watermarkArea` (toggle bật/tắt)
- Tỉ lệ khung design **lock 5:7** (để khớp design input).
- Sidebar hiển thị toạ độ x, y, w, h, rotation (có thể nhập số).
- Nút **Lưu** → `PUT /api/mockups/:id`.

### Trang `Generate`
- Step 1: Upload design (hoặc dán URL).
- Step 2: Chọn 1+ mockup (multi-select có preview).
- Step 3: Chọn watermark (optional).
- Nút **Generate** → gọi `POST /api/generate` → hiển thị grid kết quả + nút Download.

### Trang `Watermarks`
- Upload / list / delete watermark.

---

## 10. Cấu hình & secrets

`.env`:
```
PORT=3000
DATABASE_URL="file:../../../storage/genmockup.db"    # SQLite, path từ schema.prisma
STORAGE_DIR=./storage
PUBLIC_URL=https://genmockup.primehorizon.studio
CORS_ORIGIN=https://genmockup.primehorizon.studio,http://localhost:5173,http://localhost:3000

# Login (để trống tắt auth)
AUTH_USERNAME=bullstart
AUTH_PASSWORD="<mật khẩu, xem .env — không ghi ra doc>"
AUTH_SECRET="<random>"

# Google Drive OAuth 2.0 (để trống tắt feature)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=https://genmockup.primehorizon.studio/api/drive/oauth/callback
GOOGLE_OAUTH_TOKEN_FILE=./secrets/drive-token.json
GOOGLE_DRIVE_PARENT_FOLDER_ID=
```

- SQLite file tự tạo bởi `prisma migrate dev`. Không cần service riêng.
- API loader đọc theo thứ tự: root `.env` → `apps/api/.env` (no override).
- Auth dùng cookie HTTP-only (JWT 30 ngày). Bỏ AUTH_USERNAME/PASSWORD để tắt login gate.

---

## 11. Deploy local + Cloudflare Tunnel

### Bước 1: Chạy local
```powershell
# terminal 1: backend
pnpm --filter api dev      # http://localhost:3000

# terminal 2: frontend
pnpm --filter web dev      # http://localhost:5173
```

Production:
```powershell
pnpm build
pm2 start ecosystem.config.js
```

`ecosystem.config.js` (PM2):
- `api` → `node apps/api/dist/server.js` (port 3000)
- `web` → serve static `apps/web/dist` qua Fastify static plugin hoặc Caddy

### Bước 2: Cloudflare Tunnel (domain `genmockup.primehorizon.studio`)
```powershell
cloudflared tunnel login
cloudflared tunnel create genmockup
cloudflared tunnel route dns genmockup genmockup.primehorizon.studio
cloudflared tunnel run genmockup
```

`~/.cloudflared/config.yml`:
```yaml
tunnel: genmockup
credentials-file: C:\Users\thanh\.cloudflared\<id>.json
ingress:
  - hostname: genmockup.primehorizon.studio
    service: http://localhost:3000
  - service: http_status:404
```

Frontend build sẽ được serve qua chính backend → 1 domain duy nhất.

### Bước 3: One-command background (KHUYẾN NGHỊ)
Chạy mọi thứ ngầm bằng 1 file bat:
```cmd
scripts\windows\start.bat   :: start ngầm API + tunnel
scripts\windows\stop.bat    :: stop
scripts\windows\status.bat  :: check
```
Chi tiết ở `scripts/windows/README.md`. Có hướng dẫn auto-start theo Task Scheduler / Startup folder.

---

## 12. Roadmap implement

### Phase 1 — Setup
- Init monorepo (pnpm workspaces)
- Setup Fastify + Sharp + Prisma (SQLite)
- Setup React + Vite + Tailwind + shadcn
- Chạy `pnpm prisma:migrate` để tạo file `storage/genmockup.db`

### Phase 2 — Backend core
- Static route `/files/*` phục vụ `./storage/`
- CRUD `mockups` (upload, save vào `./storage/mockups/`)
- CRUD `watermarks`
- `POST /api/generate` (sync, Sharp compose)
- Lưu log `generations` + `generation_items`

### Phase 3 — Frontend
- Trang Mockups (list, upload)
- Mockup Editor với react-konva (kéo thả 5:7, watermark area)
- Trang Generate (upload design + multi-select mockup + preview)
- Trang Watermarks

### Phase 4 — Polish & deploy
- API key middleware
- Error handling + toast
- PM2 ecosystem config
- Cloudflare Tunnel → `genmockup.primehorizon.studio`
- Seed 4 mockup có sẵn (`mockup/background_*.png`) vào DB

### Phase 5 (sau, optional)
- Queue BullMQ nếu batch lớn
- Webhook callback khi gen xong
- In ấn POD (CMYK pipeline) — chuyển sang ImageMagick/Wand

---

## 12.1 Google Drive integration (optional)

App có thể upload ảnh output lên Google Drive sau khi gen, dùng **Service Account** (không cần OAuth user login).

### Setup
1. Vào [Google Cloud Console](https://console.cloud.google.com) → tạo project mới (hoặc dùng có sẵn).
2. **APIs & Services → Enable APIs** → bật **Google Drive API**.
3. **IAM & Admin → Service Accounts** → **Create service account**:
   - Name: `genmockup-uploader`
   - Skip phần roles (không cần)
   - Click vào SA vừa tạo → tab **Keys** → **Add Key → Create new key → JSON** → tải về.
4. Lưu file JSON vào `secrets/drive-sa.json` (đã gitignore).
5. Trong Drive cá nhân: tạo folder cha (ví dụ `MockupOutputs`) → **Share** với email của Service Account (xem trong JSON, field `client_email`, dạng `...@...iam.gserviceaccount.com`) với quyền **Editor**.
6. Copy folder ID từ URL Drive (`https://drive.google.com/drive/folders/<FOLDER_ID>`) → set vào `GOOGLE_DRIVE_PARENT_FOLDER_ID`.
7. Restart API server.

### Cách dùng
- Trong trang Generate, sau khi gen xong → nút **Upload to Drive** → modal hiện danh sách subfolder trong folder cha → chọn hoặc tạo mới → upload.
- File trên Drive đặt tên: `<generationId>_<mockupName>.png`
- Có thể tắt feature: để trống `GOOGLE_SERVICE_ACCOUNT_FILE` → UI sẽ hiển thị "chưa cấu hình".

### Endpoints
- `GET /api/drive/status` → `{ configured, parentFolderId }`
- `GET /api/drive/folders[?parentId=]` → list subfolders
- `POST /api/drive/folders { name, parentId? }` → tạo folder mới
- `POST /api/drive/upload { generationId, folderId }` → upload toàn bộ items của 1 generation

---

## 13. Đã chốt
| Câu hỏi | Trả lời |
|---|---|
| Domain | `genmockup.primehorizon.studio` (Cloudflare Tunnel) |
| Database | SQLite (`storage/genmockup.db`) + Prisma ORM |
| Storage | Local filesystem `./storage/` (serve qua `/files/*`) |
| Watermark | Ảnh upload, chỉ set vị trí + size + rotation (không opacity/blend) |
| Resolution output | Giữ nguyên kích thước ảnh mockup gốc |
| Design input | Tỉ lệ 5:7 (designArea trong editor cũng lock 5:7) |
| Z-order | Design (dưới) → Mockup (giữa) → Watermark (trên) |
| Google Drive | Optional, Service Account, upload output sau gen vào folder cha config sẵn |

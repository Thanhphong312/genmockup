# Setup Cloudflare Tunnel → genmockup.primehorizon.studio

Hướng dẫn expose app local ra public qua **Cloudflare Tunnel** trên **account Cloudflare MỚI** (zone `primehorizon.studio`).

> ⚠️ **Bối cảnh quan trọng — đọc kỹ:**
> Máy này đang chạy tunnel `genmockup` (account cũ `bullstart.us`) và tunnel đó **phục vụ cả app khác** là `media.bullstart.us` (→ localhost:8001 `/api`, localhost:5050).
> **TUYỆT ĐỐI KHÔNG xóa tunnel `genmockup`** — sẽ làm sập `media.bullstart.us`.
> Cách đúng: **tạo một tunnel MỚI, tên khác (`genmockup-ph`) trên account mới**, chạy song song. Không route được domain mới vào tunnel cũ vì khác account.
>
> Ngoài ra có 1 cloudflared **service** chạy tunnel bằng token (id `81d3a314…`) — tunnel khác, **không đụng tới**.

| | Cũ (giữ nguyên) | Mới (tạo mới) |
|---|---|---|
| Account | bullstart.us | **primehorizon.studio** |
| Tunnel | `genmockup` (id 76ddd20a) | **`genmockup-ph`** |
| Domain | media.bullstart.us | **genmockup.primehorizon.studio** |
| Config | `~/.cloudflared/config.yml` | `~/.cloudflared/config-ph.yml` |
| Origin | :8001 / :5050 (hubmedia) | :3000 (app này) |

---

## Đã làm sẵn trong repo/máy

- ✅ `.env` + `apps/api/.env`: `PUBLIC_URL`, `CORS_ORIGIN`, `GOOGLE_OAUTH_REDIRECT_URI` → domain mới.
- ✅ Extension PrimeHorizonMockup: mặc định trỏ domain mới.
- ✅ `~/.cloudflared/config.yml`: **đã gỡ rule `tool.bullstart.us`**, chỉ còn `media.bullstart.us`.
- ✅ `~/.cloudflared/config-ph.yml`: đã tạo (còn cần điền tunnel id — Bước 3).
- ✅ `start.bat`/`stop.bat`: chạy/stop **cả 2 tunnel** (media + app mới), không đụng token service.

Việc còn lại là các lệnh cloudflared cần bạn tự chạy (cần đăng nhập account mới):

---

## Bước 1: Login cloudflared vào ACCOUNT MỚI

```powershell
cloudflared tunnel login
```

- Trình duyệt mở → đăng nhập **Cloudflare account mới** → chọn domain `primehorizon.studio` → **Authorize**.
- Cert lưu vào `C:\Users\<you>\.cloudflared\cert.pem` (ghi đè cert cũ).

> Ghi đè cert **không** làm rớt tunnel đang chạy (`genmockup` dùng file JSON credentials, không dùng cert.pem). Sau này muốn quản lý lại tunnel cũ thì `cloudflared tunnel login` lại account cũ.

---

## Bước 2: Tạo tunnel mới

```powershell
cloudflared tunnel create genmockup-ph
```

Output in ra tunnel ID + path credentials JSON:
```
Created tunnel genmockup-ph with id abcd1234-....
Tunnel credentials written to C:\Users\<you>\.cloudflared\abcd1234-....json
```

**Lưu lại `<NEW_TUNNEL_ID>`.**

---

## Bước 3: Điền tunnel id vào config-ph.yml

Mở `C:\Users\<you>\.cloudflared\config-ph.yml`, thay `<NEW_TUNNEL_ID>`:

```yaml
tunnel: genmockup-ph
credentials-file: C:\Users\<you>\.cloudflared\<NEW_TUNNEL_ID>.json

ingress:
  - hostname: genmockup.primehorizon.studio
    service: http://localhost:3000
  - service: http_status:404
```

---

## Bước 4: Route DNS (trên account mới)

```powershell
cloudflared tunnel route dns genmockup-ph genmockup.primehorizon.studio
```

Tạo CNAME `genmockup.primehorizon.studio` → `<NEW_TUNNEL_ID>.cfargotunnel.com` trên DNS của `primehorizon.studio`.

> Nếu báo record đã tồn tại: xoá record `genmockup` trong Cloudflare DNS rồi chạy lại, hoặc thêm `--overwrite-dns`.
> Yêu cầu: zone `primehorizon.studio` đã **Active** trong account mới.

---

## Bước 5: (nếu dùng Google Drive) Update GCP OAuth

1. [GCP Credentials](https://console.cloud.google.com/apis/credentials) → mở OAuth client đang dùng.
2. **Authorized JavaScript origins** → thêm `https://genmockup.primehorizon.studio`
3. **Authorized redirect URIs** → thêm `https://genmockup.primehorizon.studio/api/drive/oauth/callback`
4. Save. Giữ luôn các URL `localhost` để dev.

---

## Bước 6: Chạy

```powershell
scripts\windows\start.bat
```

start.bat sẽ: build FE nếu thiếu → chạy API (:3000) → **chạy 2 tunnel**:
- `genmockup` (media.bullstart.us) — config mặc định
- `genmockup-ph` (genmockup.primehorizon.studio) — config-ph.yml

rồi health-check `https://genmockup.primehorizon.studio/health`.

Dừng: `scripts\windows\stop.bat` (chỉ stop 2 tunnel này + API + web, **không** đụng token service). Trạng thái: `scripts\windows\status.bat`.

### Chạy thủ công (nếu cần)
```powershell
# App mới
cloudflared tunnel --config %USERPROFILE%\.cloudflared\config-ph.yml run genmockup-ph
# Media (tunnel cũ)
cloudflared tunnel run genmockup
```

---

## Bước 7: Extension

1. `chrome://extensions` → **Reload** extension PrimeHorizonMockup.
2. ⚙ Cài đặt → API Base = `https://genmockup.primehorizon.studio` → **Đăng nhập lại**.

---

## Bước 8: Test

- `https://genmockup.primehorizon.studio` → FE load, đăng nhập, generate OK.
- `https://media.bullstart.us` vẫn chạy (tunnel `genmockup` không bị đụng).
- Extension bấm icon → generate ra ảnh OK.

---

## Troubleshooting

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `This tunnel has active connections` khi xoá | Đang có replica chạy | **Không cần xoá** tunnel cũ. Chỉ stop process nếu thật sự muốn xoá: `stop.bat` rồi đợi 1–2 phút. |
| media.bullstart.us sập | Đã kill/đổi nhầm tunnel `genmockup` | Chạy lại `cloudflared tunnel run genmockup` (hoặc `start.bat`) |
| DNS domain mới không lên | Zone chưa Active / route sai account | Kiểm tra `primehorizon.studio` Active trong account mới; chạy lại Bước 4 |
| `record already exists` | CNAME `genmockup` đã có | Xoá record cũ hoặc `--overwrite-dns` |
| Tunnel mới dùng nhầm account | cert.pem còn account cũ | `cloudflared tunnel login` lại account mới |
| `redirect_uri_mismatch` (Google) | GCP chưa add URL mới | Bước 5 |
| Tunnel OK nhưng 502 | App origin (:3000) chưa chạy | Check API — `logs\api.err.log` |

---

## Sơ đồ (sau migrate)

```
                         ┌──────────────────────────────┐
genmockup.primehorizon.studio ──►│ tunnel genmockup-ph (acc mới)│──► localhost:3000  (app này)
                         └──────────────────────────────┘
                         ┌──────────────────────────────┐
media.bullstart.us ─────────────►│ tunnel genmockup (acc cũ)    │──► localhost:8001 / :5050 (hubmedia)
                         └──────────────────────────────┘
   (cloudflared service token 81d3a314… = tunnel khác, không đụng)
```

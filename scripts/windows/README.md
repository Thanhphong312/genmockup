# Gen Mockup — Windows Service Scripts

Chạy app ngầm bằng 1 lệnh duy nhất. Không cần mở cmd thủ công.

## Quick start

```cmd
D:\genmockupbullstart\scripts\windows\start.bat
```

Mở app: <https://genmockup.primehorizon.studio>

## Các lệnh

| Script | Mô tả |
|---|---|
| `start.bat` | Khởi động API + Cloudflared tunnel chạy ngầm (hidden window). Tự build FE nếu chưa có. Health-check sau khi start xong. |
| `stop.bat` | Dừng cả 2 service. Kill PID từ file pid + fallback kill port 3000 và process `cloudflared`. |
| `status.bat` | Xem service nào đang chạy + health check local/tunnel. |

## Cách hoạt động

```
start.bat
   ├── kill port 3000 stale
   ├── build FE (nếu logs/web/dist/index.html missing)
   ├── spawn pnpm --filter api serve  (hidden, log → logs/api.log)
   │   └─ PID lưu vào logs/api.pid
   ├── spawn cloudflared tunnel run genmockup  (hidden, log → logs/tunnel.log)
   │   └─ PID lưu vào logs/tunnel.pid
   └── health check local + tunnel
```

Process chạy không có cửa sổ console (Hidden PowerShell), output đẩy vào:
- `logs/api.log` / `logs/api.err.log`
- `logs/tunnel.log` / `logs/tunnel.err.log`

## Yêu cầu lần đầu

Trước khi chạy `start.bat` lần đầu:

1. **Install deps**:
   ```cmd
   pnpm install
   ```
2. **Khởi tạo DB SQLite + seed**:
   ```cmd
   pnpm prisma:migrate
   pnpm seed
   ```
3. **Cloudflared tunnel đã setup** (xem `TUNNEL_SETUP.md`):
   - `cloudflared tunnel login`
   - `cloudflared tunnel create genmockup`
   - `cloudflared tunnel route dns genmockup genmockup.primehorizon.studio`
   - File `~/.cloudflared/config.yml` đã có
4. **`.env` đã đầy đủ** (auth, OAuth Google, etc.)

## Auto-start khi mở Windows

### Cách 1: Windows Startup folder (đơn giản nhất)

1. Mở `Run` (Win+R) → gõ `shell:startup` → Enter
2. Tạo shortcut tới `D:\genmockupbullstart\scripts\windows\start.bat`
3. Right-click shortcut → Properties → Run: `Minimized`

App sẽ tự start sau khi bạn đăng nhập Windows.

### Cách 2: Task Scheduler (chạy cả khi chưa login)

1. Mở `Task Scheduler` → Create Basic Task
2. Name: `GenMockup AutoStart`
3. Trigger: **When the computer starts** (hoặc At log on)
4. Action: **Start a program**
   - Program: `D:\genmockupbullstart\scripts\windows\start.bat`
   - Start in: `D:\genmockupbullstart`
5. Finish
6. Edit task → tab General → check **Run with highest privileges** (nếu cần kill port)

## Troubleshooting

| Triệu chứng | Fix |
|---|---|
| API not starting | Xem `logs/api.err.log`. Thường là port 3000 đang dùng, hoặc `.env` thiếu var, hoặc DB chưa migrate. |
| Tunnel DOWN trong status | Cloudflared chưa login hoặc tunnel `genmockup` chưa tồn tại. Chạy `cloudflared tunnel login` + `create genmockup`. |
| `taskkill` báo access denied | Mở terminal as Administrator. |
| Port 3000 vẫn busy sau stop | Có process `pnpm`/`tsx`/`node` con không bị kill. Chạy `stop.bat` lần 2, hoặc thủ công: `powershell "Get-NetTCPConnection -LocalPort 3000 \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"` |
| FE thay đổi không cập nhật | Build lại: `pnpm --filter web build`, rồi `stop.bat` + `start.bat`. |
| Health check tunnel FAIL | Tunnel cần ~10s để ổn định. Đợi 1 chút rồi `status.bat` lại. |

## Logs

```
logs/
├── api.log        stdout của API
├── api.err.log    stderr của API
├── api.pid        PID
├── tunnel.log     stdout của cloudflared
├── tunnel.err.log stderr của cloudflared
└── tunnel.pid     PID
```

Theo dõi realtime:
```powershell
Get-Content logs\api.log -Wait -Tail 20
```

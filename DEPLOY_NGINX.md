# Deploy lên server với Nginx + MySQL — `mockup.primehorizon.studio`

Hướng dẫn dựng bản production trên Ubuntu 22.04/24.04, chạy sau Nginx + HTTPS, dùng **MySQL 8**.
Khác với cách đang chạy hiện tại (Windows + SQLite + Cloudflare Tunnel, xem `TUNNEL_SETUP.md`).

> **Trạng thái ngày 22/08/2026** — toàn bộ mục 2→10 đã chạy xong trên `143.244.165.189`:
> MySQL 8.0.46 + Node 22.23 + Nginx 1.24 + Let's Encrypt, ba service `genmockup`/`mysql`/`nginx`
> đều active, `https://mockup.primehorizon.studio` chạy đầy đủ.
>
> | Hạng mục | Kết quả |
> |---|---|
> | Metadata | 7.126 dòng / 14 bảng, đối chiếu **khớp hash** từng bảng với SQLite nguồn |
> | Ảnh | 8.259 file / 14,69 GB, khớp tên + kích thước 100%, mẫu 20 file khớp **sha1** |
> | Đĩa | dùng 20 GB / 232 GB |
> | Ảnh qua HTTPS | `/files/...` và `/thumb` đều trả 200 đúng content-type |
>
> **Chưa cắt.** Bản Windows cũ vẫn đang chạy trên `genmockup.primehorizon.studio` và vẫn là
> bản dùng thật. Trước khi cắt: dừng app cũ → chạy lại đồng bộ ảnh (chỉ gửi phần chênh) →
> chuyển lại database → làm mục 11 (extension + Drive OAuth). Dữ liệu trên server mới là
> ảnh chụp lúc 22/08 15:17, sẽ lạc hậu dần khi người dùng còn dùng bản cũ.
>
> Chứng chỉ Let's Encrypt đăng ký **không kèm email** (`--register-unsafely-without-email`)
> nên không có cảnh báo hết hạn qua mail — tự gia hạn vẫn chạy bằng `certbot.timer`.
> Thêm email sau bằng `certbot update_account --email <mail>`.

Kiến trúc sau khi deploy — **một origin duy nhất**, không có CORS:

```
Internet → Nginx :443 (TLS)
             ├── /files/*   → đọc thẳng từ đĩa (không qua Node)
             └── mọi thứ còn lại → Node/Fastify 127.0.0.1:3000
                                     ├── /api/*      REST
                                     ├── /thumb      thumbnail cache
                                     └── /*          SPA (apps/web/dist)

                        Node ──→ MySQL 8 @ 127.0.0.1:3306  (chỉ metadata)
                             ──→ /srv/genmockup/storage     (toàn bộ ảnh)
```

> **Ảnh KHÔNG nằm trong database.** MySQL chỉ giữ metadata + đường dẫn *tương đối*;
> file thật nằm trên đĩa dưới `STORAGE_DIR`. Backup phải lấy **cả hai**, mất một trong
> hai là hỏng.

---

## 1. Cấu hình server

| Hạng mục | Khuyến nghị | Ghi chú |
|---|---|---|
| CPU | **4 vCPU** | 1 vCPU ≈ 1 user đang generate. Chọn single-core mạnh, tránh "shared vCPU" bị throttle |
| RAM | 8 GB | Node ~200 MB lúc tải nặng, MySQL ~500 MB; phần còn lại làm page cache ảnh |
| Đĩa | **200 GB NVMe** | Hiện đã 12 GB ảnh, tăng ~3,5 GB/tháng. Đĩa là thứ hết trước, không phải CPU |
| OS | Ubuntu 22.04 / 24.04 LTS | |

> **Vẫn chỉ chạy được đúng 1 instance app.** Đổi sang MySQL gỡ được ràng buộc "DB là 1 file",
> nhưng `STORAGE_DIR` vẫn là filesystem cục bộ. Muốn chạy nhiều node phải chuyển ảnh sang
> object storage (S3/R2) trước, hoặc mount chung NFS.

Database rất nhỏ — hiện khoảng **7.000 dòng / vài MB**, tuyệt đại đa số dung lượng là ảnh.
Đừng tốn công tuning MySQL; cấu hình mặc định thừa sức.

---

## 2. Chuẩn bị

### DNS — hiện trạng (kiểm tra lúc viết doc)

```
mockup.primehorizon.studio.  A  143.244.165.189      ← trỏ THẲNG tới server, không có AAAA
```

Bản ghi này **không bật proxy Cloudflare** (mây xám) — resolve ra đúng IP server chứ không
phải IP Cloudflare. Khác với `tool.primehorizon.studio` và `genmockup.primehorizon.studio`
đang là mây cam.

Quét cổng từ ngoài vào `143.244.165.189` lúc viết doc:

| Cổng | Trạng thái |
|---|---|
| 22 | mở (SSH) |
| 80 | đóng |
| 443 | đóng |
| 3306 | đóng (đúng — MySQL không được lộ ra ngoài) |

Nghĩa là server còn trống, chưa có Nginx. Đúng trạng thái để làm từ đầu.

**Vì proxy đang tắt, dùng Let's Encrypt (mục 9.1) là đường thẳng nhất** — và tránh luôn
được giới hạn 100 giây của Cloudflare, vốn là thứ đáng lo nhất với generate chạy đồng bộ.

Kiểm tra lại trước khi chạy certbot:

```bash
dig +short mockup.primehorizon.studio      # phải ra đúng 143.244.165.189
```

Nếu ra IP Cloudflare thì ai đó đã bật lại mây cam — certbot sẽ fail, xem mục 9.2.

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Cổng 3000 và 3306 **không mở ra ngoài**. Node listen `0.0.0.0:3000` nên ufw là lớp chặn duy
nhất — đừng bỏ qua bước này. MySQL mặc định đã bind `127.0.0.1`, kiểm tra lại ở mục 4.

### Cài phần mềm

```bash
sudo apt update && sudo apt install -y nginx git curl mysql-server

# Node 22 — KHÔNG phải 20, xem ghi chú bên dưới
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm 11 (đúng version trong packageManager)
sudo corepack enable
corepack prepare pnpm@11.1.3 --activate

node -v && pnpm -v && mysql --version
```

> ⚠️ **Phải là Node 22 dù `engines` ghi `>=20`.** pnpm 11.1.3 `require('node:sqlite')`,
> mà module đó chỉ có từ Node 22.5. Cài Node 20 thì pnpm chết ngay ở lệnh đầu tiên với
> `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module: node:sqlite`. Bản thân app chạy
> được trên Node 20, nhưng không cài nổi dependencies nên không đi tới đâu.

### Đồng hồ hệ thống phải là UTC

```bash
sudo timedatectl set-timezone UTC
timedatectl        # kiểm tra: Time zone: UTC
```

Không phải làm cho đẹp: cột `createdAt` dùng `DEFAULT CURRENT_TIMESTAMP(3)` do **MySQL**
sinh, trong khi các giá trị khác do **Prisma** ghi vào theo UTC. Server lệch múi giờ thì hai
nguồn này lệch nhau đúng bằng offset, và lịch sử generate hiện sai giờ. Mục 4 khoá thêm cả
múi giờ của MySQL cho chắc.

### Tạo user + thư mục

```bash
sudo adduser --system --group --home /srv/genmockup genmockup
sudo mkdir -p /srv/genmockup/app /srv/genmockup/storage
sudo chown -R genmockup:genmockup /srv/genmockup
```

---

## 3. Lấy mã nguồn & cài đặt

```bash
sudo -u genmockup -s
cd /srv/genmockup/app
git clone https://github.com/Thanhphong312/genmockup.git .

pnpm install            # KHÔNG dùng --prod, xem cảnh báo bên dưới
```

> ⚠️ Repo đang để **public**. `.gitignore` dùng pattern `.env*` chứ không phải `.env` —
> đã từng có file tên `apps/api/.env copy` chứa `GOOGLE_OAUTH_CLIENT_SECRET` thật lọt qua
> pattern cũ vì tên có dấu cách. Đừng nới pattern đó ra.

> ⚠️ **Đừng chạy `pnpm install --prod`.** `tsx`, `pino-pretty`, `prisma` và `better-sqlite3`
> nằm trong `devDependencies` nhưng đều cần: `pino-pretty` là transport của logger (thiếu là
> server chết ngay khi khởi động), `prisma` để chạy migration, `better-sqlite3` để chạy
> script chuyển dữ liệu ở mục 7, `tsx` nếu chạy bằng `pnpm --filter api serve`.

> ⚠️ **Đừng copy `node_modules` từ máy Windows sang.** `sharp`, `better-sqlite3` và Prisma
> engine đều là binary theo nền tảng — bắt buộc `pnpm install` trên chính server.

Nếu `better-sqlite3` không có bản prebuilt cho môi trường này, nó sẽ tự biên dịch và cần:

```bash
sudo apt install -y build-essential python3
```

---

## 4. MySQL

### Tạo database + user

`mysql_secure_installation` là lệnh tương tác. Nếu chạy qua script/SSH không có terminal,
dùng SQL tương đương:

```sql
DELETE FROM mysql.user WHERE User='';
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\_%';
```

Trên Ubuntu, `root` của MySQL dùng `auth_socket` nên `sudo mysql` vào thẳng, không cần mật khẩu.

```bash
sudo mysql
```

```sql
CREATE DATABASE genmockup
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'genmockup'@'localhost' IDENTIFIED BY 'MAT_KHAU_MANH';
GRANT ALL PRIVILEGES ON genmockup.* TO 'genmockup'@'localhost';
FLUSH PRIVILEGES;
```

`utf8mb4` là **bắt buộc**, không phải tuỳ chọn: tên mockup, keyword, prompt đều là tiếng
Việt có dấu và có cả emoji. Bảng sinh ra từ migration cũng khai `utf8mb4_unicode_ci` nên
để database khác charset chỉ tạo ra lệch lạc khó tìm.

### Cấu hình thêm

`/etc/mysql/mysql.conf.d/genmockup.cnf`:

```ini
[mysqld]
bind-address            = 127.0.0.1
default-time-zone       = '+00:00'
character-set-server    = utf8mb4
collation-server        = utf8mb4_unicode_ci

# Prompt/analysis của OpenAI là cột TEXT; mặc định 64M của MySQL 8 đã thừa,
# khai lại cho rõ ràng phòng khi image khác đặt thấp hơn.
max_allowed_packet      = 64M

# DB chỉ vài MB nên không cần buffer pool to. Đừng nâng lên GB — RAM đó
# để làm page cache cho ảnh còn đáng hơn nhiều.
innodb_buffer_pool_size = 256M
```

```bash
sudo chmod 644 /etc/mysql/mysql.conf.d/genmockup.cnf     # xem cảnh báo bên dưới
sudo systemctl restart mysql
mysql -u genmockup -p -e "SELECT @@global.time_zone, @@global.innodb_buffer_pool_size;" genmockup
```

Phải ra `+00:00` và `268435456`.

> ⚠️ **File `.cnf` phải đọc được bởi mọi user (644).** Để `600` thì MySQL **bỏ qua file,
> khởi động bình thường, không log một dòng cảnh báo nào** — mọi thiết lập im lặng trở về
> mặc định. Triệu chứng duy nhất là `@@global.time_zone` vẫn `SYSTEM` và buffer pool vẫn
> 128M. Luôn đối chiếu bằng câu lệnh trên chứ đừng tin là đã ăn.

Kiểm tra MySQL không lộ ra ngoài:

```bash
sudo ss -lntp | grep 3306        # phải là 127.0.0.1:3306, KHÔNG phải 0.0.0.0:3306
```

---

## 5. File `.env`

Tạo `/srv/genmockup/app/.env`:

```ini
PORT=3000

# Ký tự đặc biệt trong mật khẩu phải URL-encode: @ → %40, # → %23, / → %2F, : → %3A
DATABASE_URL="mysql://genmockup:MAT_KHAU_MANH@127.0.0.1:3306/genmockup"

# Đường dẫn TUYỆT ĐỐI — khỏi phụ thuộc thư mục chạy
STORAGE_DIR=/srv/genmockup/storage

# Bắt buộc đúng domain: mọi link ảnh trả về cho client được ghép từ biến này
PUBLIC_URL=https://mockup.primehorizon.studio

# Cùng origin nên gần như không cần, để cho chắc
CORS_ORIGIN=https://mockup.primehorizon.studio

# BẮT BUỘC đặt cố định. Bỏ trống → mỗi lần restart sinh secret mới,
# toàn bộ session web và token của extension chết sạch.
AUTH_SECRET=<chuỗi ngẫu nhiên: openssl rand -hex 32>

# Admin đầu tiên, CHỈ dùng khi database còn rỗng. Nếu chuyển dữ liệu cũ sang
# (mục 7) thì user cũ đã có sẵn, hai biến này không tạo thêm gì.
AUTH_USERNAME=admin
AUTH_PASSWORD=<mật khẩu mạnh>

# Lớp chặn header phụ, để trống là tắt
API_KEY=

# off/0/false = khoá tính năng New Idea (các endpoint gọi OpenAI trả 423)
FEATURE_IDEAS=off

# Chỉ là fallback khi user chưa tự nhập key trong Cài đặt
OPENAI_API_KEY=

# Google Drive — nhớ đổi redirect URI sang domain mới (mục 11)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=https://mockup.primehorizon.studio/api/drive/oauth/callback
GOOGLE_DRIVE_PARENT_FOLDER_ID=
```

```bash
chmod 600 /srv/genmockup/app/.env
```

### `.env` cho Prisma CLI

```bash
ln -sfn ../../.env /srv/genmockup/app/apps/api/.env
chown -h genmockup:genmockup /srv/genmockup/app/apps/api/.env
```

> Bắt buộc, không phải cho tiện. `apps/api/src/env.ts` load `.env` ở gốc repo nên **app**
> chạy được, nhưng **Prisma CLI** chỉ tìm `.env` cạnh `schema.prisma` và trong thư mục hiện
> tại — nó không nhìn lên gốc repo. Thiếu symlink này thì `prisma migrate deploy` fail với
> `P1012 Environment variable not found: DATABASE_URL` dù `.env` có đủ. Máy dev không dính
> vì ở đó có sẵn một `apps/api/.env` riêng.

---

## 6. Tạo schema

```bash
cd /srv/genmockup/app
pnpm prisma:generate        # postinstall của @prisma/client không tự tìm được schema
pnpm prisma:deploy          # = prisma migrate deploy
```

Migration `20260822000000_init_mysql` tạo đủ **14 bảng** trong một lượt.

> Nếu đọc doc/commit cũ thấy dặn "dùng `db push`, đừng dùng `migrate deploy`" — cảnh báo đó
> đã hết hiệu lực. Nó có vì bộ migration SQLite cũ bị thiếu `users`, `mockup_shares`,
> `shirt_set_shares`, chạy `migrate deploy` sẽ ra DB thiếu bảng và app crash ngay lúc boot ở
> `ensureAdminUser()`. Bộ migration MySQL được sinh lại từ đầu nên không còn lỗi đó.

Đối chiếu:

```bash
mysql -u genmockup -p -e "SHOW TABLES;" genmockup     # phải ra 14 bảng + _prisma_migrations
```

---

## 7. Chuyển dữ liệu cũ sang (SQLite → MySQL)

Bỏ qua mục này nếu bắt đầu từ database rỗng.

Hai phần tách rời nhau: **ảnh** copy bằng rsync, **metadata** copy bằng script.

### 7.1 Lấy bản sao nhất quán của file SQLite

Ở chế độ WAL, `cp` một file SQLite đang chạy có thể ra bản hỏng. Hai cách:

**Dừng app rồi copy** — dứt điểm, dùng khi cắt sang server mới thật sự:

```powershell
scripts\windows\stop.bat
```

**Hoặc snapshot nóng, app vẫn chạy** — dùng khi muốn chạy thử trước mà chưa cắt dịch vụ.
Dùng online-backup API của SQLite (đọc thuần, không khoá ghi):

```bash
cd apps/api
node -e "const D=require('better-sqlite3');const db=new D('../../storage/genmockup.db',{readonly:true});db.backup('/tmp/snapshot.db').then(r=>console.log('pages:',r.totalPages))"
```

Lúc cắt thật vẫn phải dừng app và lấy lại bản mới, vì snapshot cũ đã lạc hậu.

### 7.2 Copy ảnh + file SQLite

```bash
rsync -avz --progress /d/genmockupbullstart/storage/ \
      root@143.244.165.189:/srv/genmockup/storage/
```

```bash
# trên server, sau khi copy xong
sudo chown -R genmockup:genmockup /srv/genmockup/storage
ls -la /srv/genmockup/storage/genmockup.db      # phải có, script ở 7.3 cần nó
```

12 GB qua mạng gia đình sẽ mất một lúc; chạy trong `screen`/`tmux` cho khỏi đứt.

Đường dẫn ảnh lưu trong DB là **tương đối** so với `STORAGE_DIR` nên đổi máy không cần sửa gì.

### 7.3 Chuyển metadata sang MySQL

Nếu app đã khởi động một lần với DB rỗng, `bootstrapUsers()` đã tạo sẵn một admin từ
`AUTH_USERNAME`. **Phải xoá nó trước khi chuyển dữ liệu**:

```bash
mysql -u genmockup -p -e "DELETE FROM users;" genmockup
```

Bỏ qua bước này thì script dừng ở tiền kiểm tra "bảng đích đã có dữ liệu"; mà nếu ép
`--force` thì user thật trùng username sẽ bị `skipDuplicates` bỏ qua, và tài khoản còn lại
là admin bootstrap với mật khẩu tạm — nghe như đăng nhập được nhưng thực ra mất user thật.

```bash
cd /srv/genmockup/app
sudo -u genmockup pnpm migrate:sqlite-to-mysql -- --sqlite /đường/dẫn/genmockup.db --dry-run
sudo -u genmockup pnpm migrate:sqlite-to-mysql -- --sqlite /đường/dẫn/genmockup.db
```

Script (`apps/api/scripts/migrate-sqlite-to-mysql.ts`) đọc file SQLite ở
`$STORAGE_DIR/genmockup.db` (đổi bằng `--sqlite <path>`), ghi sang MySQL theo đúng thứ tự
khoá ngoại, rồi in bảng đối chiếu số dòng. Nó **dừng lại và không ghi gì** nếu:

| Kiểm tra | Vì sao |
|---|---|
| `DATABASE_URL` không phải `mysql://` | tránh chạy nhầm vào chính SQLite |
| Bảng đích đã có dữ liệu | tránh trộn hai lần chạy (`--force` để bỏ qua) |
| Có username / tên shirt-set chỉ khác nhau **hoa-thường** | MySQL collation `utf8mb4_unicode_ci` **không phân biệt hoa thường**, khác SQLite → hai dòng hợp lệ ở SQLite sẽ đụng unique key ở MySQL. Đổi tên ở SQLite rồi chạy lại. |

Bản ghi mồ côi (khoá ngoại trỏ vào dòng đã xoá) được xử lý tự động: FK không bắt buộc thì
đặt `NULL`, FK bắt buộc thì bỏ hàng — và in ra số lượng.

Kết thúc phải thấy `Xong. Số dòng khớp hết.` Nếu báo LỆCH thì **đừng mở app**, kiểm tra lại.

### 7.4 Sau khi xong

Mật khẩu người dùng là bcrypt hash nên chuyển sang dùng được ngay, không phải đặt lại.
Token Google Drive nằm trong `app_settings` cũng theo sang, nhưng redirect URI vẫn phải
thêm domain mới (mục 11a).

File `genmockup.db` cũ giữ lại vài tuần cho chắc, rồi xoá:

```bash
mv /srv/genmockup/storage/genmockup.db /srv/genmockup/genmockup.db.sqlite.bak
```

Để nguyên trong `storage/` cũng không sao — nó không được `/files/` phục vụ vì không ai
đoán ra... nhưng đúng ra vẫn là file public. **Chuyển nó ra ngoài `storage/`.**

---

## 8. Build

```bash
cd /srv/genmockup/app
pnpm build          # build cả web (vite) lẫn api (tsc → dist)
```

Có `apps/web/dist` thì API tự phục vụ luôn SPA ở `/` — không cần server tĩnh riêng.

---

## 9. systemd

`/etc/systemd/system/genmockup.service`:

```ini
[Unit]
Description=Gen Mockup API
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=genmockup
Group=genmockup
WorkingDirectory=/srv/genmockup/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node apps/api/dist/server.js
Restart=always
RestartSec=5

# Siết quyền
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/genmockup/storage

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now genmockup
sudo systemctl status genmockup
curl -s localhost:3000/health      # {"ok":true,...}
journalctl -u genmockup -f          # xem log
```

> Không cần PM2 cluster hay nhiều process. `sharp` làm việc ngoài main thread nên một
> process Node đã dùng được nhiều nhân (đo được 6 request song song scale tốt).
> Nhân bản process chỉ tốn RAM mà không nhanh hơn.

---

## 10. Nginx

`/etc/nginx/sites-available/mockup.primehorizon.studio`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name mockup.primehorizon.studio;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mockup.primehorizon.studio;

    # certbot sẽ điền ssl_certificate ở mục 10.1

    # BẮT BUỘC: app cho phép file 50 MB, mặc định nginx chỉ 1 MB → upload mockup sẽ lỗi 413
    client_max_body_size 50m;
    client_body_timeout 300s;

    # Nén text, KHÔNG nén ảnh (PNG nén sẵn rồi, gzip lại chỉ tốn CPU)
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    access_log /var/log/nginx/genmockup.access.log;
    error_log  /var/log/nginx/genmockup.error.log;

    # --- Ảnh: nginx đọc thẳng từ đĩa, không đi qua Node ---
    # /files/ vốn đã là public trong app (không qua lớp auth), nên phục vụ trực tiếp
    # không làm lộ thêm gì. Ảnh output ~2,4 MB/file nên bỏ được Node là đáng.
    location /files/ {
        alias /srv/genmockup/storage/;
        autoindex off;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # --- Toàn bộ phần còn lại về Node ---
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Generate chạy ĐỒNG BỘ: ~0,6 s/ảnh. 30 ảnh ≈ 20 s, lúc nhiều người dùng còn lâu hơn.
        # Mặc định 60 s sẽ cắt ngang giữa chừng → để rộng.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # Ảnh trả về là buffer lớn, tắt buffering cho khỏi ghi tạm ra đĩa
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mockup.primehorizon.studio /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Nginx (user `www-data`) cần quyền đọc thư mục storage:

```bash
sudo chmod o+x /srv/genmockup /srv/genmockup/storage
sudo usermod -aG genmockup www-data && sudo systemctl restart nginx
```

### 10.1 SSL — Let's Encrypt (cách nên dùng)

Bản ghi DNS hiện đang là mây xám nên làm được ngay, không cần đụng gì ở Cloudflare:

```bash
dig +short mockup.primehorizon.studio          # xác nhận 143.244.165.189
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mockup.primehorizon.studio
sudo systemctl status certbot.timer            # tự gia hạn 90 ngày/lần
```

Certbot tự điền `ssl_certificate` vào file config ở trên.

### 10.2 Nếu sau này bật proxy Cloudflare (mây cam)

Được, nhưng:

- SSL/TLS mode phải là **Full (strict)**. Để "Flexible" sẽ thành vòng lặp chuyển hướng vì
  Nginx đang ép 301 lên HTTPS.
- **Cloudflare cắt request ở ~100 giây.** Generate chạy đồng bộ; hiện trung bình 5,6 ảnh/lần
  (~3 giây) nên an toàn, nhưng generate vài chục ảnh một lần sẽ dính lỗi 524.
- Upload trần 100 MB (free plan) — không vướng vì app chỉ cho 50 MB.

Thay Let's Encrypt bằng Cloudflare Origin Certificate nếu muốn khỏi gia hạn:

1. Dashboard → **SSL/TLS → Origin Server → Create Certificate**, hostname
   `mockup.primehorizon.studio`, hạn 15 năm.
2. Lưu lên server:

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/mockup.pem      # dán Origin Certificate
sudo nano /etc/ssl/cloudflare/mockup.key      # dán Private Key
sudo chmod 600 /etc/ssl/cloudflare/mockup.key
```

3. Thay hai dòng `ssl_certificate*` trong block 443:

```nginx
    ssl_certificate     /etc/ssl/cloudflare/mockup.pem;
    ssl_certificate_key /etc/ssl/cloudflare/mockup.key;
```

> Cert này **chỉ Cloudflare tin**. Truy cập thẳng `https://143.244.165.189` sẽ báo cert
> không hợp lệ — đúng như thiết kế.

### 10.3 Tuỳ chọn — để nginx phục vụ luôn asset của SPA

Bỏ qua Node cho file tĩnh, thêm **trước** `location /`:

```nginx
location /assets/ {
    alias /srv/genmockup/app/apps/web/dist/assets/;
    expires 1y;
    add_header Cache-Control "public, immutable";
    access_log off;
}
```

Vite băm tên file theo nội dung nên cache 1 năm là an toàn.

---

## 11. Việc phải làm sau khi đổi domain

Domain mới `mockup.primehorizon.studio` khác domain cũ `genmockup.primehorizon.studio`,
nên ba chỗ sau **phải sửa, nếu không sẽ hỏng lặng lẽ**:

**a. Google Drive OAuth** — vào Google Cloud Console → Credentials → thêm redirect URI:
```
https://mockup.primehorizon.studio/api/drive/oauth/callback
```
và cập nhật `GOOGLE_OAUTH_REDIRECT_URI` trong `.env` cho khớp.

**b. Extension Chrome `PrimeHorizonMockup/`** — domain đang hardcode ở 3 chỗ:

| File | Chỗ sửa |
|---|---|
| `manifest.json` | `host_permissions` — thêm `https://mockup.primehorizon.studio/*` |
| `background.js` | `DEFAULT_API_BASE` |
| `options.js` | `DEFAULT_API_BASE` |

Sửa xong phải **đóng gói và cài lại extension** cho mọi người dùng; ai đã tự đặt API base
trong trang Options thì vào đổi lại. Không sửa `host_permissions` thì extension bị chặn ở
tầng trình duyệt, gọi API im lặng không báo gì.

> Ba file này **cố ý chưa sửa trong repo** — sửa sớm là extension mất kết nối với bản
> Windows đang chạy. Sửa vào đúng lúc cắt sang server mới.

**c. `PUBLIC_URL`** trong `.env` — sai biến này thì app vẫn chạy nhưng **mọi link ảnh trả
về đều trỏ về domain cũ**, ảnh hỏng hết trên giao diện.

---

## 12. Vận hành

### Cập nhật phiên bản mới

```bash
sudo -u genmockup -s
cd /srv/genmockup/app
git pull
pnpm install
pnpm prisma:generate
pnpm prisma:deploy      # nếu có migration mới
pnpm build
exit
sudo systemctl restart genmockup
```

### Backup

Phải lấy **cả hai** — database và ảnh:

```bash
# /etc/cron.daily/genmockup-backup
set -e
mysqldump --single-transaction --default-character-set=utf8mb4 \
          -u genmockup -p'MAT_KHAU_MANH' genmockup \
        | gzip > /var/backups/genmockup-$(date +\%F).sql.gz
find /var/backups -name 'genmockup-*.sql.gz' -mtime +14 -delete
```

`--single-transaction` để dump nhất quán mà không khoá bảng (InnoDB). Đừng để mật khẩu
trong dòng lệnh nếu server có nhiều người dùng — chuyển sang `~/.my.cnf` với `chmod 600`.

Ảnh trong `/srv/genmockup/storage/` rsync sang nơi khác định kỳ. Dump SQL chỉ vài MB, ảnh
mới là 12 GB — hai thứ nên có lịch khác nhau.

Phục hồi:

```bash
gunzip < /var/backups/genmockup-2026-08-22.sql.gz | mysql -u genmockup -p genmockup
```

### Dọn đĩa

`storage/outputs/` chỉ tăng, không có cơ chế tự xoá. Ở nhịp hiện tại ~3,5 GB/tháng.
Khi đĩa gần đầy, xoá generation cũ (xoá **cả file lẫn row DB** tương ứng) hoặc archive
`outputs/<generationId>/` sang nơi lưu trữ rẻ hơn.

### Theo dõi

```bash
systemctl status genmockup mysql
journalctl -u genmockup --since '1 hour ago'
df -h /srv/genmockup            # đĩa — thứ cần canh nhất
du -sh /srv/genmockup/storage/*
mysql -u genmockup -p -e "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema='genmockup';"
```

---

## 13. Checklist nghiệm thu

```bash
curl -s https://mockup.primehorizon.studio/health           # {"ok":true,...}
```

- [ ] `SHOW TABLES` ra đủ 14 bảng
- [ ] Nếu có chuyển dữ liệu: script in `Số dòng khớp hết`
- [ ] Mở `https://mockup.primehorizon.studio` → hiện trang đăng nhập
- [ ] Đăng nhập bằng tài khoản cũ (hoặc `AUTH_USERNAME`/`AUTH_PASSWORD` nếu DB rỗng)
- [ ] Trang Mockups hiện ảnh (link ảnh phải là `https://mockup.primehorizon.studio/files/...`)
- [ ] Mở một shirt set và một skin scene → vùng design nằm đúng chỗ *(kiểm tra `cornersJson`/`ctrlJson` không bị cắt cụt)*
- [ ] Trang Cài đặt vẫn còn OpenAI key / kết nối Drive *(kiểm tra `app_settings.value` không bị cắt cụt)*
- [ ] Upload một mockup mới → không dính 413
- [ ] Generate thử vài ảnh → tải kết quả về được
- [ ] Restart service rồi F5 → **vẫn đang đăng nhập** (chứng tỏ `AUTH_SECRET` cố định)
- [ ] `https://mockup.primehorizon.studio/api/documentation` mở được (Swagger)
- [ ] Extension gọi API được sau khi cập nhật (mục 11b)

## 14. Sự cố thường gặp

| Triệu chứng | Nguyên nhân |
|---|---|
| Service chết ngay khi start, log nói thiếu module | Đã lỡ `pnpm install --prod` → thiếu `pino-pretty` |
| `P1001 Can't reach database server` | MySQL chưa chạy, hoặc sai port/host trong `DATABASE_URL` |
| `P1000 Authentication failed` | Sai mật khẩu, hoặc ký tự đặc biệt chưa URL-encode trong `DATABASE_URL` |
| `Unknown database 'genmockup'` | Chưa chạy `CREATE DATABASE` ở mục 4 |
| Tiếng Việt thành `?????` | Database không phải utf8mb4 (mục 4) |
| Lịch sử generate lệch vài tiếng | Server hoặc MySQL không ở UTC (mục 2, mục 4) |
| Script migrate báo ĐỤNG HOA/THƯỜNG | Collation MySQL không phân biệt hoa thường — đổi tên ở SQLite rồi chạy lại (mục 7.3) |
| Skin scene ghép lệch hẳn sau khi chuyển | `cornersJson`/`ctrlJson` bị cắt cụt — cột phải là `TEXT`, không phải `VARCHAR(191)` |
| Ảnh vỡ, link trỏ domain cũ | `PUBLIC_URL` sai |
| Upload báo 413 | Thiếu `client_max_body_size 50m` trong nginx |
| Generate nhiều ảnh bị 504 | `proxy_read_timeout` quá ngắn |
| `/files/...` trả 403 | `www-data` chưa có quyền đọc `/srv/genmockup/storage` |
| Đăng nhập lại sau mỗi lần restart | `AUTH_SECRET` để trống |
| Extension không gọi được API | Chưa thêm domain vào `host_permissions` |
| Cloudflare báo 526 | Đã bật mây cam nhưng origin chưa có SSL hợp lệ → mục 10.1 hoặc 10.2 |
| Cloudflare báo 521/522 | Nginx chưa chạy, hoặc ufw chặn 443, hoặc sai IP trong bản ghi A |
| Vòng lặp chuyển hướng vô tận | Cloudflare đang để SSL mode "Flexible" — đổi sang Full (strict) |
| Generate nhiều ảnh bị 524 | Cloudflare cắt ở 100 s — tắt proxy hoặc giảm số ảnh mỗi lần |

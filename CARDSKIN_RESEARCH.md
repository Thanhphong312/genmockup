# Nghiên cứu: quy trình gen mockup **card skin** (bộ scene)

Phân tích 12 ảnh mẫu ở `C:\Users\thanh\Downloads\sample` + đề xuất phương án. Có PoC đã chạy thật, số liệu đo ở cuối.

---

## 1. Mẫu có gì

Hai bộ, đều là **card skin** (sticker dán thẻ ATM/credit), không phải card 5×7 hiện tại.

### Bộ A — `photo_63074457513861498xx` (6 ảnh, 1000×1000)

| Ảnh | Scene | Design |
|---|---|---|
| ...893 | Tay cầm thẻ, bàn gỗ tối, cốc + cây | "Help me, I'm poor" |
| ...895 | Tay cầm thẻ, bàn gỗ sáng, cà phê + sổ | Mèo cau có |
| ...896 | Quẹt máy POS | Mèo cau có |
| ...898 | Trước máy ATM + ví | Vịt "Where Money?" |
| ...899 | Rút/nhét ví nâu | Heo "Saving..." |
| ...900 | Chạm POS ở quầy | Heo "Saving..." |

→ 4 design × 6 scene. Đây là **catalog scene**, không phải 1 bộ đồng nhất.

### Bộ B — `6309913407666197426..430` + `515f97a9...` (6 ảnh)

**Cùng 1 design (ếch xanh) qua 6 scene** — đúng thứ anh muốn tái tạo:

| Ảnh | Scene | Độ khó |
|---|---|---|
| 426 (1000²) | Marble + cà phê, nắng loang | Phối cảnh nhẹ, **ánh sáng lốm đốm** |
| 427 (1000²) | Tay cầm, nền cây blur | Phối cảnh nhẹ, **ngón tay che mép trái** |
| 428 (1000²) | Chạm POS | **Phối cảnh mạnh (hình thang)** + ngón tay che phải |
| 429 (1000²) | Rút ví nâu | **Bị ví + ngón tay che ~35% thẻ** |
| 430 (1000²) | Sticker **bóc góc** trên nền bê tông | **Cong, không phẳng** |
| 515f97a9 (800²) | Flat lay bàn gỗ sáng | Dễ nhất |

---

## 2. Yêu cầu kỹ thuật rút ra (khác hẳn hệ hiện tại)

1. **Tỉ lệ**: thẻ chuẩn 85.6×54mm → **1.586 : 1 (ngang)**. Không phải `DESIGN_RATIO = 5/7 = 0.714`. Canvas design đề xuất **1050×660** (hoặc 2100×1320 cho bản in).
2. **Phối cảnh thật, không phải xoay 2D**. Model `Area {x, y, width, height, rotation}` hiện tại **không tả được** ảnh 428 (thẻ là hình thang, cạnh trên ≠ cạnh dưới). Cần **quad 4 điểm** → biến đổi homography.
3. **Chip vàng luôn nằm ĐÈ LÊN design** ở mọi ảnh → phải là layer foreground riêng.
4. **Che khuất (occlusion)**: ngón tay (427, 428, 429, 893), mép ví (429). Không có layer đè → design phủ lên ngón tay, lộ ngay là fake.
5. **Bo góc** r ≈ 3.18mm ≈ **3.7% chiều rộng** (~39px trên canvas 1050). Không clip → góc vuông chìa ra ngoài thẻ.
6. **Ánh sáng**: 426 nắng loang, 429 bóng trong ví. Dán phẳng lì → trông như ảnh ghép.
7. **Không phẳng**: ảnh 430 góc sticker bị bóc cong — **1 homography không tả được**.

---

## 3. PoC đã chạy — kết quả thật

Code: `…\scratchpad\quad.mjs` + `run2.mjs` (chạy được, không thêm dependency nào).

**Engine warp phối cảnh**: giải homography 3×3 từ 4 cặp điểm (khử Gauss 8×8) + inverse mapping + nội suy bilinear, viết thuần JS trên raw RGBA của sharp.

| Ảnh | Quad tự detect (TL,TR,BR,BL) | Detect | Warp |
|---|---|---|---|
| 515f97a9 | (146,263)(645,218)(670,504)(172,549) | 42ms | 38ms |
| 426 | (217,398)(797,341)(829,673)(249,730) | 38ms | 34ms |
| 427 | (212,299)(845,283)(855,691)(223,707) | 41ms | 41ms |
| 428 | (251,378)(707,282)(770,583)(315,679) | 16ms | 8ms |
| 429 | (234,264)(594,333)(545,590)(185,521) | 13ms | 8ms |
| 430 | (125,300)(846,243)(880,672)(159,730) | 27ms | 24ms |

**Kết luận đo được:**

- ✅ **Warp phối cảnh khả thi và rẻ**: 8–40ms/ảnh 1000×1000. 6 scene ≈ 0.2–0.5s → vẫn chạy đồng bộ được như `/api/generate` hiện tại. **Không cần thêm thư viện** (không cần OpenCV/ImageMagick).
- ✅ Quad + bo góc + shading (lấy từ envelope ánh sáng của ảnh gốc: unwarp → blur 45px → chuẩn hoá → nhân) cho kết quả **rất thuyết phục** ở ảnh 427 và 515.
- ❌ **Auto-detect từ ảnh đã composite là không đáng tin**. Ngưỡng màu bám cả nền; ở 429 (thẻ bị ví che) min-area rect chỉ ôm phần *nhìn thấy* → design bị bóp méo vào vùng nhỏ hơn thẻ thật.
- ❌ **Min-area rect (hình chữ nhật xoay) không đủ** cho 428 — cần quad hình thang thật.
- ❌ Thiếu layer che → ở 428 design phủ luôn ngón tay, rất lộ.
- ❌ Ảnh 430 (bóc góc) mất hiệu ứng cong — homography không làm được.

---

## 3b. ⭐ CHỐT: phương án "mockup khoét lỗ" (đã test, tốt hơn hẳn)

Thay vì dán design **đè lên** ảnh rồi phải tự dựng lại mask/overlay/bo góc, thì **khoét mặt thẻ trong ảnh mockup thành trong suốt** rồi đặt design **xuống dưới**. Đã test trên `example_1.png` / `example_2.png`.

Mọi thứ khó nhất tự động đúng, không phải làm gì thêm:

| Trước đây phải tự dựng | Với mockup khoét lỗ |
|---|---|
| Overlay ngón tay che thẻ | **Miễn phí** — ngón tay vẫn nằm trong PNG, đè lên design |
| Mask silhouette + bo góc | **Miễn phí** — chính là biên của lỗ |
| Shading map | **Miễn phí một phần** — bóng/nắng trên tay và cảnh vẫn còn |
| Calibrate 4 góc thủ công | **Tự động** — dò từ hình học của lỗ |

Đo được: lỗ của 2 file mẫu gần như chữ nhật hoàn hảo — tỉ lệ **1.555** và **1.649** so với chuẩn **1.587** (lệch 2–4%). Nên `minAreaRect` trên lỗ cho quad đủ chuẩn, **không cần editor kéo 4 góc**. Onboard scene mới = chỉ upload file PNG đã khoét.

### Quy cách cắt mockup (quan trọng — gửi cho người làm asset)

1. Khoét **mặt thẻ** thành trong suốt hoàn toàn (alpha = 0).
2. **GIỮ NGUYÊN chip** ở trạng thái đục 100%. Design có sẵn lỗ khoét chip nên chip thật của thẻ sẽ lộ qua — đúng như sản phẩm thật. Nếu xoá luôn chip thì mất chi tiết này.
3. Giữ nguyên ngón tay / mép ví / mọi vật che ở trạng thái đục.
4. Không cần xoá bo góc thủ công — cắt sát mép thẻ là đủ.
5. Xuất PNG RGBA, **không premultiply**.

### Hai cách xử lý chip (đều đã render thử)

- **A** — chip lấy từ artwork của design: dùng được ngay với file cắt hiện tại, nhưng SKU nào không vẽ chip (vd SKU5) thì thẻ sẽ trống trơn.
- **B** — chip thật trong ảnh lộ qua lỗ khoét của design: **đẹp và đúng chuẩn nhất**, nhưng file cắt phải giữ chip (điểm 2 ở trên).

### 2 cái bẫy kỹ thuật đã dính và đã sửa — phải ghi vào code

1. **Moiré**: warp bilinear khi thu nhỏ (design 1006px → ~440px) tạo vân sọc chéo khắp mặt thẻ. Phải **Lanczos thu nhỏ về xấp xỉ cỡ quad trước**, rồi mới warp.
2. **Sharp premultiply**: sharp sắp xếp lại pipeline nội bộ — `removeAlpha()` chạy **sau** `resize()`, nên resize vẫn premultiply và RGB nằm dưới vùng `alpha = 0` (lỗ chip) bị nhân về 0 → **vệt đen**. Phải bỏ alpha rồi materialize ra buffer, resize ở **pass thứ hai**.

---

## 4. Các phương án (bản khảo sát ban đầu, giữ để tham chiếu)

### PA1 — Quad 4 điểm + mask + overlay ⭐ **khuyến nghị làm lõi**

Mỗi scene lưu:

| Trường | Vai trò | Bắt buộc |
|---|---|---|
| `corners` 4 điểm | vị trí + phối cảnh của mặt thẻ | ✅ |
| bán kính bo góc | clip silhouette (suy ra từ quad) | ✅ (auto) |
| `overlayPath` PNG alpha | ngón tay / chip / mép ví — **đè lên** design | ✅ |
| `shadingPath` grayscale | nhân (multiply) để bắt sáng | nên có |
| `glossPath` | screen/highlight bóng | tuỳ |

Pipeline: `design → warp theo quad → clip bo góc → × shading → composite lên scene → overlay đè trên`.

Đây chính là mô hình "smart object" của Photoshop, tách thành file phẳng.

### PA2 — **Calibration card** (cách rẻ nhất để dựng thư viện scene)

Nếu scene do mình sản xuất (AI gen hoặc tự chụp — nhìn mẫu thì rất có thể là AI gen): render/chụp **2 lần cùng 1 scene**, một lần với **thẻ trơn màu chroma (magenta)**.

Từ ảnh chroma tự động rút ra **toàn bộ** tham số PA1:
- vùng magenta → mask + 4 góc (chính xác, không đoán)
- pixel không-magenta nằm *trong* quad → **overlay che khuất** (ngón tay, chip) — miễn phí
- độ sáng vùng magenta → **shading map** — miễn phí

→ Onboard 1 scene mới còn ~vài giây, không cần ai kéo tay. Đây là điểm khác biệt lớn nhất về chi phí vận hành.

### PA3 — Displacement map cho scene cong (430)

Thêm 1 map lệch pixel để tả góc bóc. Chi phí cao, giá trị thấp → **để sau**, giai đoạn đầu chỉ nhận scene phẳng.

### PA4 — Giữ nguyên `Area` hiện tại (rect + rotation)

Rẻ nhất, nhưng chỉ chấp nhận được với scene gần chính diện (515, 427). Với 428/429 thì hỏng. **Không khuyến nghị** nếu muốn ra bộ như mẫu.

---

## 5. Đề xuất triển khai vào codebase hiện tại

Cấu trúc **giống hệt ShirtSet/ShirtVariant** đang có — chỉ khác: "variant" = **scene**, "area" = **quad**. Đúng ý "giữ nguyên vị trí design theo bộ": calibrate 1 lần/scene, sau đó thả design nào vào cũng ra đủ N ảnh.

- `packages/shared`: thêm `Quad = [[number,number], ×4]`, `CARD_SKIN_RATIO = 85.6/54`.
- `apps/api/src/services/perspective.ts` — **mới**: `homography()` + `warpToQuad()` (đã có sẵn từ PoC).
- `composer.ts`: thêm **mode thứ 3** (`quad`) cạnh 2 mode `card`/`shirt` hiện có. Không đụng 2 mode cũ.
- `prisma`: `SceneSet` (bộ) + `Scene` (`cornersJson`, `overlayPath`, `shadingPath`, `filePath`, w/h). Kèm `SceneSetShare` cho khớp cơ chế chia sẻ hiện tại.
- `routes/generate.ts`: thêm `POST /api/generate/scene` — dùng lại `parseGenerateRequest` sẵn có.
- `apps/web`: editor **4 handle** bằng react-konva (kéo 4 góc + lưới preview) thay cho `AreaEditor` ở loại này; thêm nút import scene từ ảnh chroma (PA2).

**Thứ tự làm đề xuất:** engine warp (đã xong PoC) → schema + editor 4 điểm thủ công → generate → rồi mới tự động hoá bằng calibration card.

---

## 6. Câu hỏi cần chốt trước khi code

1. **Nguồn scene**: mẫu này anh tự gen bằng AI hay tải về? Nếu tự gen được → PA2 khả thi, tiết kiệm rất nhiều công.
2. **Ảnh dạng bóc góc (430)** có bắt buộc không? Nếu có thì phải tính PA3 ngay từ schema.
3. **Kích thước design đầu vào** cho card skin: chốt 1050×660 hay 2100×1320?
4. Sản phẩm này **thay thế** hay **thêm vào** bên cạnh card 5×7 + áo hiện có?

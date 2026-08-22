# flow code 
    - web gen mockup từ design đầu vào 
    - sẽ tạo database để lưu setting vị trí và kích thước sẽ scale ảnh design đầu vào vào cho từng ảnh D:\genmockupbullstart\mockup lưu vào setting 
    - đầu vào sẽ là link ảnh design dạng 5x7 inch đầu ra sẽ ghép design vào từng ảnh theo vị trí và kích thước scale của từng ảnh ở D:\genmockupbullstart\mockup và trả về ảnh đã ghép vào D:\genmockupbullstart\mockup lưu storage blaze 
    - hệ thống web thêm chức năng upload ảnh watermark nếu có chọn watermark thì lưu tạo ảnh đầu ra và thêm lưu setting vị trí ảnh wartermark cho từng mockup nếu có watermark thì ảnh đầu ra sẽ add vào 
    - hệ thống sẽ hỗ trợ 2 dạng web upload design, chọn mockup , watermark đã có ra link vào gen vào mockup và api đầu và là link design và id watermark 

1. Cloudflare domain sẽ dùng là gì? (để config CORS + tunnel sẵn) : genmockup.primehorizon.studio
  2. Firebase project đã có chưa, hay cần tạo mới? Đã có service-account.json chưa? : database dùng xampp mysql
  3. Watermark chỉ cần blend mặc định, hay cần opacity/blend mode tuỳ chỉnh? watermark sẽ là ảnh upload lên và setup vị trí 
  4. Resolution design input mong muốn? (gợi ý 1500×2100 px cho preview, hoặc 2100×2940 nếu muốn nét hơn) kích thước output là kích thước của mockup 
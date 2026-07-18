# Cache dữ liệu Screener (Ngày + Tuần) qua GitHub Actions

Thay vì app gọi Twelve Data trực tiếp mỗi lần người dùng mở trang (đụng rate-limit
free tier ~5-6 phút), một job chạy nền 1 lần/ngày sẽ tải sẵn Ngày+Tuần cho cả 22
cặp rồi ghi ra `data/screener-data.json`. App chỉ cần đọc file JSON tĩnh này —
gần như tức thì, không đụng rate-limit của ai.

Tháng/4H/1H của cặp đang mở xem sâu (tab CMT/Hurst/Intraday) vẫn gọi Twelve Data
trực tiếp như cũ — chỉ 3 request cho 1 cặp, không phải vấn đề.

## Cài đặt (làm 1 lần)

1. **Tạo repo GitHub** (nên để **public** — dữ liệu chỉ là giá OHLC, không nhạy
   cảm; để private thì `raw.githubusercontent.com` cần token, phức tạp hơn cho
   trình duyệt fetch trực tiếp).

2. **Đẩy các file này lên repo:**
   - `scripts/fetch-screener-data.mjs`
   - `.github/workflows/fetch-data.yml`
   - (file `App.js` của bạn, ở đâu tuỳ bạn sắp xếp)

3. **Thêm secret cho API key:**
   Repo → Settings → Secrets and variables → Actions → New repository secret
   → tên `TWELVE_DATA_KEY`, giá trị là API key Twelve Data của bạn.

4. **Bật Actions** (thường bật sẵn): Settings → Actions → General → cho phép
   chạy workflow.

5. **Chạy thử lần đầu thủ công** (đừng đợi tới giờ cron): tab **Actions** →
   chọn workflow "Fetch screener data (Daily + Weekly OHLC)" → **Run workflow**.
   Việc này tạo ra `data/screener-data.json` lần đầu — nếu bỏ qua bước này, app
   sẽ không có gì để đọc cho tới lần chạy cron đầu tiên.

6. **Sửa `SCREENER_CACHE_URL` trong `App.js`**, thay `YOUR_GH_USERNAME/YOUR_REPO`
   bằng đúng tên GitHub username và repo của bạn:

   ```js
   const SCREENER_CACHE_URL =
     "https://raw.githubusercontent.com/<username>/<repo>/main/data/screener-data.json";
   ```

   (đổi `main` thành tên nhánh mặc định của bạn nếu khác)

Xong — từ giờ mỗi ngày lúc 22:30 UTC (~5:30 sáng giờ VN) job sẽ tự chạy, tự
commit `data/screener-data.json` mới nếu có thay đổi. Đổi giờ trong file
`.github/workflows/fetch-data.yml` (dòng `cron: "30 22 * * *"`) nếu muốn.

## Kiểm tra khi có sự cố

- **Screener vẫn chậm như cũ?** Nghĩa là app đang rơi về `loadBulkOHLCLive`
  (phương án dự phòng) — kiểm tra dòng progress hiện trên màn hình lúc tải:
  nếu thấy "Chưa đọc được cache (...)", đọc phần lỗi trong ngoặc — thường là
  do `SCREENER_CACHE_URL` chưa sửa đúng, hoặc workflow chưa chạy lần nào.
- **Workflow chạy lỗi?** Xem tab Actions → bấm vào lần chạy lỗi → đọc log.
  Lỗi phổ biến nhất: quên thêm secret `TWELVE_DATA_KEY`.
- **`raw.githubusercontent.com` có cache CDN riêng** (vài phút) — vừa push code
  xong thấy chưa cập nhật thì đợi một lát rồi tải lại.

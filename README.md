<div align="center">

<img src="frontend/public/brand/itclub-mark.svg" alt="ITClub Cloud" width="96" />

# ITClub Cloud

**Lưu điều hay. Chia sẻ điều mới.**

Không gian lưu trữ đám mây cá nhân kết nối trực tiếp qua Telegram — Chạy bằng Binary gốc gọn nhẹ, tốc độ cao.

**Rust (Axum + SQLite + TDLib) · React 19 · TypeScript · Tailwind CSS**

</div>

## Điểm nổi bật

- **Quản lý tệp toàn diện & mượt mà**: Phân loại nhanh theo danh mục (Thư mục, Video, Hình ảnh, Âm thanh, Tài liệu, File nén), sắp xếp linh hoạt (Tên, Kích thước, Ngày sửa), chọn nhiều mục để **Di chuyển / Sao chép / Xóa hàng loạt**, hỗ trợ menu chuột phải và phím tắt (`/` hoặc `Ctrl+K` tìm kiếm, `Ctrl+A` chọn tất cả, `Esc` bỏ chọn).
- **Cập nhật phiên bản tệp (Ghi đè bảo toàn liên kết)**: Tải phiên bản mới đè lên tệp hiện có (`replace_id`) mà không làm thay đổi ID tệp hay làm hỏng các liên kết chia sẻ đã gửi.
- **Trình xem trước đa năng ngay trên trình duyệt**:
  - Chuyển đổi nhanh qua lại giữa các tệp trong cùng thư mục bằng nút **Trước / Tiếp theo** hoặc phím mũi tên `←` / `→`.
  - Xem ảnh (thu phóng `25%–400%`, xoay góc `90°`), phát Video (hỗ trợ gắn phụ đề `.srt`/`.vtt`), phát Âm thanh, đọc PDF, sách điện tử EPUB, truyện tranh CBZ, duyệt nội dung file nén ZIP, đọc tài liệu Word (`.docx`), bảng tính Excel (`.xlsx`), trình chiếu (`.pptx`/`.odp`), Markdown, CSV/TSV, JSON, mã nguồn và thử nghiệm Font chữ (`.ttf`/`.otf`/`.woff2`).
- **Tích hợp chuẩn WebDAV & S3 (SigV4 Path-Style)**: Gắn kết như ổ cứng mạng trên máy tính hoặc đồng bộ bằng `rclone`, `aws-cli`, `Cyberduck`, `RaiDrive`.
- **Quản trị & Bảo mật minh bạch**: Quản lý thành viên và hạn mức Quota bằng hộp thoại trực quan, theo dõi dung lượng SSD tạm thời gian thực, sao lưu/khôi phục Metadata tự động qua Telegram và tra cứu **Nhật ký hoạt động (Audit Log)**.

## Chuẩn bị môi trường (Chạy Binary - Không cần Docker)

1. **Rust & Cargo** (phiên bản ổn định mới nhất).
2. **Node.js 22+** và `npm` (để build giao diện frontend).
3. **Thư viện TDLib (`libtdjson.so`)**: Trong thư mục `tdlib-native/lib/libtdjson.so.1.8.67` của dự án đã có sẵn bản biên dịch cho Linux x86_64 (hoặc tự biên dịch bằng script `./scripts/build-tdlib.sh`).
4. **Telegram API ID & API Hash**: Lấy miễn phí tại [my.telegram.org/apps](https://my.telegram.org/apps).

## Cấu hình `.env` nhanh gọn

Tạo file `backend/.env` từ file mẫu `.env.example` ở thư mục `backend/.env.example`.

```dotenv
BIND=0.0.0.0:8091

# Url frontend
PUBLIC_URL=http://localhost:5173

# Default backend auto create
SETUP_TOKEN=
MASTER_KEY=

DATA_DIR=./data

#FRONTEND_DIR=../frontend/dist

# - Linux (x86_64 có sẵn trong repo): ../tdlib-native/lib/libtdjson.so.1.8.67
# - Linux (tự build):                 ../tdlib-native/lib/libtdjson.so
# - macOS (Apple Silicon / Intel):    ../tdlib-native/lib/libtdjson.dylib
# - Windows (x64):                    ../tdlib-native/lib/tdjson.dll
TDLIB_PATH=../tdlib-native/lib/libtdjson.so.1.8.67

TELEGRAM_API_ID=
TELEGRAM_API_HASH=

# Kích thước mỗi phần (part) cắt ra khi gửi lên Telegram (MiB, từ 16 đến 1900)
PART_SIZE_MIB=256

# Kích thước tối đa của 1 file được phép upload (GiB, từ 1 đến 1024)
MAX_UPLOAD_GIB=50

# Số luồng đẩy file lên Telegram chạy song song tối đa (từ 1 đến 16)
MAX_PARALLEL_UPLOADS=2

# Trần dung lượng cho thư mục tạm `DATA_DIR/temp` khi đang nhận file upload (GiB).
# Đặt `0` nếu không muốn giới hạn trần thư mục tạm (chỉ phụ thuộc dung lượng trống của ổ đĩa).
SSD_TEMP_LIMIT_GIB=20

# Dung lượng trống tối thiểu luôn giữ lại trên ổ đĩa chứa `DATA_DIR` (GiB) để tránh đầy ổ.
SSD_MIN_FREE_GIB=2

# Bộ nhớ đệm RAM khi xem/tải file (MiB) và hạn mức dọn cache TDLib mỗi tài khoản (MiB)
MEMORY_CACHE_MIB=64
TDLIB_CACHE_MIB=1024

RUST_LOG=itclub_cloud=info
```

## Host dự án
- Frontend sử dụng vercel để host sau đó lấy url truy cập frontend gắn vào `PUBLIC_URL=` tại `backend/.env`
- Backend dùng vps để host sau đó gắn địa chỉ backend vào `BACKEND_URL=` tại `frontend/.env`

## Thiết lập lần đầu sau khi mở Web

1. Mở giao diện web, nhập mã `SETUP_TOKEN` để tạo tài khoản **Quản trị viên (Admin)**.
2. Chuyển sang mục **Cài đặt → Hạ tầng & Telegram**.
3. Mở phần **Thông số Telegram API**, nhập **API ID** và **API Hash**, bấm **Lưu và khởi tạo TDLib**.
4. Bấm **Hiện mã QR đăng nhập**, mở ứng dụng Telegram trên điện thoại (**Cài đặt → Thiết bị → Liên kết thiết bị**) và quét mã QR.
5. Tại mục **Nơi lưu dữ liệu mặc định**, chọn `me` (Saved Messages) hoặc nhập Chat ID / `@username` của Nhóm/Kênh lưu trữ. Nếu muốn tăng tốc độ tải lên bằng nhiều Bot (**Pool Bot Upload**), hãy chọn một Nhóm/Kênh nơi cả tài khoản chính và các Bot đều có quyền gửi tài liệu.

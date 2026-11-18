# IT Club Media Cloud

> Workspace quản lý file và hình ảnh sự kiện cho câu lạc bộ. Frontend và API sử dụng **Next.js + TypeScript**; SQLite lưu metadata, Telegram/TDLib hoặc Telegram Bots lưu nội dung file.

**Chức năng:** Drive · Kéo-thả · Xem trước · Poster & recap · Upload/download progress · Google Drive backup · API tích hợp · Phân quyền.

## Bắt đầu nhanh

Yêu cầu: Node.js **22**, npm, Linux x64, thư viện `libtdjson.so.1.8.67` nếu sử dụng TDLib. Cài từ bản source hoặc apply patch lên đúng phiên bản trước đó.

```bash
cp .env.example .env
# Chỉnh APP_ORIGIN và SETUP_TOKEN
npm install
npm run dev
```

Mở `http://localhost:3000`. Lần đầu tạo admin bằng `SETUP_TOKEN` rồi đăng nhập.

**Nếu gặp `better_sqlite3.node` not found:** dùng Node 22; cài `python3 make g++`, chạy `npm rebuild better-sqlite3 --build-from-source` hoặc `npm ci`. Không xóa `data/`.

### Chạy trên VPS

```bash
# Đặt thư viện Linux đã biên dịch sẵn tại tdlib-native/lib/libtdjson.so.1.8.67
cp .env.example .env
# APP_ORIGIN=https://cloud.example.com; SETUP_TOKEN=giá-trị-ngẫu-nhiên

docker compose up -d --build
docker compose logs -f media-cloud backup
```

Docker chỉ xuất cổng web ở `127.0.0.1:3000` để đặt sau reverse proxy/Cloudflare Tunnel. Worker `backup` chạy riêng, tự đọc cấu hình đã lưu trên web và kiểm tra lịch mỗi phút. Không cần sửa `.env` khi thêm bot hoặc thay chu kỳ backup.

## Giao diện

### Drive

- Tạo thư mục, tải file và thư mục lên, tải file xuống, đổi tên và xóa mềm.
- Thả file hoặc một thư mục từ máy tính vào vùng Drive. Thư mục con được tạo theo cấu trúc nguồn; thư mục đã tồn tại có thể được tái sử dụng.
- Chọn một file để xem trước. Dùng **← / →** chuyển file, **Esc** để đóng. Tải xuống có thanh tiến trình.
- Xem trước hỗ trợ: ảnh (zoom/xoay), video (phụ đề SRT/VTT), audio, PDF, Markdown, văn bản/code, DOCX, XLSX, PPTX, ODT/ODP, EPUB, ZIP/CBZ và font. Trình duyệt có thể không hỗ trợ một số codec video. File quá 25 MiB đối với định dạng cần giải mã trên máy khách thì tải xuống thay vì preview.

### Sự kiện & recap

```text
Workshop GitHub/
├── poster.png
└── recap/
    ├── 01.jpg
    ├── 02.jpg
    └── 03.webp
```

Quản trị viên hoặc thành viên có quyền **Quản lý sự kiện** được tạo sự kiện, cập nhật poster và upload nhiều ảnh recap. Thả poster vào vùng **Poster**, thả ảnh vào vùng **Recap**. Ảnh poster được truyền nguyên file và hiển thị `object-fit: contain`, không cắt, không chuyển định dạng.

API `events:read` chỉ được đọc ảnh thuộc sự kiện đã xuất bản.

### Tiến trình upload/download

Bảng tiến trình theo dõi máy tính → server → Telegram, phần trăm, tốc độ, lỗi và trạng thái hoàn thành. Trạng thái upload trên server được lưu trong SQLite; trạng thái tải xuống trên trình duyệt chỉ tồn tại trong phiên đang mở.

## Cấu hình Telegram Bot ngay trên web

1. Tạo bot tại `@BotFather` và thêm bot vào nhóm Telegram, cấp quyền gửi tài liệu.
2. Đăng nhập bằng tài khoản quản trị, mở **Cài đặt → Telegram Bot**.
3. Nhấn **Thêm bot**; nhập tên duy nhất, token và **Chat ID** (dạng `-100...`). Có thể thêm nhiều bot dùng cùng hoặc khác nhóm.
4. Chọn số luồng 1–5, nhấn **Lưu cấu hình**, rồi **Kiểm tra kết nối**.

Mỗi bot chia file thành các phần 16 MiB để sử dụng Telegram Bot API công khai. Khi tải lại, hệ thống chọn đúng bot đã gửi từng phần. **Không xóa hoặc đổi token/nhóm của bot đã chứa dữ liệu**. Trang quản trị ngăn các thao tác thay đổi bot đang được tham chiếu trong database.

Không cần `TELEGRAM_BOTS_JSON` trong `.env`. Nếu triển khai từ bản cũ, giá trị `.env` được đọc như cấu hình mặc định cho đến khi bạn lưu cấu hình mới trên web.

### TDLib

TDLib dùng thư viện `.so` Linux có sẵn tại `tdlib-native/lib/`. Thiết lập `TELEGRAM_API_ID` và `TELEGRAM_API_HASH` của Telegram client app ở `.env`, sau đó đăng nhập TDLib bằng QR tại Cài đặt. Bạn có thể chọn chế độ **Chỉ TDLib** thay vì bot trong giao diện quản trị. Không phải build lại Rust.

## Sao lưu lên Google Drive

Hệ thống sao lưu **SQLite, user và password hash, phân quyền, metadata và các file gốc** khi bật tùy chọn. Archive được mã hóa bằng **AES-256-GCM** trước khi upload. Mặc định mỗi **6 giờ** (có thể thay trên web).

### Kết nối Google Drive trên web

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/), tạo hoặc chọn project.
2. Bật **Google Drive API**, thiết lập **OAuth consent screen**, thêm tài khoản Google của bạn vào test users nếu app đang thử nghiệm.
3. Tạo **OAuth Client ID kiểu Web application** và thêm Authorized Redirect URI:

   ```text
   https://cloud.example.com/api/admin/google/callback
   ```

4. Mở **Cài đặt → Sao lưu Google Drive** trên ứng dụng; nhập Client ID, Client Secret, chu kỳ, số bản lưu và tùy chọn file.
5. **Lưu cài đặt → Kết nối Google** để cấp quyền `drive.file`. Sau khi chuyển về ứng dụng, chọn **Kiểm tra Drive**.
6. Bấm **Sao lưu ngay** hoặc chờ worker chạy theo lịch. Cấu hình được mã hóa trong SQLite, không đưa refresh token vào trình duyệt hoặc `.env`.

**Quan trọng:** nếu OAuth Consent Screen còn ở chế độ Testing, refresh token của tài khoản ngoài tổ chức có thể hết hạn sau 7 ngày; với hệ thống chạy lâu dài cần cấu hình ứng dụng OAuth phù hợp trước khi vận hành. `APP_ORIGIN` phải trùng chính xác domain và scheme của redirect URI khai báo. Để sử dụng trên VPS nên chạy HTTPS. Dung lượng Google One/Gemini của tài khoản **không tự cấp quyền OAuth**; cần đồng ý cấp quyền Drive như các bước trên.

Khóa giải mã dự phòng nằm ở `data/backup-secret.key` (không nằm trong archive backup). **Sao chép khóa này tới nơi an toàn ngoài server và ngoài Drive**. `data/master.key` là khóa mã hóa thông tin dịch vụ. Giữ cả hai khi di chuyển hoặc khôi phục dữ liệu. Không commit khóa vào Git.

### Khôi phục

```bash
# Giải mã archive với data/backup-secret.key (hoặc BACKUP_ENCRYPTION_KEY cho bản cũ)
npm run backup:restore -- /path/to/itclub-media-2026.itcbak /tmp/restore-media
# Kiểm tra bản restore trước khi chép lên hệ thống đang chạy
npm run backup:restore-media -- /tmp/restore-media
```

Ngừng dịch vụ và sao lưu database hiện tại trước khi thực hiện khôi phục thực tế. Xem chi tiết trong `docs/ARCHITECTURE.md`.

## API

| Endpoint                                 | Quyền                | Mục đích                      |
| ---------------------------------------- | -------------------- | ----------------------------- |
| `GET /api/drive`                         | Đăng nhập            | Liệt kê file/thư mục          |
| `POST /api/drive/upload`                 | Đăng nhập            | Upload file                   |
| `POST /api/drive/folder`                 | Đăng nhập            | Tạo thư mục                   |
| `GET /api/drive/:id/file`                | Có quyền trên file   | Đọc hoặc tải file             |
| `GET /api/events`                        | Đăng nhập            | Danh sách sự kiện             |
| `POST /api/events/:id/upload`            | Quản lý sự kiện      | Poster/recap                  |
| `GET /api/integrations/media/events`     | Bearer `events:read` | Danh sách sự kiện đã xuất bản |
| `GET /api/integrations/media/events/:id` | Bearer `events:read` | Thông tin ảnh                 |
| `GET /api/integrations/media/files/:id`  | Bearer `events:read` | Stream ảnh                    |
| `GET /api/admin/bots` / `PUT`            | Admin                | Cấu hình bot, token được giấu |
| `GET /api/admin/backup` / `PUT` / `POST` | Admin                | Cấu hình / yêu cầu sao lưu    |
| `GET /api/admin/google/connect`          | Admin                | Bắt đầu OAuth                 |
| `GET /api/admin/google/callback`         | Admin                | Nhận token OAuth              |

Các thao tác thay đổi dữ liệu trong UI sử dụng session cookie `HttpOnly`, kiểm tra Origin và `X-Requested-With: ITClub Media`. API service chỉ chấp nhận Bearer token được cấp từ trang Cài đặt.

## Tổ chức mã nguồn

```text
app/
  page.tsx                 Drive, sự kiện, cài đặt
  FilePreview.tsx          Preview và điều hướng
  PreviewDocuments.tsx     Word, Excel, EPUB, ZIP...
  DropZone.tsx             Kéo-thả file/thư mục
  AdminStorageSettings.tsx Bot và Google Drive
  TransferCenter.tsx       Tiến trình
  api/                     API Next.js
lib/
  db.ts                    SQLite và migration cộng dồn
  files.ts                 Stream, Telegram và quyền file
  bots.ts                  Chia phần / nhiều bot
  backup-settings.ts       Cấu hình backup
  private-settings.ts      Mã hóa cấu hình
scripts/
  backup-daemon.cjs        Scheduler và upload Google Drive
  private-settings.cjs     Đọc cấu hình web trong worker
  restore-backup.cjs       Giải mã dữ liệu
  restore-media.cjs        Hỗ trợ khôi phục file
```

`data/` lưu database, master key, khóa backup, các phiên TDLib và dữ liệu tạm. Thư mục này phải dùng volume bền vững và **không commit vào Git**.

## Phát triển và kiểm thử

```bash
npm run typecheck
npm test
npm run format
npm run format:check
npm run build
```

- Đổi schema SQLite theo hướng cộng dồn, không xóa dữ liệu cũ.
- Cập nhật contract API khi thay đổi upload hoặc tên trường.
- Không ghi token, OAuth secret hoặc private key vào log.
- Preview giới hạn dung lượng và không thực thi script từ tài liệu.
- Trước khi deploy, chạy test, build, sau đó thử upload/download thật với nhóm bot và tài khoản Drive đã cấp quyền.

## Khắc phục lỗi thường gặp

| Vấn đề                                 | Cách xử lý                                                               |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `Could not locate better_sqlite3.node` | Node 22, cài công cụ build, `npm rebuild better-sqlite3`                 |
| Bot kiểm tra lỗi                       | Kiểm tra token, chat ID, bot có trong nhóm và có quyền gửi tài liệu      |
| OAuth redirect mismatch                | Kiểm tra `APP_ORIGIN` và Redirect URI trên Google Cloud                  |
| Backup không chạy                      | Kiểm tra `docker compose logs -f backup` và thư mục `data/` có quyền ghi |
| Không xem được video                   | Trình duyệt có thể không hỗ trợ codec; hãy tải file xuống                |
| Không thấy ảnh sự kiện từ API          | Kiểm tra trạng thái đã xuất bản và Bearer token `events:read`            |

## Giấy phép

Xem [LICENSE](LICENSE).

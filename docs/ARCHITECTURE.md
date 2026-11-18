# Kiến trúc hệ thống

## Thành phần

```text
Browser ── Next.js App Router ── SQLite (users, nodes, events, parts, transfers)
                 │
                 ├── TDLib Worker ─────────── Telegram user/group
                 │
                 ├── Bot API ──────────────── Telegram group
                 │
                 └── Internal backup endpoint ── Backup worker ── Google Drive
```

- **Next.js:** giao diện và API; Node runtime, một process, không dùng Edge.
- **SQLite:** account, session, phân quyền, cấu trúc folder và metadata.
- **TDLib:** tiến trình Worker thread gọi `tdjson.so` thông qua Koffi.
- **Bot API:** cấu hình từ trang Cài đặt (admin), mã hóa AES-256-GCM bằng `master.key` trước khi lưu vào SQLite. File chia 16 MiB, phân phối qua nhiều bot. `parts.account` và `bot_files` giữ bot/file ID để khôi phục đúng nguồn.
- **Transfer jobs:** SQLite giữ số byte đã nhận và byte đã truyền tới Telegram; browser dùng XMLHttpRequest để đo chặng thiết bị → máy chủ.
- **Backup worker:** đọc cấu hình OAuth/chu kỳ từ SQLite mỗi lần kiểm tra lịch, snapshot SQLite, tải dữ liệu file qua API nội bộ với secret riêng, đóng gói `tar.gz`, mã hóa AES-256-GCM và upload Google Drive resumable. Không phụ thuộc vào trình duyệt.

## Luồng upload

1. Trình duyệt gửi file theo request HTTP, hiển thị số byte gửi lên server.
2. Server ghi file tạm có giới hạn dung lượng; kiểm tra chữ ký các định dạng ảnh.
3. Server gửi file qua TDLib hoặc bot. `parts` lưu thứ tự các phần, bot, chat ID, message ID; `bot_files` lưu Telegram file ID.
4. SQLite cập nhật node sau khi Telegram xác nhận thành công; file tạm được xóa.
5. Khi tải xuống, server đọc file từ đúng tài khoản Telegram và truyền nguyên byte về browser.

## Quyền

- `admin`: quản lý tài khoản, bot, sao lưu và service token.
- `can_manage_events`: tạo, đăng poster/recap, xuất bản và xóa sự kiện.
- `events:read`: token chỉ đọc các file thuộc sự kiện đã xuất bản; không cho thao tác ghi.
- `data/backup-internal.key`: bí mật giữa ứng dụng và backup worker, không cấp cho client. Có thể dùng biến `BACKUP_INTERNAL_TOKEN` cũ khi nâng cấp.

## Backup và khôi phục

Backup đầy đủ chứa `database.sqlite`, `master.key`, `manifest.json` và `media/<node_id>`. File được mã hóa bằng một khóa 32 byte độc lập trước khi tải lên Drive. Phải sao lưu `data/backup-secret.key` riêng, ngoài máy chủ và Drive. Khóa này không được đưa vào archive backup; khi nâng cấp từ bản cũ hệ thống giữ nguyên giá trị `BACKUP_ENCRYPTION_KEY` nếu có. Có script `backup:restore-media` kiểm tra SHA-256 và nhập lại dữ liệu vào Telegram bằng bot. Cần dừng website khi chạy script. Phiên đăng nhập TDLib không được khôi phục tự động.

## Giới hạn vận hành

- Một Next.js process và một backup worker; không scale ngang khi dùng SQLite.
- Upload trực tiếp chưa hỗ trợ tiếp tục file sau khi ngắt mạng; tiến trình lưu lại để theo dõi, không phải upload resumable.
- Telegram Bot API công khai giới hạn tải lại file ở 20 MB nên mỗi part tối đa 16 MiB.
- File backup đầy đủ mỗi 6 giờ có thể sử dụng đáng kể băng thông và SSD; theo dõi dung lượng và lịch.
- Google Drive có giới hạn API/quota, OAuth token có thể bị thu hồi hoặc hết hạn. OAuth kết nối qua `/api/admin/google/connect` và callback; token mã hóa trong bảng `settings`, chỉ admin được thao tác.
- Các route ảnh/tệp tải xuống có header `nosniff` và CSP sandbox để giảm rủi ro hiển thị nội dung chủ động. Preview DOCX dùng DOMPurify, ZIP giới hạn kích thước giải nén; không chạy code trong tệp.
- Drive hỗ trợ kéo-thả file/thư mục và tạo nhánh con bằng API folder hiện có. Preview ảnh/Office trên client không thay đổi nội dung file gốc.
- Bí mật trong `settings` phải được khôi phục cùng `master.key`; nếu mất khóa, bản mã OAuth và token bot không thể giải mã.
- Tệp đã xóa mềm không được đóng gói trong backup mới. Xóa mềm không đồng nghĩa xóa dữ liệu khỏi Telegram.

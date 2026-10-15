export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Không thể thực hiện yêu cầu.";
}

type ApiOptions = Omit<RequestInit, "body"> & { body?: unknown };

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("X-Requested-With", "ITClub Cloud");
  let body: BodyInit | undefined;
  if (
    options.body instanceof Blob ||
    options.body instanceof FormData ||
    options.body instanceof ArrayBuffer
  ) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }
  const response = await fetch(path, {
    ...options,
    body,
    headers,
    credentials: "same-origin",
  });
  const value: unknown = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message =
      typeof value === "object" &&
      value !== null &&
      "error" in value &&
      typeof value.error === "string"
        ? value.error
        : typeof value === "string" && value
          ? value
          : `HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return value as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "POST", body });
export const put = <T = unknown>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "PUT", body });
export const del = (path: string) => api(path, { method: "DELETE" });

export const streamURL = (id: string, download = false) =>
  `/api/nodes/${encodeURIComponent(id)}/stream${download ? "?download=true" : ""}`;

export const bytes = (value: number | string) => {
  const n = Number(value) || 0;
  if (n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  const unit = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4);
  return `${(n / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${["B", "KiB", "MiB", "GiB", "TiB"][unit]}`;
};

export const date = (value: number) =>
  value
    ? new Date(value * 1000).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const relativeTime = (value: number) => {
  if (!value) return "—";
  const diff = Math.floor(Date.now() / 1000) - value;
  if (diff < 60) return "Vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} ngày trước`;
  return date(value);
};

const stages: Record<string, string> = {
  staging: "Đang nhận file",
  queued: "Đang chờ",
  resolving: "Đang phân tích nguồn",
  batch: "Đang tải danh sách",
  batch_pending: "Chờ đến lượt",
  hashing: "Kiểm tra toàn vẹn (SHA-256)",
  telegram: "Đang gửi lên Telegram",
  downloading: "Đang tải nguồn ngoài",
  segments: "Đang tải phân đoạn HLS",
  muxing: "Đang ghép MP4 (FFmpeg)",
  processing: "Đang xử lý",
  done: "Hoàn tất",
  error: "Có lỗi",
  cancelled: "Đã hủy",
  interrupted: "Bị gián đoạn",
};

export const stageName = (stage: string) => stages[stage] || stage;

const auditNames: Record<string, string> = {
  login: "Đăng nhập thành công",
  login_failed: "Đăng nhập thất bại",
  password_changed: "Đổi mật khẩu tài khoản",
  create_user: "Tạo thành viên mới",
  edit_user: "Cập nhật thành viên",
  delete_user: "Xóa thành viên",
  upload: "Tải tệp lên hoàn tất",
  permanent_delete: "Xóa vĩnh viễn dữ liệu",
  telegram_config: "Cập nhật Telegram API",
  telegram_logout: "Đăng xuất Telegram",
  settings_changed: "Thay đổi cài đặt hệ thống",
  backup_telegram: "Gửi bản sao lưu qua Telegram",
};

export const auditActionName = (action: string) => auditNames[action] || action;

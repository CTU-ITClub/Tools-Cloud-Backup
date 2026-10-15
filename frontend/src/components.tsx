import React, { useEffect, useRef, useState } from "react";
import {
  X,
  LoaderCircle,
  Folder,
  File,
  FileText,
  Image,
  Film,
  Music2,
  Archive,
  Check,
  Copy,
  ArrowUpRight,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import type { CloudNode, User } from "./types";
import type { LucideIcon } from "lucide-react";
import { post, errorMessage } from "./api";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`} aria-label="ITClub Cloud">
      <span className="brand-mark">
        <img src="/brand/itclub-mark.svg" alt="" width="52" height="52" />
      </span>
      <span className="brand-name">
        <strong>ITClub</strong>
        <span>Cloud</span>
      </span>
    </div>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return <LoaderCircle size={size} className="spin" />;
}

export function FileIcon({
  node,
  size = 26,
}: {
  node: Pick<CloudNode, "kind" | "mime" | "name">;
  size?: number;
}) {
  if (node.kind === "folder") return <Folder size={size} />;
  if (
    node.mime?.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i.test(node.name)
  )
    return <Image size={size} />;
  if (
    node.mime?.startsWith("video/") ||
    /\.(mp4|webm|mkv|mov|m4v|ogv)$/i.test(node.name)
  )
    return <Film size={size} />;
  if (
    node.mime?.startsWith("audio/") ||
    /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(node.name)
  )
    return <Music2 size={size} />;
  if (/\.(zip|cbz|epub|rar|7z|tar|gz)$/i.test(node.name))
    return <Archive size={size} />;
  if (
    /\.(pdf|docx?|xlsx?|pptx?|odt|odp|txt|md|markdown|json|csv|tsv|xml|html?|ya?ml|toml|rs|py|js|ts|tsx)$/i.test(
      node.name,
    )
  )
    return <FileText size={size} />;
  return <File size={size} />;
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  headerActions,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  headerActions?: React.ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button,input,select,textarea,a[href]",
          ) ?? [],
        ).filter((el) => !el.matches(":disabled") && el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    ref.current
      ?.querySelector<HTMLElement>("input,textarea,select,button")
      ?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <header>
          <div className="min-w-0 flex-1">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="button-row">
            {headerActions}
            <button className="icon-button" onClick={onClose} aria-label="Đóng">
              <X size={20} />
            </button>
          </div>
        </header>
        {children}
      </section>
    </div>
  );
}

export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return <div className={`notice ${error ? "error" : ""}`}>{children}</div>;
}

export function Empty({
  icon: Icon = Folder,
  title = "Chưa có file nào",
  children,
  action,
}: {
  icon?: LucideIcon;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span>
        <Icon size={34} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      <input
        readOnly
        aria-label={label || "Giá trị sao chép"}
        value={value || ""}
        onFocus={(e) => e.target.select()}
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            setCopied(false);
          }
        }}
        title="Sao chép"
      >
        {copied ? <Check size={17} /> : <Copy size={17} />}
        <span className="copy-btn-text">{copied ? "Đã chép" : "Sao chép"}</span>
      </button>
    </div>
  );
}

export function Auth({
  setup,
  version,
  onLogin,
}: {
  setup: boolean;
  version?: string;
  onLogin: (user: User) => void;
}) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    setup_token: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await post<{ user: User }>(
        `/api/auth/${setup ? "setup" : "login"}`,
        form,
      );
      onLogin(result.user);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Logo />
        <div className="auth-story-copy">
          <span className="eyebrow">LƯU TRỮ · ĐỒNG BỘ · CHIA SẺ</span>
          <h1>
            Lưu điều hay.
            <br />
            <em>Chia sẻ điều mới.</em>
          </h1>
          <p>
            Không gian đám mây cá nhân kết nối trực tiếp với hạ tầng lưu trữ
            Telegram. Tải lên tệp lớn, xem trước tài liệu & đa phương tiện, tích
            hợp WebDAV/S3 mượt mà.
          </p>
          <div className="auth-graphic">
            <div className="floating-card one">
              <Film size={30} />
              <span>Xem trực tuyến</span>
              <small>Streaming video, âm thanh & tài liệu.</small>
            </div>
            <div className="floating-card two">
              <ShieldCheck size={30} />
              <span>An toàn & Bền vững</span>
              <small>
                Mã hóa AES-256-GCM, kiểm soát hạn mức SSD thông minh
              </small>
            </div>
            <div className="orbit one" />
            <div className="orbit two" />
          </div>
        </div>
        <footer>
          <span>ITClub Cloud {version ? `v${version}` : ""}</span>
          <span>POWERED BY RUST & TELEGRAM TDLIB</span>
        </footer>
      </aside>
      <main className="auth-form">
        <div>
          <div className="brand-endorsement">
            <img
              src="/brand/itclub-primary.svg"
              alt="IT Club"
              width="240"
              height="54"
            />
          </div>
          <div className="mobile-logo">
            <Logo />
          </div>
          <span className="eyebrow">
            {setup ? "KHỞI TẠO HỆ THỐNG LẦN ĐẦU" : "CHÀO MỪNG ĐẾN ITCLUB CLOUD"}
          </span>
          <h2>
            {setup ? "Tạo tài khoản Quản trị viên" : "Rất vui khi bạn trở lại"}
          </h2>
          <p>
            {setup
              ? "Nhập mã SETUP_TOKEN từ cấu hình hoặc log máy chủ để khởi tạo tài khoản quản trị đầu tiên."
              : "Đăng nhập để truy cập thư viện tệp, quản lý tác vụ và liên kết chia sẻ của bạn."}
          </p>
          <form onSubmit={submit}>
            {setup && (
              <label>
                Mã thiết lập (SETUP_TOKEN)
                <input
                  required
                  value={form.setup_token}
                  onChange={(e) =>
                    setForm({ ...form, setup_token: e.target.value })
                  }
                  placeholder="Dán mã từ biến môi trường SETUP_TOKEN hoặc log server"
                  autoComplete="off"
                />
              </label>
            )}
            <label>
              Tên tài khoản
              <input
                required
                autoFocus
                autoComplete="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="3–40 ký tự (a-z, 0-9, _ hoặc -)"
                minLength={setup ? 3 : undefined}
              />
            </label>
            <label>
              Mật khẩu
              <div className="password-field">
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete={setup ? "new-password" : "current-password"}
                  minLength={setup ? 10 : undefined}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder={
                    setup ? "Tối thiểu 10 ký tự" : "Nhập mật khẩu của bạn"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {error && <Notice error>{error}</Notice>}
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <Spinner />
              ) : (
                <>
                  {setup ? "Khởi tạo quản trị viên" : "Đăng nhập"}
                  <ArrowUpRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

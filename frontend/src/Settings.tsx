import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  CheckCircle2,
  RefreshCw,
  Plus,
  Trash2,
  KeyRound,
  Download,
  Send,
  ShieldCheck,
  HardDrive,
  Activity,
  Search,
  Edit3,
  Cloud,
} from "lucide-react";
import type {
  User,
  SettingsData,
  TelegramStatus,
  Member,
  Chat,
  Notify,
  Action,
  AuditEntry,
} from "./types";
import {
  api,
  post,
  put,
  del,
  date,
  relativeTime,
  bytes,
  auditActionName,
  errorMessage,
} from "./api";
import { Notice, Spinner, CopyField, Modal } from "./components";

function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="settings-card">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export default function Settings({
  user,
  notify,
  onLogout,
}: {
  user: User;
  notify: Notify;
  onLogout: () => void;
}) {
  const admin = user.role === "admin";
  const [tab, setTab] = useState<"telegram" | "account" | "backup">(
    admin ? "telegram" : "account",
  );
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [auditQuery, setAuditQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<Record<string, string | number> | null>(
    null,
  );
  const [credentials, setCredentials] = useState({ api_id: "", api_hash: "" });
  const [value, setValue] = useState("");
  const [chat, setChat] = useState("me");
  const [chats, setChats] = useState<Chat[]>([]);
  const [bot, setBot] = useState({ name: "", token: "" });
  const [password, setPassword] = useState({ old_password: "", password: "" });
  const [link, setLink] = useState("");

  async function load() {
    const data = await api<SettingsData>("/api/settings");
    setSettings(data);
    if (admin) {
      setTelegram(data.telegram ?? null);
      setChat(data.storage_chat ?? "me");
      setCredentials((c) => ({
        ...c,
        api_id: data.telegram_api_id ? String(data.telegram_api_id) : "",
      }));
    }
  }

  async function loadAudit() {
    if (!admin) return;
    const rows = await api<AuditEntry[]>("/api/admin/audit");
    setAudits(rows);
  }

  useEffect(() => {
    load().catch((e) => notify(errorMessage(e), true));
  }, []);

  useEffect(() => {
    if (admin && tab === "backup") {
      loadAudit().catch((e) => notify(errorMessage(e), true));
    }
  }, [admin, tab]);

  useEffect(() => {
    if (!admin || tab !== "telegram") return;
    let active = true;
    const timer = setInterval(
      () =>
        api<TelegramStatus>("/api/settings/telegram")
          .then((r) => active && setTelegram(r))
          .catch(() => {}),
      2000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [admin, tab]);

  const action: Action = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      if (message) notify(message);
      await load();
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  };

  const main = telegram?.accounts?.find((a) => a.key === "main");
  const state = main?.state?.["@type"];
  const ready = state === "authorizationStateReady";
  const stages: Record<string, [string, string]> = {
    authorizationStateWaitCode: ["code", "Mã xác nhận Telegram (OTP)"],
    authorizationStateWaitPassword: [
      "password",
      "Mật khẩu xác minh hai bước (2FA)",
    ],
    authorizationStateWaitEmailAddress: ["email", "Địa chỉ Email xác minh"],
    authorizationStateWaitEmailCode: [
      "email_code",
      "Mã xác nhận gửi qua Email",
    ],
  };
  const stage = stages[state ?? ""];

  if (!settings) {
    return (
      <div className="loading">
        <Spinner /> Đang tải cài đặt hệ thống…
      </div>
    );
  }

  const readyBotCount =
    telegram?.accounts?.filter(
      (a) =>
        a.bot &&
        a.state?.["@type"] === "authorizationStateReady" &&
        !a.cooldown_seconds,
    ).length || 0;

  const filteredAudits = audits.filter(
    (item) =>
      !auditQuery.trim() ||
      item.action.toLowerCase().includes(auditQuery.toLowerCase()) ||
      auditActionName(item.action)
        .toLowerCase()
        .includes(auditQuery.toLowerCase()) ||
      item.detail.toLowerCase().includes(auditQuery.toLowerCase()) ||
      (item.user_id &&
        item.user_id.toLowerCase().includes(auditQuery.toLowerCase())),
  );

  return (
    <div className="flex flex-col gap-5">
      {admin && (
        <div className="sheet-tabs self-start">
          <button
            type="button"
            className={tab === "telegram" ? "active" : ""}
            onClick={() => setTab("telegram")}
          >
            <Cloud
              size={15}
              style={{
                display: "inline",
                verticalAlign: "-2px",
                marginRight: 6,
              }}
            />
            Hạ tầng & Telegram
          </button>
          <button
            type="button"
            className={tab === "account" ? "active" : ""}
            onClick={() => setTab("account")}
          >
            <KeyRound
              size={15}
              style={{
                display: "inline",
                verticalAlign: "-2px",
                marginRight: 6,
              }}
            />
            Tài khoản & Tích hợp (API / S3 / WebDAV)
          </button>
          <button
            type="button"
            className={tab === "backup" ? "active" : ""}
            onClick={() => setTab("backup")}
          >
            <Activity
              size={15}
              style={{
                display: "inline",
                verticalAlign: "-2px",
                marginRight: 6,
              }}
            />
            Sao lưu & Nhật ký hệ thống
          </button>
        </div>
      )}

      {admin && tab === "telegram" && (
        <div className="settings-grid">
          <Section
            title="Kết nối Telegram"
            description="Đăng nhập bằng mã QR hoặc số điện thoại để kết nối kho lưu trữ Telegram."
          >
            {telegram?.error && <Notice error>{telegram.error}</Notice>}
            {ready ? (
              <div className="connection-ready">
                <CheckCircle2 />
                <div>
                  <strong>
                    Đã kết nối {main?.me?.first_name}{" "}
                    {main?.me?.last_name || ""}
                  </strong>
                  <p>Telegram ID: {main?.me?.id}</p>
                </div>
                <button
                  className="button danger subtle"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Đăng xuất Telegram? Các tác vụ tải lên và phát trực tuyến sẽ tạm dừng cho đến khi kết nối lại.",
                      )
                    ) {
                      action(() =>
                        post("/api/settings/telegram/auth", {
                          action: "logout",
                        }),
                      );
                    }
                  }}
                >
                  Đăng xuất
                </button>
              </div>
            ) : (
              <>
                <details open={!settings.telegram_api_id}>
                  <summary>Thông số Telegram API (API ID & API Hash)</summary>
                  <form
                    className="form-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      action(
                        () =>
                          post("/api/settings/telegram", {
                            api_id: Number(credentials.api_id),
                            api_hash: credentials.api_hash,
                          }),
                        "Đã lưu cấu hình Telegram API",
                      );
                    }}
                  >
                    <p className="muted">
                      Lấy API ID và API Hash tại{" "}
                      <a
                        href="https://my.telegram.org/apps"
                        target="_blank"
                        rel="noreferrer"
                      >
                        my.telegram.org/apps
                      </a>{" "}
                      (hoặc điền sẵn trong file <code>.env</code>).
                    </p>
                    <label>
                      API ID
                      <input
                        required
                        type="number"
                        value={credentials.api_id}
                        onChange={(e) =>
                          setCredentials({
                            ...credentials,
                            api_id: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      API Hash
                      <input
                        type="password"
                        placeholder={
                          settings.telegram_api_id
                            ? "Để trống nếu giữ nguyên API Hash cũ"
                            : "Chuỗi 32 ký tự hex"
                        }
                        value={credentials.api_hash}
                        onChange={(e) =>
                          setCredentials({
                            ...credentials,
                            api_hash: e.target.value,
                          })
                        }
                      />
                    </label>
                    <button className="button" disabled={busy}>
                      Lưu và khởi tạo TDLib
                    </button>
                  </form>
                </details>
                {main?.state?.error && (
                  <Notice error>{main.state.error}</Notice>
                )}
                {state === "authorizationStateWaitOtherDeviceConfirmation" &&
                main?.state.link ? (
                  <div className="qr-panel">
                    <div className="qr-box">
                      <QRCodeSVG
                        value={main.state.link}
                        size={208}
                        level="M"
                        marginSize={3}
                      />
                    </div>
                    <strong>Quét mã bằng ứng dụng Telegram</strong>
                    <p>
                      Mở Telegram trên điện thoại → Cài đặt → Thiết bị → Liên
                      kết thiết bị.
                    </p>
                    <small>
                      Mã QR tự động làm mới khi Telegram cấp token mới.
                    </small>
                  </div>
                ) : null}
                {stage ? (
                  <form
                    className="form-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      action(async () => {
                        await post("/api/settings/telegram/auth", {
                          action: stage[0],
                          value,
                        });
                        setValue("");
                      });
                    }}
                  >
                    <label>
                      {stage[1]}
                      <input
                        required
                        type={stage[0] === "password" ? "password" : "text"}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <button className="button primary" disabled={busy}>
                      Xác nhận
                    </button>
                  </form>
                ) : (
                  <div className="form-stack mt-3">
                    <button
                      className="button primary"
                      disabled={
                        busy ||
                        !telegram?.available ||
                        !settings.telegram_api_id
                      }
                      onClick={() =>
                        action(() =>
                          post("/api/settings/telegram/auth", { action: "qr" }),
                        )
                      }
                    >
                      <RefreshCw size={16} /> Hiện mã QR đăng nhập
                    </button>
                    <details>
                      <summary>Đăng nhập bằng số điện thoại</summary>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          action(() =>
                            post("/api/settings/telegram/auth", {
                              action: "phone",
                              value,
                            }),
                          );
                        }}
                        className="inline-form"
                      >
                        <input
                          placeholder="+84..."
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          required
                        />
                        <button className="button" disabled={busy}>
                          Gửi mã
                        </button>
                      </form>
                    </details>
                  </div>
                )}
                <small className="muted">
                  Trạng thái TDLib: {state || "Chưa khởi tạo"}
                </small>
              </>
            )}
          </Section>

          <Section
            title="Nơi lưu dữ liệu mặc định"
            description="Chọn Saved Messages (me) hoặc một Nhóm / Kênh riêng tư để lưu các part dữ liệu."
          >
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                action(
                  () => put("/api/settings", { storage_chat: chat }),
                  "Đã cập nhật nơi lưu trữ mặc định",
                );
              }}
            >
              <label>
                Chat lưu trữ (me, @username hoặc Chat ID âm)
                <input
                  list="telegram-chats"
                  value={chat}
                  onChange={(e) => setChat(e.target.value)}
                  placeholder="me, @username hoặc -100..."
                />
                <datalist id="telegram-chats">
                  <option value="me">Saved Messages (Tin nhắn đã lưu)</option>
                  {chats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </datalist>
              </label>
              <div className="button-row">
                <button className="button primary" disabled={busy}>
                  Lưu cấu hình
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={!ready || busy}
                  onClick={() =>
                    action(
                      async () =>
                        setChats(
                          await api<Chat[]>("/api/settings/telegram/chats"),
                        ),
                      "Đã tải danh sách hội thoại từ Telegram",
                    )
                  }
                >
                  Lấy danh sách chat
                </button>
              </div>
            </form>
            <p className="muted mt-3">
              Các tệp đã lưu trước đó vẫn đọc từ chat cũ bình thường. Kích thước
              mỗi phần (PART_SIZE_MIB):{" "}
              <strong>{bytes(settings.part_size)}</strong> · Giới hạn mỗi tệp
              (MAX_UPLOAD_GIB):{" "}
              <strong>{bytes(settings.max_upload_bytes || 0)}</strong>.
            </p>
          </Section>

          <Section
            title="Pool Bot Upload Telegram"
            description="Xoay vòng tài khoản chính và các Bot (tối đa 16 bot) để tăng tốc độ đẩy nhiều tệp song song."
          >
            <dl className="pool-metrics">
              <div>
                <dt>Bot sẵn sàng</dt>
                <dd>
                  {readyBotCount}
                  <span> / {settings.bots?.length || 0}</span>
                </dd>
              </div>
              <div>
                <dt>Luồng upload song song</dt>
                <dd>{settings.max_parallel_uploads ?? 2}</dd>
              </div>
              <div>
                <dt>Đích lưu trữ</dt>
                <dd className="pool-destination">
                  {settings.storage_chat === "me"
                    ? "Saved Messages"
                    : settings.storage_chat}
                </dd>
              </div>
            </dl>
            {settings.storage_chat === "me" && (
              <Notice>
                Đang chọn <strong>Saved Messages</strong> (chỉ tài khoản chính
                gửi được). Để kích hoạt Pool Bot Upload, hãy chuyển Nơi lưu dữ
                liệu sang một Nhóm/Kênh chung mà cả tài khoản chính và các Bot
                đều là Quản trị viên.
              </Notice>
            )}
            <details>
              <summary>Hướng dẫn cấu hình Bot Upload</summary>
              <ol className="setup-steps">
                <li>
                  Tạo bot mới qua @BotFather trên Telegram và sao chép Bot
                  Token.
                </li>
                <li>
                  Thêm tài khoản chính và tất cả bot vào một Nhóm hoặc Kênh lưu
                  trữ riêng tư, cấp quyền gửi tệp / đăng bài.
                </li>
                <li>Chọn Nhóm/Kênh đó ở mục Nơi lưu dữ liệu bên trên.</li>
                <li>Thêm Bot Token vào danh sách dưới đây.</li>
              </ol>
            </details>
            {settings.bots?.map((b) => {
              const account = telegram?.accounts.find((a) => a.key === b.id);
              return (
                <div className="item-row" key={b.id}>
                  <div>
                    <strong>{b.name}</strong>
                    <small>
                      {account?.state?.["@type"] === "authorizationStateReady"
                        ? "🟢 Đã sẵn sàng"
                        : account?.state?.["@type"] || "Đang kết nối"}
                    </small>
                    {(account?.cooldown_seconds ?? 0) > 0 && (
                      <small>
                        ⏳ Đang chờ hạ nhiệt {account?.cooldown_seconds}s
                      </small>
                    )}
                    {account?.state?.error && (
                      <small className="error-text">
                        {account.state.error}
                      </small>
                    )}
                  </div>
                  <button
                    className="icon-button danger"
                    title="Gỡ bot"
                    onClick={() => {
                      if (confirm(`Gỡ bot ${b.name}?`))
                        action(
                          () => del(`/api/settings/bots/${b.id}`),
                          "Đã gỡ bot",
                        );
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              );
            })}
            <form
              className="form-stack mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                action(async () => {
                  await post("/api/settings/bots", bot);
                  setBot({ name: "", token: "" });
                }, "Đã thêm bot vào Pool");
              }}
            >
              <div className="form-grid-2">
                <label>
                  Tên gợi nhớ
                  <input
                    required
                    placeholder="Bot 01"
                    value={bot.name}
                    onChange={(e) => setBot({ ...bot, name: e.target.value })}
                  />
                </label>
                <label>
                  Bot Token (@BotFather)
                  <input
                    required
                    type="password"
                    placeholder="123456789:ABCdef..."
                    value={bot.token}
                    onChange={(e) => setBot({ ...bot, token: e.target.value })}
                  />
                </label>
              </div>
              <button className="button" disabled={busy}>
                <Plus size={16} /> Thêm Bot vào Pool
              </button>
            </form>
          </Section>

          {settings.disk && (
            <Section
              title="Giám sát Dung lượng SSD (Admission Control)"
              description="Kiểm soát bộ nhớ tạm (temp + archives) và khoảng trống an toàn trên ổ cứng máy chủ."
              action={
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => action(load, "Đã làm mới thông số SSD")}
                >
                  <RefreshCw size={14} /> Làm mới
                </button>
              }
            >
              <dl className="pool-metrics">
                <div>
                  <dt>Dữ liệu tạm / Trần cho phép</dt>
                  <dd>
                    {bytes(settings.disk.temporary_bytes)}
                    <span>
                      {" "}
                      /{" "}
                      {settings.disk.temporary_limit_bytes
                        ? bytes(settings.disk.temporary_limit_bytes)
                        : "Không giới hạn"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Dung lượng ổ đĩa còn trống</dt>
                  <dd>{bytes(settings.disk.available_bytes)}</dd>
                </div>
                <div>
                  <dt>Ngưỡng trống an toàn tối thiểu</dt>
                  <dd>{bytes(settings.disk.minimum_free_bytes)}</dd>
                </div>
              </dl>
              {settings.disk.temporary_limit_bytes > 0 && (
                <div className="progress mb-3">
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        (settings.disk.temporary_bytes /
                          settings.disk.temporary_limit_bytes) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              )}
              <div className="ssd-meta-list">
                <span>
                  <HardDrive size={14} /> Dự phòng cắt part (PART_SIZE ×
                  MAX_PARALLEL_UPLOADS):{" "}
                  <strong>{bytes(settings.disk.upload_headroom_bytes)}</strong>
                </span>
                <span>
                  Mục tiêu dọn cache TDLib (TDLIB_CACHE_MIB):{" "}
                  <strong>
                    {bytes(settings.disk.tdlib_cache_bytes_per_account)} / tài
                    khoản
                  </strong>
                </span>
                {settings.pending_deletions !== undefined && (
                  <span>
                    Tin nhắn Telegram chờ dọn rác ngầm (GC):{" "}
                    <strong>{settings.pending_deletions} part</strong>
                  </span>
                )}
              </div>
              <p className="muted mt-3">
                Điều chỉnh thông số <code>SSD_TEMP_LIMIT_GIB</code> và{" "}
                <code>SSD_MIN_FREE_GIB</code> trong file <code>.env</code> của
                backend khi cần thay đổi hạn mức.
              </p>
            </Section>
          )}
        </div>
      )}

      {tab === "account" && (
        <div className="settings-grid">
          <Section
            title="API Key, WebDAV & S3"
            description="Kết nối ITClub Cloud như ổ đĩa mạng (Cyberduck, RaiDrive, Finder, Explorer) hoặc công cụ đồng bộ S3 (Rclone, AWS CLI)."
          >
            <label className="mb-3">
              Địa chỉ máy chủ WebDAV
              <CopyField value={`${settings.public_url}/webdav/`} />
            </label>
            <label className="mb-3">
              Địa chỉ S3 Endpoint (Bucket: itclub-cloud · Region: us-east-1)
              <CopyField value={`${settings.public_url}/s3`} />
            </label>
            <div className="item-row">
              <div>
                <strong>
                  API Key (Bearer Token / Mật khẩu ứng dụng WebDAV)
                </strong>
                <small>
                  Trạng thái:{" "}
                  {settings.api_enabled
                    ? "🟢 Đang kích hoạt"
                    : "⚪ Chưa khởi tạo"}
                </small>
              </div>
              <div className="button-row">
                <button
                  className="button small primary"
                  onClick={() =>
                    action(
                      async () =>
                        setKeys(
                          await post<Record<string, string | number>>(
                            "/api/profile/keys",
                            {
                              kind: "api",
                            },
                          ),
                        ),
                      "Đã tạo API Key mới",
                    )
                  }
                >
                  <KeyRound size={14} />{" "}
                  {settings.api_enabled ? "Cấp lại API Key" : "Tạo API Key"}
                </button>
                {settings.api_enabled && (
                  <button
                    className="button small danger"
                    onClick={() => {
                      if (confirm("Thu hồi API Key hiện tại?"))
                        action(
                          () =>
                            post("/api/profile/keys", { kind: "revoke_api" }),
                          "Đã thu hồi API Key",
                        );
                    }}
                  >
                    Thu hồi
                  </button>
                )}
              </div>
            </div>

            <div className="item-row">
              <div>
                <strong>Khóa truy cập S3 (SigV4 Path-Style)</strong>
                <small>
                  Access Key:{" "}
                  {settings.s3_access_key ? (
                    <code>{settings.s3_access_key}</code>
                  ) : (
                    "⚪ Chưa khởi tạo"
                  )}
                </small>
              </div>
              <div className="button-row">
                <button
                  className="button small primary"
                  onClick={() =>
                    action(
                      async () =>
                        setKeys(
                          await post<Record<string, string | number>>(
                            "/api/profile/keys",
                            {
                              kind: "s3",
                            },
                          ),
                        ),
                      "Đã tạo cặp khóa S3 mới",
                    )
                  }
                >
                  <KeyRound size={14} />{" "}
                  {settings.s3_access_key ? "Cấp lại khóa S3" : "Tạo khóa S3"}
                </button>
                {settings.s3_access_key && (
                  <button
                    className="button small danger"
                    onClick={() => {
                      if (confirm("Thu hồi khóa S3 hiện tại?"))
                        action(
                          () =>
                            post("/api/profile/keys", { kind: "revoke_s3" }),
                          "Đã thu hồi khóa S3",
                        );
                    }}
                  >
                    Thu hồi
                  </button>
                )}
              </div>
            </div>
            <p className="muted">
              Mẹo: Khi đăng nhập WebDAV, bạn nên dùng <strong>API Key</strong>{" "}
              làm mật khẩu để tốc độ xác thực nhanh hơn (bỏ qua bước băm
              Argon2).
            </p>
          </Section>

          <div className="flex flex-col gap-5">
            <Section
              title="Gửi tệp nhanh qua Telegram Bot (Inbox)"
              description="Liên kết tài khoản Telegram cá nhân của bạn để mọi video/tài liệu gửi riêng cho Bot tự động lưu vào thư mục gốc."
            >
              <p className="muted">
                Trạng thái liên kết:{" "}
                <strong>
                  {user.telegram_user_id
                    ? `🟢 Đã liên kết (Telegram ID: ${user.telegram_user_id})`
                    : "⚪ Chưa liên kết"}
                </strong>
              </p>
              <div className="button-row mt-3">
                <button
                  className="button primary"
                  onClick={() =>
                    action(
                      async () =>
                        setLink(
                          (
                            await post<{ command: string }>(
                              "/api/profile/telegram/link",
                            )
                          ).command,
                        ),
                      "Đã tạo mã liên kết (hiệu lực 10 phút)",
                    )
                  }
                >
                  Tạo lệnh /link mới
                </button>
                <button
                  className="button danger subtle"
                  onClick={() =>
                    action(async () => {
                      await del("/api/profile/telegram/link");
                      setLink("");
                    }, "Đã hủy liên kết Telegram cá nhân")
                  }
                >
                  Hủy liên kết
                </button>
              </div>
              {link && (
                <div className="mt-4">
                  <p className="muted mb-2">
                    Sao chép lệnh dưới đây và gửi vào cuộc trò chuyện riêng với
                    một trong các Bot của hệ thống (hết hạn sau 10 phút):
                  </p>
                  <CopyField value={link} />
                </div>
              )}
            </Section>

            <Section
              title="Đổi mật khẩu tài khoản"
              description="Sau khi đổi mật khẩu, tất cả các phiên đăng nhập trình duyệt hiện tại sẽ tự động đăng xuất."
            >
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  action(async () => {
                    await post("/api/profile/password", password);
                    onLogout();
                  });
                }}
              >
                <label>
                  Mật khẩu hiện tại
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password.old_password}
                    onChange={(e) =>
                      setPassword({ ...password, old_password: e.target.value })
                    }
                  />
                </label>
                <label>
                  Mật khẩu mới (tối thiểu 10 ký tự)
                  <input
                    required
                    type="password"
                    minLength={10}
                    autoComplete="new-password"
                    value={password.password}
                    onChange={(e) =>
                      setPassword({ ...password, password: e.target.value })
                    }
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  <ShieldCheck size={16} /> Cập nhật mật khẩu
                </button>
              </form>
            </Section>
          </div>
        </div>
      )}

      {admin && tab === "backup" && (
        <div className="settings-grid">
          <Section
            title="Sao lưu & Khôi phục Metadata"
            description="Bản sao lưu ZIP bao gồm cơ sở dữ liệu SQLite (itclub-cloud.db) và ảnh thu nhỏ (thumbs). Hãy lưu riêng tệp master.key ở nơi an toàn."
          >
            <label className="check-label mb-3">
              <input
                type="checkbox"
                checked={settings.backup_enabled || false}
                disabled={busy}
                onChange={(e) =>
                  action(
                    () =>
                      put("/api/settings", {
                        backup_enabled: e.target.checked,
                      }),
                    "Đã cập nhật lịch sao lưu tự động",
                  )
                }
              />
              <span>Tự động gửi bản sao lưu ZIP lên Telegram mỗi 24 giờ</span>
            </label>
            <p className="muted">
              Lần sao lưu tự động gần nhất:{" "}
              <strong>{date(Number(settings.last_backup))}</strong>
            </p>
            <div className="button-row mt-4">
              <a className="button primary" href="/api/admin/backup">
                <Download size={16} /> Tải bản sao lưu (.ZIP)
              </a>
              <button
                className="button"
                disabled={busy || !ready}
                onClick={() =>
                  action(
                    () => post("/api/admin/backup/telegram"),
                    "Đã gửi bản sao lưu lên chat lưu trữ Telegram",
                  )
                }
              >
                <Send size={16} /> Gửi ngay lên Telegram
              </button>
            </div>
            <details className="mt-4">
              <summary>Khôi phục từ bản sao lưu (.ZIP)</summary>
              <p className="mb-3">
                Thay thế database hiện tại bằng bản sao lưu. Sau khi tải lên
                hoàn tất, tiến trình backend sẽ tự dừng để áp dụng database mới
                ở lần khởi động tiếp theo (nếu cấu hình <code>systemd</code> với{" "}
                <code>Restart=always</code>, dịch vụ sẽ tự khởi động lại).
              </p>
              <label className="button danger">
                Chọn tệp ZIP để khôi phục
                <input
                  hidden
                  type="file"
                  accept=".zip"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (
                      file &&
                      confirm(
                        "CẢNH BÁO: Thay thế toàn bộ metadata hiện tại bằng bản sao lưu này và khởi động lại backend?",
                      )
                    ) {
                      action(
                        () =>
                          api("/api/admin/restore", {
                            method: "POST",
                            body: file,
                            headers: {
                              "Content-Type": "application/zip",
                              "X-Confirm-Restore": "REPLACE",
                            },
                          }),
                        "Đã nhận bản khôi phục. Đợi máy chủ khởi động lại.",
                      );
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </details>
          </Section>

          <Section
            title="Nhật ký hoạt động hệ thống (Audit Log)"
            description="300 sự kiện bảo mật và quản trị gần nhất (tự động dọn sau 90 ngày)."
            action={
              <button
                className="button small"
                onClick={() =>
                  loadAudit().catch((e) => notify(errorMessage(e), true))
                }
              >
                <RefreshCw size={14} /> Làm mới
              </button>
            }
          >
            <div className="search-field audit-search mb-3">
              <Search size={15} />
              <input
                placeholder="Lọc sự kiện, hành động hoặc ID…"
                value={auditQuery}
                onChange={(e) => setAuditQuery(e.target.value)}
              />
            </div>
            <div className="audit-list">
              {filteredAudits.length === 0 ? (
                <p className="muted py-4 text-center">
                  Không có bản ghi nhật ký nào khớp.
                </p>
              ) : (
                filteredAudits.map((entry) => (
                  <div className="audit-row" key={entry.id}>
                    <div>
                      <strong>{auditActionName(entry.action)}</strong>
                      <small>
                        <span className="tag">{entry.action}</span>
                        {entry.detail ? ` · Đích: ${entry.detail}` : ""}
                      </small>
                    </div>
                    <time title={date(entry.created_at)}>
                      {relativeTime(entry.created_at)}
                    </time>
                  </div>
                ))
              )}
            </div>
          </Section>
        </div>
      )}

      {keys && (
        <Modal
          title="Thông tin khóa truy cập mới"
          subtitle="Khóa bí mật chỉ hiển thị một lần duy nhất. Hãy sao chép và lưu lại ngay."
          onClose={() => setKeys(null)}
        >
          <div className="form-stack">
            {Object.entries(keys).map(([name, val]) => (
              <label key={name}>
                {name}
                <CopyField value={String(val)} />
              </label>
            ))}
            <div className="modal-actions">
              <button className="button primary" onClick={() => setKeys(null)}>
                Đã lưu an toàn
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Users({ notify }: { notify: Notify }) {
  const [users, setUsers] = useState<Member[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ username: "", password: "", quota: "0" });
  const [editing, setEditing] = useState<Member | null>(null);
  const [editQuota, setEditQuota] = useState("0");
  const [editPassword, setEditPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api<Member[]>("/api/admin/users").then(setUsers);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      api<Member[]>("/api/admin/users").then((data) => {
        if (active) setUsers(data);
      });
    void refresh().catch((e) => {
      if (active) notify(errorMessage(e), true);
    });
    const timer = setInterval(() => {
      if (!document.hidden) void refresh().catch(() => {});
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const action: Action = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      if (msg) notify(msg);
      await load();
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  };

  const totalUsed = users.reduce((sum, u) => sum + (u.used_bytes || 0), 0);
  const totalUploaded = users.reduce(
    (sum, u) => sum + (u.uploaded_bytes || 0),
    0,
  );
  const visibleUsers = users.filter(
    (u) =>
      !query.trim() || u.username.toLowerCase().includes(query.toLowerCase()),
  );

  function openEdit(member: Member) {
    setEditing(member);
    setEditQuota(
      String(Math.round((member.quota_bytes / 1073741824) * 100) / 100),
    );
    setEditPassword("");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="task-overview">
        <div>
          <span>Tổng thành viên</span>
          <strong>{users.length}</strong>
        </div>
        <div>
          <span>Tổng dung lượng đang lưu</span>
          <strong>{bytes(totalUsed)}</strong>
        </div>
        <div>
          <span>Tổng lưu lượng đã tải lên</span>
          <strong>
            {(totalUploaded / 1_000_000).toLocaleString("vi-VN", {
              maximumFractionDigits: 1,
            })}{" "}
            MB
          </strong>
        </div>
      </div>

      <div className="settings-grid">
        <Section
          title="Danh sách thành viên"
          description="Thống kê lưu lượng tải lên được bảo toàn kể cả khi xóa tệp. Dung lượng đang lưu bao gồm cả thùng rác."
        >
          <div className="search-field audit-search mb-3">
            <Search size={15} />
            <input
              placeholder="Tìm thành viên theo tên tài khoản…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {visibleUsers.map((u) => (
            <div className="item-row" key={u.id}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <strong>{u.username}</strong>
                  <span className="tag">
                    {u.role === "admin" ? "Quản trị viên" : "Thành viên"}
                  </span>
                  {u.disabled ? (
                    <span className="status-pill error">Đã khóa</span>
                  ) : null}
                </div>
                <small>
                  Hạn mức:{" "}
                  {u.quota_bytes ? bytes(u.quota_bytes) : "Không giới hạn"} ·
                  Tạo ngày {date(u.created_at)}
                </small>
                <div className="member-stats">
                  <span>
                    Đã tải lên:{" "}
                    <strong>
                      {(u.uploaded_bytes / 1_000_000).toLocaleString("vi-VN", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      MB
                    </strong>{" "}
                    ({u.uploaded_files} tệp) · Đang lưu:{" "}
                    <strong>{bytes(u.used_bytes)}</strong> ({u.file_count} tệp)
                  </span>
                  {u.quota_bytes > 0 && (
                    <div className="progress">
                      <span
                        style={{
                          width: `${Math.min(100, (u.used_bytes / u.quota_bytes) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              {u.role !== "admin" && (
                <div className="button-row">
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() => openEdit(u)}
                  >
                    <Edit3 size={14} /> Chỉnh sửa
                  </button>
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() =>
                      action(
                        () =>
                          put(`/api/admin/users/${u.id}`, {
                            disabled: !u.disabled,
                          }),
                        u.disabled
                          ? `Đã mở khóa ${u.username}`
                          : `Đã khóa ${u.username}`,
                      )
                    }
                  >
                    {u.disabled ? "Mở khóa" : "Khóa"}
                  </button>
                  <button
                    className="icon-button danger"
                    title="Xóa thành viên"
                    onClick={() => {
                      if (
                        confirm(
                          `Xóa vĩnh viễn tài khoản "${u.username}" và toàn bộ tệp tin của họ?`,
                        )
                      ) {
                        action(
                          () => del(`/api/admin/users/${u.id}`),
                          `Đã xóa thành viên ${u.username}`,
                        );
                      }
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </Section>

        <Section
          title="Tạo thành viên mới"
          description="Cấp tài khoản riêng với không gian lưu trữ độc lập và hạn mức (Quota) tùy chỉnh."
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                await post("/api/admin/users", {
                  username: form.username,
                  password: form.password,
                  quota_bytes: Math.round(Number(form.quota) * 1073741824),
                });
                setForm({ username: "", password: "", quota: "0" });
              }, `Đã tạo tài khoản ${form.username}`);
            }}
          >
            <label>
              Tên tài khoản (3–40 ký tự a-z, 0-9, _ hoặc -)
              <input
                required
                minLength={3}
                maxLength={40}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="nguyen_van_a"
              />
            </label>
            <label>
              Mật khẩu khởi tạo (tối thiểu 10 ký tự)
              <input
                required
                type="password"
                minLength={10}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Ít nhất 10 ký tự"
              />
            </label>
            <label>
              Hạn mức lưu trữ Quota (GiB — đặt 0 nếu không giới hạn)
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.quota}
                onChange={(e) => setForm({ ...form, quota: e.target.value })}
              />
            </label>
            <div className="button-row">
              {[
                ["Không giới hạn", "0"],
                ["5 GiB", "5"],
                ["20 GiB", "20"],
                ["50 GiB", "50"],
                ["100 GiB", "100"],
              ].map(([label, val]) => (
                <button
                  key={val}
                  type="button"
                  className={`button small ${form.quota === val ? "primary" : ""}`}
                  onClick={() => setForm({ ...form, quota: val })}
                >
                  {label}
                </button>
              ))}
            </div>
            <button disabled={busy} className="button primary">
              <Plus size={16} /> Thêm thành viên
            </button>
          </form>
        </Section>
      </div>

      {editing && (
        <Modal
          title={`Chỉnh sửa thành viên: ${editing.username}`}
          subtitle={`Đang sử dụng ${bytes(editing.used_bytes)} (${editing.file_count} tệp)`}
          onClose={() => setEditing(null)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                const payload: { quota_bytes?: number; password?: string } = {
                  quota_bytes: Math.round(Number(editQuota) * 1073741824),
                };
                if (editPassword.trim()) payload.password = editPassword;
                await put(`/api/admin/users/${editing.id}`, payload);
                setEditing(null);
              }, `Đã cập nhật tài khoản ${editing.username}`);
            }}
          >
            <label>
              Hạn mức Quota (GiB — 0 là không giới hạn)
              <input
                type="number"
                min="0"
                step="0.5"
                value={editQuota}
                onChange={(e) => setEditQuota(e.target.value)}
              />
            </label>
            <div className="button-row">
              {[
                ["Không giới hạn", "0"],
                ["5 GiB", "5"],
                ["20 GiB", "20"],
                ["50 GiB", "50"],
                ["100 GiB", "100"],
              ].map(([label, val]) => (
                <button
                  key={val}
                  type="button"
                  className={`button small ${editQuota === val ? "primary" : ""}`}
                  onClick={() => setEditQuota(val)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              Đặt lại mật khẩu mới (để trống nếu không đổi)
              <input
                type="password"
                minLength={10}
                placeholder="Nhập ít nhất 10 ký tự nếu muốn đặt lại mật khẩu"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setEditing(null)}
              >
                Hủy
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? <Spinner /> : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

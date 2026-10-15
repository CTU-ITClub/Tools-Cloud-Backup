import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pause,
  X,
  ArrowRight,
  CheckCircle2,
  CloudUpload,
} from "lucide-react";
import type { Job, UploadProgress, UploadState } from "./types";
import { bytes, stageName } from "./api";

export default function TransferTray({
  upload,
  transfers,
  jobs,
  onPause,
  onClose,
  onJobs,
}: {
  upload: UploadState | null;
  transfers: Record<string, UploadProgress>;
  jobs: Job[];
  onPause: () => void;
  onClose: () => void;
  onJobs: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const rows = Object.entries(transfers).map(([id, transfer]) => ({
    id,
    transfer,
    job: jobs.find((job) => job.id === id),
  }));
  const pending = rows.filter(
    ({ job }) =>
      !job ||
      !["done", "error", "cancelled", "interrupted"].includes(job.status),
  ).length;

  return (
    <aside
      className="upload-tray transfer-tray"
      aria-label="Tiến trình tải lên"
    >
      <header>
        <CloudUpload size={18} />
        <strong>
          {upload?.active
            ? `Đang tải lên (${upload.count} tệp)`
            : pending
              ? `Đang đồng bộ Telegram (${pending} tệp)`
              : "Tiến trình truyền dữ liệu"}
        </strong>
        <button
          className="icon-button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
        >
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {upload?.active ? (
          <button
            className="icon-button"
            title="Tạm dừng gửi lên server"
            onClick={onPause}
          >
            <Pause size={16} />
          </button>
        ) : (
          <button
            className="icon-button"
            title="Ẩn bảng tiến trình"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        )}
      </header>
      {!collapsed && (
        <div className="transfer-rows">
          {!rows.length && upload && (
            <p>{upload.name} · Đang cấp phát trên SSD…</p>
          )}
          {rows.map(({ id, transfer, job }) => {
            const local =
              job &&
              ["queued", "hashing", "telegram", "done"].includes(job.status)
                ? 100
                : transfer.percent;
            const telegram =
              job?.status === "done"
                ? 100
                : job?.status === "telegram"
                  ? job.progress
                  : 0;
            return (
              <div className="transfer-row" key={id}>
                <strong title={transfer.name}>
                  {job?.status === "done" && <CheckCircle2 size={14} />}{" "}
                  {transfer.name}
                </strong>
                <div className="transfer-label">
                  <span>Thiết bị → Máy chủ</span>
                  <b>{local}%</b>
                </div>
                <div
                  className={`progress ${local < 100 && upload?.active ? "active-bar" : ""}`}
                >
                  <span style={{ width: `${local}%` }} />
                </div>
                <div className="transfer-label">
                  <span>Máy chủ → Telegram</span>
                  <b>{telegram}%</b>
                </div>
                <div
                  className={`progress telegram ${
                    job?.status === "telegram" ? "active-bar" : ""
                  }`}
                >
                  <span style={{ width: `${telegram}%` }} />
                </div>
                <small className={job?.error ? "error-text" : ""}>
                  {job?.error ||
                    (job
                      ? `${stageName(job.status)}${
                          job.status === "telegram"
                            ? ` · ${bytes(job.bytes_done)} / ${bytes(job.size)}`
                            : ""
                        }`
                      : "Đang khởi tạo tác vụ…")}
                </small>
              </div>
            );
          })}
          {!upload?.active && upload?.message && (
            <small>{upload.message}</small>
          )}
        </div>
      )}
      <button className="text-button" onClick={onJobs}>
        Mở trung tâm Tác vụ <ArrowRight size={15} />
      </button>
    </aside>
  );
}

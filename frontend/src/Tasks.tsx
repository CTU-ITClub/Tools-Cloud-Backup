import React, { useEffect, useState } from "react";
import {
  ListTodo,
  RefreshCw,
  X,
  ListVideo,
  Search,
  Upload,
} from "lucide-react";
import type { Job, Action } from "./types";
import {
  api,
  post,
  del,
  bytes,
  date,
  relativeTime,
  stageName,
  errorMessage,
} from "./api";
import { Empty, FileIcon, Modal, Notice, Spinner } from "./components";

const active = (status: string) =>
  !["done", "error", "interrupted", "cancelled"].includes(status);

function TaskCard({
  job: j,
  action,
  onChildren,
  parentActive = false,
}: {
  job: Job;
  action: Action;
  onChildren?: (job: Job) => void;
  parentActive?: boolean;
}) {
  const isBatch = j.batch_total > 0;
  const pct =
    j.status === "done" ? 100 : Math.min(100, Math.max(0, j.progress));
  const isActive = active(j.status);

  return (
    <article className={`job-card ${isActive ? "is-active" : ""}`}>
      <div className={`job-symbol ${j.status}`}>
        <FileIcon
          node={{
            name: j.name,
            mime: j.mime,
            kind: isBatch ? "folder" : "file",
          }}
        />
      </div>
      <div className="job-main">
        <div className="job-title">
          <strong>{j.name}</strong>
          <span className={`status-pill ${j.status}`}>
            {stageName(j.status)}
          </span>
        </div>

        <div className="task-progress-label">
          <span>
            {j.status === "telegram"
              ? "Chặng 2: Máy chủ → Telegram"
              : j.status === "staging"
                ? "Chặng 1: Thiết bị → Máy chủ"
                : stageName(j.status)}
          </span>
          <strong>{pct}%</strong>
        </div>

        <div
          className={`progress ${j.status === "telegram" ? "telegram" : ""} ${
            isActive ? "active-bar" : ""
          }`}
          role="progressbar"
          aria-label={j.name}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span style={{ width: `${pct}%` }} />
        </div>

        <p>
          {isBatch
            ? `${j.batch_done} / ${j.batch_total} mục đã lưu hoàn tất`
            : `${bytes(j.bytes_done)}${j.size > 0 ? ` / ${bytes(j.size)}` : ""}`}{" "}
          · <span title={date(j.created_at)}>{relativeTime(j.created_at)}</span>
        </p>

        {j.status === "telegram" && j.part_size > 0 && j.size > 0 && (
          <small>
            Phần{" "}
            {Math.min(
              Math.floor(j.bytes_done / j.part_size) + 1,
              Math.ceil(j.size / j.part_size),
            )}{" "}
            / {Math.ceil(j.size / j.part_size)} ·{" "}
            {j.progress === 100
              ? "Đang chờ Telegram xác nhận lưu trữ…"
              : "Đang đẩy dữ liệu lên Telegram"}
          </small>
        )}

        {j.error && <p className="error-text">{j.error}</p>}
        {j.status === "staging" && (
          <small>
            Tạm dừng gửi từ trình duyệt — chọn lại cùng tệp để tiếp tục các
            chunk còn thiếu.
          </small>
        )}
        {isBatch && (
          <button className="text-button" onClick={() => onChildren?.(j)}>
            <ListVideo size={15} /> Xem chi tiết ({j.batch_done}/{j.batch_total}
            )
          </button>
        )}
        {parentActive && ["error", "interrupted"].includes(j.status) && (
          <small>
            Đợi danh sách hoàn tất lượt chạy hiện tại trước khi thử lại mục này.
          </small>
        )}
      </div>

      <div className="button-row">
        {["error", "interrupted"].includes(j.status) && (
          <button
            className="button small"
            disabled={parentActive}
            onClick={() =>
              action(
                () => post(`/api/jobs/${j.id}/retry`),
                isBatch
                  ? "Đã tiếp tục các mục chưa hoàn tất"
                  : "Đã xếp hàng thử lại",
              )
            }
          >
            <RefreshCw size={14} /> {isBatch ? "Tiếp tục" : "Thử lại"}
          </button>
        )}
        {!["done", "cancelled"].includes(j.status) && (
          <button
            className="icon-button danger"
            title="Hủy tác vụ"
            onClick={() =>
              action(() => del(`/api/jobs/${j.id}`), "Đã hủy tác vụ")
            }
          >
            <X size={18} />
          </button>
        )}
      </div>
    </article>
  );
}

function BatchDetails({
  parent,
  onClose,
  action,
}: {
  parent: Job;
  onClose: () => void;
  action: Action;
}) {
  const [children, setChildren] = useState<Job[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const result = await api<Job[]>(`/api/jobs/${parent.id}/children`);
        if (!stopped) {
          setChildren(result);
          setError("");
        }
      } catch (e) {
        if (!stopped) setError(errorMessage(e));
      }
    }
    void load();
    const timer = setInterval(load, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [parent.id]);

  const complete = children?.filter((j) => j.status === "done").length || 0;
  const childAction: Action = async (fn, message) => {
    await action(fn, message);
    try {
      setChildren(await api<Job[]>(`/api/jobs/${parent.id}/children`));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal
      wide
      title={parent.name}
      subtitle={`${complete}/${parent.batch_total} mục hoàn tất`}
      onClose={onClose}
    >
      {error && <Notice error>{error}</Notice>}
      {!children ? (
        <div className="loading">
          <Spinner />
        </div>
      ) : (
        <div className="card-list batch-task-list">
          {children.map((j) => (
            <TaskCard
              key={j.id}
              job={j}
              action={childAction}
              parentActive={active(parent.status)}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function Tasks({
  jobs,
  action,
  connected,
  onTriggerUpload,
}: {
  jobs: Job[];
  action: Action;
  connected: boolean;
  onTriggerUpload: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "done" | "error">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Job | null>(null);

  const roots = jobs.filter(
    (j) =>
      !j.parent_job_id ||
      !jobs.find((p) => p.id === j.parent_job_id)?.batch_total,
  );
  const parent =
    selected && (jobs.find((j) => j.id === selected.id) || selected);

  const activeCount = roots.filter((j) => active(j.status)).length;
  const doneCount = roots.filter((j) => j.status === "done").length;
  const errorJobs = roots.filter((j) =>
    ["error", "interrupted"].includes(j.status),
  );

  const visible = roots
    .filter(
      (job) =>
        filter === "all" ||
        (filter === "active"
          ? active(job.status)
          : filter === "error"
            ? ["error", "interrupted"].includes(job.status)
            : job.status === "done"),
    )
    .filter(
      (job) =>
        !query.trim() || job.name.toLowerCase().includes(query.toLowerCase()),
    );

  return (
    <>
      <div className="task-overview">
        <div>
          <span>Đang tải lên</span>
          <strong>{activeCount}</strong>
        </div>
        <div>
          <span>Hoàn tất</span>
          <strong>{doneCount}</strong>
        </div>
        <div>
          <span>Cần chú ý / Lỗi</span>
          <strong>{errorJobs.length}</strong>
        </div>
      </div>

      <div className="task-toolbar">
        <div className="sheet-tabs">
          {(
            [
              ["all", `Tất cả (${roots.length})`],
              ["active", `Đang chạy (${activeCount})`],
              ["done", `Hoàn tất (${doneCount})`],
              ["error", `Có lỗi (${errorJobs.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="button-row">
          <div className="search-field task-search">
            <Search size={15} />
            <input
              placeholder="Lọc theo tên tệp…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {errorJobs.length > 0 && (
            <button
              className="button small"
              onClick={() =>
                action(async () => {
                  for (const job of errorJobs) {
                    try {
                      await post(`/api/jobs/${job.id}/retry`);
                    } catch {
                      /* skip jobs without staging source */
                    }
                  }
                }, "Đã gửi yêu cầu thử lại các tác vụ lỗi")
              }
            >
              <RefreshCw size={14} /> Thử lại tất cả lỗi
            </button>
          )}
          <button className="button small primary" onClick={onTriggerUpload}>
            <Upload size={14} /> Tải tệp lên
          </button>
          <small className="sync-status">
            <span className={connected ? "live" : ""} />
            {connected
              ? "Đồng bộ thời gian thực (WebSocket)"
              : "Tự cập nhật định kỳ"}
          </small>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {!visible.length && (
          <Empty
            icon={ListTodo}
            title="Chưa có tác vụ tải lên nào"
            action={
              <button className="button primary" onClick={onTriggerUpload}>
                <Upload size={16} /> Chọn tệp để tải lên
              </button>
            }
          >
            Tải tệp hoặc thư mục từ thiết bị của bạn lên máy chủ để lưu trữ an
            toàn qua Telegram.
          </Empty>
        )}
        {visible.map((j) => (
          <TaskCard
            key={j.id}
            job={j}
            action={action}
            onChildren={setSelected}
          />
        ))}
      </div>

      {parent && (
        <BatchDetails
          parent={parent}
          onClose={() => setSelected(null)}
          action={action}
        />
      )}
    </>
  );
}

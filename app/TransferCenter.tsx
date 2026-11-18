'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudDownload,
  CloudUpload,
  X,
  AlertTriangle,
} from 'lucide-react';
import { api, uploadFile } from '@/lib/client';

type Job = {
  id: string;
  name: string;
  direction: string;
  stage: string;
  bytes_total: number;
  bytes_received: number;
  bytes_remote: number;
  error: string | null;
};
type Task = {
  id: string;
  name: string;
  size: number;
  direction: 'upload' | 'download';
  local: number;
  remote: number;
  stage: string;
  error?: string;
  speed?: number;
};
type TransferActions = {
  upload: (path: string, files: File[], headers?: Record<string, string>) => Promise<void>;
  download: (id: string, name: string) => Promise<void>;
};
const Transfers = createContext<TransferActions | null>(null);
const format = (num: number) =>
  num >= 1048576
    ? `${(num / 1048576).toFixed(1)} MB`
    : num >= 1024
      ? `${(num / 1024).toFixed(0)} KB`
      : `${num} B`;
const percent = (v: number, t: number) =>
  Math.max(0, Math.min(100, Math.round((v / Math.max(1, t)) * 100)));

export function useTransfers() {
  const value = useContext(Transfers);
  if (!value) throw new Error('TransferProvider missing');
  return value;
}
export function TransferCenter({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const [local, setLocal] = useState<Record<string, Task>>({});
  const [remote, setRemote] = useState<Job[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const recent = useRef<Record<string, { time: number; bytes: number }>>({});
  const edit = useCallback(
    (id: string, patch: Partial<Task>) =>
      setLocal((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } })),
    [],
  );
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const poll = () =>
      api<Job[]>('/api/transfers')
        .then((items) => {
          if (active) setRemote(items);
        })
        .catch(() => {});
    void poll();
    const timer = setInterval(poll, 1300);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled]);
  const upload = useCallback(
    async (path: string, files: File[], headers: Record<string, string> = {}) => {
      if (!files.length) return;
      let index = 0;
      let error: Error | null = null;
      const worker = async () => {
        while (index < files.length) {
          const file = files[index++];
          const id = crypto.randomUUID();
          const time = performance.now();
          setLocal((prev) => ({
            ...prev,
            [id]: {
              id,
              name: file.name,
              size: file.size,
              direction: 'upload',
              local: 0,
              remote: 0,
              stage: 'receiving',
            },
          }));
          try {
            await uploadFile(path, file, headers, {
              id,
              onProgress: (sent) => {
                const sec = Math.max(0.1, (performance.now() - time) / 1000);
                edit(id, {
                  local: sent,
                  speed: sent / sec,
                  stage: sent === file.size ? 'telegram' : 'receiving',
                });
              },
            });
            edit(id, { local: file.size, remote: file.size, stage: 'done' });
          } catch (e) {
            edit(id, { stage: 'error', error: e instanceof Error ? e.message : 'Upload thất bại' });
            error = e instanceof Error ? e : new Error(String(e));
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, files.length) }, worker));
      if (error) throw error;
    },
    [edit],
  );
  const download = useCallback(
    async (id: string, name: string) => {
      const key = crypto.randomUUID();
      let writer: FileSystemWritableFileStream | undefined;
      // Open the save dialog before the first asynchronous network request.
      try {
        const picker = (
          window as Window & {
            showSaveFilePicker?: (o: { suggestedName: string }) => Promise<FileSystemFileHandle>;
          }
        ).showSaveFilePicker;
        if (picker) {
          const handle = await picker.call(window, { suggestedName: name });
          writer = await handle.createWritable();
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        throw e;
      }
      setLocal((prev) => ({
        ...prev,
        [key]: {
          id: key,
          name,
          size: 0,
          direction: 'download',
          local: 0,
          remote: 0,
          stage: 'downloading',
        },
      }));
      try {
        const response = await fetch(`/api/drive/${encodeURIComponent(id)}/file?download=1`, {
          credentials: 'same-origin',
        });
        if (!response.ok || !response.body) {
          throw new Error(`Không tải được file (HTTP ${response.status})`);
        }
        const size = Number(response.headers.get('content-length') || 0);
        edit(key, { size });
        const reader = response.body.getReader();
        let done = 0;
        const chunks: Uint8Array[] = [];
        const started = performance.now();
        while (true) {
          const data = await reader.read();
          if (data.done) break;
          done += data.value.byteLength;
          if (writer) await writer.write(new Uint8Array(data.value).buffer as ArrayBuffer);
          else chunks.push(data.value);
          edit(key, {
            local: done,
            remote: done,
            speed: done / Math.max(0.1, (performance.now() - started) / 1000),
          });
        }
        if (size && done !== size) throw new Error('File tải về chưa đủ dữ liệu');
        if (writer) await writer.close();
        else {
          const blob = new Blob(chunks as BlobPart[]);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
        edit(key, { stage: 'done', local: done, remote: done });
      } catch (e) {
        await writer?.abort().catch(() => {});
        edit(key, { stage: 'error', error: e instanceof Error ? e.message : 'Download thất bại' });
        throw e;
      }
    },
    [edit],
  );
  const tasks = Object.values(local).map((task) => {
    const matching = remote.find((j) => j.id === task.id);
    if (!matching) return task;
    const data = {
      ...task,
      remote: matching.bytes_remote,
      stage: matching.stage,
      error: matching.error || task.error,
      size: matching.bytes_total || task.size,
    };
    if (matching.stage === 'done') return { ...data, local: task.size, remote: task.size };
    return data;
  });
  for (const j of remote) {
    if (tasks.some((t) => t.id === j.id)) continue;
    tasks.push({
      id: j.id,
      name: j.name,
      size: j.bytes_total,
      direction: 'upload',
      local: j.bytes_received,
      remote: j.bytes_remote,
      stage: j.stage,
      error: j.error || undefined,
    });
  }
  const visible = tasks
    .filter((t) => !hidden.includes(t.id))
    .slice(-12)
    .reverse();
  const active = visible.filter((t) => !['done', 'error'].includes(t.stage)).length;
  return (
    <Transfers.Provider value={{ upload, download }}>
      {children}
      {enabled && visible.length > 0 && (
        <aside className="transfer-tray" aria-label="Truyền dữ liệu">
          <div className="transfer-title">
            <CloudUpload size={18} />
            <strong>Truyền dữ liệu {active > 0 ? `(${active} đang xử lý)` : ''}</strong>
            <button
              aria-label={collapsed ? 'Mở rộng' : 'Thu gọn'}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            </button>
            <button
              aria-label="Đóng bảng"
              onClick={() => setHidden((v) => [...v, ...visible.map((t) => t.id)])}
            >
              <X size={17} />
            </button>
          </div>
          {!collapsed && (
            <div className="transfer-items">
              {visible.map((t) => {
                const ended = t.stage === 'done';
                const failed = t.stage === 'error';
                const localProgress = ended ? 100 : percent(t.local, t.size);
                const remoteProgress = ended ? 100 : percent(t.remote, t.size);
                const stage =
                  t.direction === 'download'
                    ? 'Máy chủ → Thiết bị'
                    : t.stage === 'telegram'
                      ? 'Máy chủ → Telegram'
                      : t.stage === 'receiving'
                        ? 'Thiết bị → Máy chủ'
                        : ended
                          ? 'Hoàn tất'
                          : failed
                            ? 'Thất bại'
                            : 'Đang chuẩn bị';
                return (
                  <div className="transfer-item" key={t.id}>
                    <div className="transfer-name">
                      {ended ? (
                        <CheckCircle2 size={16} className="success-icon" />
                      ) : failed ? (
                        <AlertTriangle size={16} className="error-icon" />
                      ) : t.direction === 'upload' ? (
                        <CloudUpload size={16} />
                      ) : (
                        <CloudDownload size={16} />
                      )}
                      <strong title={t.name}>{t.name}</strong>
                      <span>
                        {ended
                          ? '100%'
                          : failed
                            ? 'Lỗi'
                            : `${t.direction === 'upload' && t.stage === 'telegram' ? remoteProgress : localProgress}%`}
                      </span>
                      <button aria-label="Ẩn tác vụ" onClick={() => setHidden((v) => [...v, t.id])}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className="transfer-stage">
                      {stage}
                      <span>
                        {t.size
                          ? `${format(t.direction === 'upload' && t.stage === 'telegram' ? t.remote : t.local)} / ${format(t.size)}`
                          : ''}
                      </span>
                    </div>
                    <div
                      className="transfer-meter"
                      role="progressbar"
                      aria-valuenow={localProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Truyền về máy chủ"
                    >
                      <i style={{ width: `${localProgress}%` }} />
                    </div>
                    {t.direction === 'upload' && (
                      <>
                        <div className="transfer-stage">
                          Lưu lên Telegram<span>{remoteProgress}%</span>
                        </div>
                        <div
                          className="transfer-meter secondary"
                          role="progressbar"
                          aria-valuenow={remoteProgress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Lưu lên Telegram"
                        >
                          <i style={{ width: `${remoteProgress}%` }} />
                        </div>
                      </>
                    )}
                    {t.speed && !ended && !failed && (
                      <div className="transfer-speed">Tốc độ khoảng {format(t.speed)}/s</div>
                    )}
                    {t.error && failed && <div className="transfer-error">{t.error}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      )}
    </Transfers.Provider>
  );
}

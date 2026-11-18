'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  CloudUpload,
  Folder,
  FolderPlus,
  Images,
  LayoutGrid,
  LogOut,
  Plus,
  Settings2,
  Trash2,
  FileImage,
  File,
  ArrowLeft,
  Download,
  ShieldCheck,
  Upload,
  KeyRound,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  HardDrive,
  Pencil,
  Menu,
  LockKeyhole,
  Users,
  ClipboardCopy,
  ExternalLink,
} from 'lucide-react';
import QRCode from 'qrcode';
import { api, post, patch, del } from '@/lib/client';
import { TransferCenter, useTransfers } from './TransferCenter';
import dynamic from 'next/dynamic';
import type { PreviewNode } from './FilePreview';
import { useFileDrop, DropHint } from './DropZone';

import { LoaderCircle } from 'lucide-react';
const FilePreview = dynamic(() => import('./FilePreview').then((module) => module.FilePreview), {
  ssr: false,
  loading: () => (
    <div className="preview-loader">
      <LoaderCircle className="spin" /> Đang mở trình xem...
    </div>
  ),
});
const AdminStorageSettings = dynamic(
  () => import('./AdminStorageSettings').then((module) => module.AdminStorageSettings),
  {
    ssr: false,
    loading: () => (
      <div className="preview-loader">
        <LoaderCircle className="spin" /> Đang mở cài đặt...
      </div>
    ),
  },
);

type Member = {
  id: string;
  username: string;
  role: string;
  can_manage_events: number;
  disabled: number;
};
type Node = {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  size: number;
  mime: string;
  updated_at: number;
};
type ClubEvent = {
  id: string;
  title: string;
  description: string;
  slug: string;
  published: number;
  poster_node_id: string | null;
  recap_count: number;
  created_at: number;
  owner: string;
};
type Detail = ClubEvent & { poster: Node | null; recap: Node[] };
const imageSrc = (id: string) => `/api/drive/${encodeURIComponent(id)}/file`;
const date = (s: number) => new Date(s * 1000).toLocaleDateString('vi-VN');
const bytes = (s: number) =>
  s > 1024 * 1024
    ? (s / 1048576).toFixed(1) + ' MB'
    : s > 1024
      ? (s / 1024).toFixed(1) + ' KB'
      : s + ' B';

function Button({
  children,
  onClick,
  soft = false,
  disabled = false,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  soft?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={soft ? 'btn btn-soft' : 'btn btn-primary'}
    >
      {children}
    </button>
  );
}
function useAlerts() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);
  const execute = useCallback(async (fn: () => Promise<unknown>) => {
    setPending((v) => v + 1);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra');
    } finally {
      setPending((v) => Math.max(0, v - 1));
    }
  }, []);
  return { error, setError, execute, pending };
}
function SignIn({ onReady }: { onReady: (member: Member) => void }) {
  const [setup, setSetup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [busy, setBusy] = useState(false);
  const { error, setError } = useAlerts();
  useEffect(() => {
    api<{ setup_required: boolean }>('/api/auth/status')
      .then((res) => setSetup(res.setup_required))
      .catch(() => {});
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await post<{ user: Member }>(setup ? '/api/auth/setup' : '/api/auth/login', {
        username,
        password,
        ...(setup ? { setup_token: setupToken } : {}),
      });
      onReady(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-screen">
      <section className="auth-intro">
        <img width="72" height="72" src="/brand/itclub-mark.svg" alt="Logo IT Club" />
        <div className="eyebrow">IT CLUB / MEDIA WORKSPACE</div>
        <h1>
          Những khoảnh khắc
          <br />
          <span>đáng được lưu giữ.</span>
        </h1>
        <p>Thư viện quản lý hình ảnh và tài liệu hoạt động của câu lạc bộ.</p>
        <div className="auth-feature">
          <Images size={21} /> Poster & album recap theo từng sự kiện
        </div>
        <div className="auth-feature">
          <ShieldCheck size={21} /> Chia sẻ có kiểm soát qua API
        </div>
      </section>
      <section className="auth-card">
        <div className="pill">IT CLUB CLOUD</div>
        <h2>{setup ? 'Thiết lập quản trị viên' : 'Chào mừng trở lại'}</h2>
        <p>Đăng nhập để quản lý kho ảnh của câu lạc bộ.</p>
        <form onSubmit={submit}>
          <label>
            Tên đăng nhập
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
            />
          </label>
          <label>
            Mật khẩu
            <input
              required
              minLength={10}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
            />
          </label>
          {setup && (
            <label>
              Mã thiết lập (SETUP_TOKEN)
              <input
                required
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                placeholder="Mã trong .env"
              />
            </label>
          )}
          {error && <div className="alert">{error}</div>}
          <Button type="submit" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle className="spin" size={17} /> Đang xử lý...
              </>
            ) : setup ? (
              'Tạo quản trị viên'
            ) : (
              'Đăng nhập'
            )}{' '}
            <ArrowLeft className="rotate" size={17} />
          </Button>
        </form>
        <p className="muted small">Đăng nhập nội bộ · Không cho phép tự đăng ký</p>
      </section>
    </div>
  );
}
function Drive({ execute }: { execute: (fn: () => Promise<unknown>) => void }) {
  const transfers = useTransfers();
  const [parent, setParent] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<Node[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Node | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(
        await api<Node[]>(`/api/drive${parent ? '?parent=' + encodeURIComponent(parent) : ''}`),
      );
    } finally {
      setLoading(false);
    }
  }, [parent]);
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);
  const create = () => {
    const name = prompt('Tên thư mục mới');
    if (!name) return;
    execute(async () => {
      await post('/api/drive/folder', { parent_id: parent, name });
      await refresh();
    });
  };
  const sendFiles = (files: File[]) => {
    if (!files.length || busy) return;
    execute(async () => {
      setBusy(true);
      try {
        const root = parent;
        const folderCache = new Map<string, Promise<string | null>>();
        const ensureFolder = (relative: string): Promise<string | null> => {
          if (!relative) return Promise.resolve(root);
          if (folderCache.has(relative)) return folderCache.get(relative)!;
          const parts = relative.split('/').filter(Boolean);
          const name = parts.at(-1)!;
          const promise = ensureFolder(parts.slice(0, -1).join('/')).then(async (parentId) => {
            try {
              const created = await post<{ id: string }>('/api/drive/folder', {
                parent_id: parentId,
                name,
              });
              return created.id;
            } catch (error) {
              const existing = await api<Node[]>(
                `/api/drive${parentId ? '?parent=' + encodeURIComponent(parentId) : ''}`,
              );
              const match = existing.find((item) => item.kind === 'folder' && item.name === name);
              if (match) return match.id;
              throw error;
            }
          });
          folderCache.set(relative, promise);
          return promise;
        };
        let index = 0;
        const errors: string[] = [];
        const worker = async () => {
          while (index < files.length) {
            const file = files[index++];
            try {
              const segments = (file.webkitRelativePath || '').split('/').filter(Boolean);
              if (
                segments.some(
                  (segment) => segment === '.' || segment === '..' || /[\\]/.test(segment),
                )
              )
                throw new Error('Đường dẫn tệp không hợp lệ');
              const parentId = await ensureFolder(segments.slice(0, -1).join('/'));
              await transfers.upload(
                '/api/drive/upload',
                [file],
                parentId ? { 'X-Parent-Id': parentId } : {},
              );
            } catch (e) {
              errors.push(`${file.name}: ${e instanceof Error ? e.message : 'Upload thất bại'}`);
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(2, files.length) }, worker));
        await refresh();
        if (errors.length) throw new Error(errors.slice(0, 3).join('\n'));
      } finally {
        setBusy(false);
      }
    });
  };
  const drop = useFileDrop(sendFiles, busy);
  const enter = (n: Node) => {
    setHistory((v) => [...v, { id: n.id, name: n.name }]);
    setParent(n.id);
  };
  const back = () => {
    const items = history.slice(0, -1);
    setHistory(items);
    setParent(items.at(-1)?.id || null);
  };
  return (
    <div
      className={drop.dragging ? 'drive-drop-surface dragging' : 'drive-drop-surface'}
      {...drop.handlers}
    >
      <DropHint visible={drop.dragging} />
      <div className="heading">
        <div>
          <div className="eyebrow">LƯU TRỮ CỦA BẠN</div>
          <h1>Drive của câu lạc bộ</h1>
          <p>Quản lý các tệp, thư mục và tải về khi cần.</p>
        </div>
        <div className="actions">
          <Button soft onClick={create}>
            <FolderPlus size={17} /> Thư mục mới
          </Button>
          <label className="btn btn-primary upload-label">
            <Upload size={17} /> {busy ? 'Đang upload...' : 'Tải tệp lên'}
            <input
              disabled={busy}
              type="file"
              multiple
              onChange={(e) => {
                sendFiles(Array.from(e.target.files || []));
                e.target.value = '';
              }}
              hidden
            />
          </label>
          <label className="btn btn-soft upload-label">
            <Folder size={17} /> Tải thư mục
            <input
              type="file"
              multiple
              {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={(e) => {
                sendFiles(Array.from(e.target.files || []));
                e.target.value = '';
              }}
              hidden
            />
          </label>
        </div>
      </div>
      <div className="toolbar">
        <button
          className="crumb"
          onClick={() => {
            setHistory([]);
            setParent(null);
          }}
        >
          <HardDrive size={17} /> Drive
        </button>
        {history.map((v, i) => (
          <button
            className="crumb"
            key={v.id}
            onClick={() => {
              setHistory(history.slice(0, i + 1));
              setParent(v.id);
            }}
          >
            / {v.name}
          </button>
        ))}
        <div className="grow" />
        <span>{items.length} mục</span>
      </div>
      {loading ? (
        <div className="files-skeleton">
          {Array.from({ length: 5 }, (_, i) => (
            <div className="skeleton-row" key={i}>
              <span className="skeleton square" />
              <span className="skeleton line" />
              <span className="skeleton short" />
            </div>
          ))}
        </div>
      ) : !items.length ? (
        <div className="empty">
          <Folder size={42} />
          <h3>Chưa có tệp nào</h3>
          <p>Bắt đầu bằng cách tạo thư mục hoặc tải tệp lên.</p>
        </div>
      ) : (
        <div className="file-list">
          {items.map((n) => (
            <div key={n.id} className="file-row">
              <button
                className="file-name"
                onClick={() => (n.kind === 'folder' ? enter(n) : setPreview(n))}
              >
                <span className="file-icon">
                  {n.kind === 'folder' ? (
                    <Folder size={24} />
                  ) : n.mime.startsWith('image/') ? (
                    <FileImage size={23} />
                  ) : (
                    <File size={23} />
                  )}
                </span>
                <span>
                  <strong>{n.name}</strong>
                  <small>{n.kind === 'folder' ? 'Thư mục' : n.mime}</small>
                </span>
              </button>
              <span className="file-size">{n.kind === 'folder' ? '—' : bytes(n.size)}</span>
              <span className="file-date">{date(n.updated_at)}</span>
              {n.kind === 'file' && (
                <button
                  className="icon-btn"
                  onClick={() => execute(() => transfers.download(n.id, n.name))}
                  title="Tải về"
                >
                  <Download size={18} />
                </button>
              )}
              <button
                className="icon-btn"
                title="Đổi tên"
                onClick={() => {
                  const name = prompt('Tên mới', n.name);
                  if (name)
                    execute(async () => {
                      await patch(`/api/drive/${n.id}`, { name });
                      await refresh();
                    });
                }}
              >
                <Pencil size={17} />
              </button>
              <button
                className="icon-btn danger"
                title="Xóa"
                onClick={() => {
                  if (confirm(`Xóa ${n.name}?`))
                    execute(async () => {
                      await del(`/api/drive/${n.id}`);
                      await refresh();
                    });
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      )}
      {preview && (
        <FilePreview
          node={preview as PreviewNode}
          siblings={items.filter((n) => n.kind === 'file') as PreviewNode[]}
          onSelect={(v) => setPreview(v as Node)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
function EventEditor({
  entry,
  onChanged,
  onBack,
  onDelete,
  execute,
  canEdit,
}: {
  entry: ClubEvent;
  onChanged: () => void;
  onBack: () => void;
  onDelete: () => void;
  execute: (fn: () => Promise<unknown>) => void;
  canEdit: boolean;
}) {
  const transfers = useTransfers();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Node | null>(null);
  const refresh = useCallback(
    async () => setDetail(await api<Detail>(`/api/events/${entry.id}`)),
    [entry.id],
  );
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);
  const upload = (kind: 'poster' | 'recap', files: File[] | null) => {
    if (!files?.length) return;
    execute(async () => {
      setBusy(true);
      try {
        const list = kind === 'poster' ? [files[0]] : files;
        if (
          list.some(
            (file) =>
              !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(
                file.type,
              ),
          )
        )
          throw new Error('Chỉ hỗ trợ ảnh JPEG, PNG, WebP, GIF, AVIF');
        await transfers.upload(`/api/events/${entry.id}/upload`, list, { 'X-Media-Kind': kind });
        await refresh();
        onChanged();
      } finally {
        setBusy(false);
      }
    });
  };
  const posterDrop = useFileDrop((files) => upload('poster', files), busy || !canEdit);
  const recapDrop = useFileDrop((files) => upload('recap', files), busy || !canEdit);
  const publish = (published: boolean) =>
    execute(async () => {
      await patch(`/api/events/${entry.id}`, { published });
      await refresh();
      onChanged();
    });
  const removeEvent = () => {
    if (!confirm('Xóa sự kiện và ẩn toàn bộ ảnh?')) return;
    execute(async () => {
      await del(`/api/events/${entry.id}`);
      onDelete();
    });
  };
  const removeMedia = (fileId: string) => {
    if (!confirm('Xóa ảnh khỏi sự kiện?')) return;
    execute(async () => {
      await del(`/api/events/${entry.id}/media/${fileId}`);
      await refresh();
      onChanged();
    });
  };
  if (!detail)
    return (
      <div className="preview-loader">
        <LoaderCircle className="spin" size={23} /> Đang tải sự kiện...
      </div>
    );
  return (
    <>
      <div className="heading">
        <div>
          <button className="back" onClick={onBack}>
            <ArrowLeft size={17} /> Tất cả sự kiện
          </button>
          <div className="eyebrow">ALBUM SỰ KIỆN / {detail.slug}</div>
          <h1>{detail.title}</h1>
          <p>{detail.description || 'Poster và những khoảnh khắc đáng nhớ của hoạt động.'}</p>
        </div>
        <div className="actions">
          <span className={detail.published ? 'status live' : 'status'}>
            {detail.published ? 'Đã xuất bản' : 'Bản nháp'}
          </span>
          {canEdit && (
            <Button soft onClick={() => publish(!detail.published)}>
              {detail.published ? <EyeOff size={17} /> : <Eye size={17} />}{' '}
              {detail.published ? 'Ẩn sự kiện' : 'Xuất bản'}
            </Button>
          )}
          {canEdit && (
            <button className="icon-btn danger" title="Xóa sự kiện" onClick={removeEvent}>
              <Trash2 size={17} />
            </button>
          )}
        </div>
      </div>
      <div className="editor-layout">
        <div
          className={
            posterDrop.dragging
              ? 'panel poster-panel media-drop-target dragging'
              : 'panel poster-panel media-drop-target'
          }
          {...posterDrop.handlers}
        >
          <DropHint visible={posterDrop.dragging} text="Thả poster vào đây" />
          <div className="panel-head">
            <h2>Poster chính</h2>
            <span>01 ảnh đại diện</span>
          </div>
          <div className="poster-slot">
            {detail.poster ? (
              <button
                className="poster-preview-button"
                onClick={() => setPreview(detail.poster)}
                title="Xem poster gốc"
              >
                <img src={imageSrc(detail.poster.id)} alt={`Poster ${detail.title}`} />
              </button>
            ) : (
              <div className="poster-placeholder">
                <FileImage size={48} />
                <p>Chưa có poster</p>
              </div>
            )}
          </div>
          {canEdit && detail.poster && (
            <button className="text-danger" onClick={() => removeMedia(detail.poster!.id)}>
              Xóa poster hiện tại
            </button>
          )}
          {canEdit && (
            <label className="btn btn-soft upload-label">
              {' '}
              {busy ? 'Đang upload...' : detail.poster ? 'Thay poster' : 'Tải poster lên'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                disabled={busy}
                onChange={(e) => {
                  upload('poster', Array.from(e.target.files || []));
                  e.target.value = '';
                }}
                hidden
              />
            </label>
          )}
        </div>
        <div
          className={
            recapDrop.dragging
              ? 'panel recap-panel media-drop-target dragging'
              : 'panel recap-panel media-drop-target'
          }
          {...recapDrop.handlers}
        >
          <DropHint visible={recapDrop.dragging} text="Thả ảnh recap vào đây" />
          <div className="panel-head">
            <div>
              <h2>Ảnh recap</h2>
              <p>{detail.recap.length} ảnh sau sự kiện</p>
            </div>
            {canEdit && (
              <label className="btn btn-primary upload-label">
                {busy ? 'Đang tải...' : 'Thêm ảnh'}
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                  disabled={busy}
                  onChange={(e) => {
                    upload('recap', Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                  hidden
                />
              </label>
            )}
          </div>
          {!detail.recap.length ? (
            <div className="empty compact">
              <Images size={37} />
              <h3>Chưa có ảnh recap</h3>
              <p>Tải các ảnh chụp sau hoạt động vào đây.</p>
            </div>
          ) : (
            <div className="recap-grid">
              {detail.recap.map((img) => (
                <div className="recap-photo" key={img.id}>
                  <button className="recap-preview-button" onClick={() => setPreview(img)}>
                    <img src={imageSrc(img.id)} alt={img.name} />
                    <span>{img.name}</span>
                  </button>
                  {canEdit && (
                    <button
                      className="recap-delete"
                      aria-label={`Xóa ${img.name}`}
                      onClick={() => removeMedia(img.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {preview && (
        <FilePreview
          node={preview as PreviewNode}
          siblings={[...(detail.poster ? [detail.poster] : []), ...detail.recap] as PreviewNode[]}
          onSelect={(n) => setPreview(n as Node)}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
function Events({
  member,
  execute,
}: {
  member: Member;
  execute: (fn: () => Promise<unknown>) => void;
}) {
  const [list, setList] = useState<ClubEvent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const canEdit = member.role === 'admin' || member.can_manage_events === 1;
  const refresh = useCallback(async () => {
    try {
      setList(await api<ClubEvent[]>('/api/events'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);
  const created = async () => {
    const result = await post<{ id: string }>('/api/events', { title, description });
    setCreate(false);
    setTitle('');
    setDescription('');
    await refresh();
    setSelected(result.id);
  };
  const current = list.find((e) => e.id === selected);
  if (current)
    return (
      <EventEditor
        key={current.id}
        entry={current}
        canEdit={canEdit}
        onChanged={() => {
          void refresh();
        }}
        onBack={() => setSelected(null)}
        onDelete={() => {
          setSelected(null);
          void refresh();
        }}
        execute={execute}
      />
    );
  return (
    <>
      <div className="heading">
        <div>
          <div className="eyebrow">THƯ VIỆN HOẠT ĐỘNG</div>
          <h1>Sự kiện & album ảnh</h1>
        </div>
        {canEdit && (
          <Button onClick={() => setCreate(true)}>
            <Plus size={18} /> Tạo sự kiện
          </Button>
        )}
      </div>
      <div className="stat-row">
        <div className="stat">
          <CalendarDays />
          <div>
            <b>{list.length}</b>
            <span>Tổng sự kiện</span>
          </div>
        </div>
        <div className="stat">
          <Eye />
          <div>
            <b>{list.filter((e) => e.published).length}</b>
            <span>Đã xuất bản</span>
          </div>
        </div>
        <div className="stat">
          <Images />
          <div>
            <b>{list.reduce((a, e) => a + e.recap_count, 0)}</b>
            <span>Ảnh recap</span>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="event-loading-grid">
          {Array.from({ length: 3 }, (_, i) => (
            <div className="event-loading-card" key={i}>
              <div className="skeleton event-block" />
              <div className="skeleton line" />
              <div className="skeleton short" />
            </div>
          ))}
        </div>
      ) : !list.length ? (
        <div className="empty">
          <CalendarDays size={48} />
          <h3>Chưa có sự kiện</h3>
          <p>Tạo hoạt động đầu tiên để đăng poster và ảnh recap.</p>
        </div>
      ) : (
        <div className="event-grid">
          {list.map((e) => (
            <button key={e.id} className="event-card" onClick={() => setSelected(e.id)}>
              <div className="event-cover">
                {e.poster_node_id ? (
                  <img src={imageSrc(e.poster_node_id)} alt={`Poster ${e.title}`} />
                ) : (
                  <div>
                    <Images size={44} />
                    <span>IT CLUB EVENT</span>
                  </div>
                )}
              </div>
              <div className="event-info">
                <div className="event-meta">
                  <span className={e.published ? 'status live' : 'status'}>
                    {e.published ? 'Đã xuất bản' : 'Bản nháp'}
                  </span>
                  <span>{date(e.created_at)}</span>
                </div>
                <h3>{e.title}</h3>
                <p>{e.description || 'Bộ sưu tập ảnh hoạt động của IT Club.'}</p>
                <div className="event-footer">
                  <span>
                    <Images size={16} /> {e.recap_count} ảnh recap
                  </span>
                  <span>Chi tiết →</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {create && (
        <div className="modal-overlay" onClick={() => setCreate(false)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              execute(created);
            }}
          >
            <div className="eyebrow">SỰ KIỆN</div>
            <h2>Thêm sự kiện</h2>
            <p>Ảnh poster và recap sẽ được lưu theo từng sự kiện.</p>
            <label>
              Tên sự kiện
              <input
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Workshop Git & GitHub"
              />
            </label>
            <label>
              Mô tả
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Giới thiệu ngắn về hoạt động"
              />
            </label>
            <div className="actions end">
              <Button soft onClick={() => setCreate(false)}>
                Hủy
              </Button>
              <Button type="submit">Tạo sự kiện</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
function Settings({
  member,
  execute,
}: {
  member: Member;
  execute: (fn: () => Promise<unknown>) => void;
}) {
  const [tg, setTg] = useState<{
    ready: boolean;
    state: { '@type': string; link?: string };
    error?: string;
  } | null>(null);
  const [qr, setQr] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [tokens, setTokens] = useState<
    { id: string; name: string; scope: string; revoked_at: number | null }[]
  >([]);
  const [newToken, setNewToken] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [allowEvents, setAllowEvents] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const admin = member.role === 'admin';
  const refresh = useCallback(async () => {
    if (!admin) return;
    const [status, users, keys] = await Promise.all([
      api<typeof tg>('/api/telegram/status'),
      api<Member[]>('/api/admin/users'),
      api<typeof tokens>('/api/admin/media-tokens'),
    ]);
    setTg(status);
    setMembers(users);
    setTokens(keys);
  }, [admin]);
  useEffect(() => {
    void refresh().catch(() => {});
    if (!admin) return;
    const t = setInterval(() => {
      void api<typeof tg>('/api/telegram/status')
        .then((v) => setTg(v))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [refresh, admin]);
  useEffect(() => {
    const link = tg?.state?.link;
    if (link) {
      QRCode.toDataURL(link, { width: 230, margin: 2 })
        .then(setQr)
        .catch(() => setQr(''));
    } else setQr('');
  }, [tg?.state?.link]);
  const authState = tg?.state?.['@type'] || 'Đang tải...';
  return (
    <>
      <div className="heading">
        <div>
          <div className="eyebrow">CẤU HÌNH & BẢO MẬT</div>
          <h1>Cài đặt hệ thống</h1>
          <p>Thông tin cá nhân, quyền sự kiện và kết nối Telegram.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>
              <LockKeyhole size={19} /> Tài khoản
            </h2>
          </div>
          <p>
            Đang đăng nhập bằng <b>{member.username}</b>
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              execute(async () => {
                await post('/api/auth/password', {
                  old_password: oldPassword,
                  password: nextPassword,
                });
                location.reload();
              });
            }}
          >
            <label>
              Mật khẩu cũ
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
              />
            </label>
            <label>
              Mật khẩu mới
              <input
                type="password"
                minLength={10}
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
                required
              />
            </label>
            <Button type="submit">Đổi mật khẩu</Button>
          </form>
        </section>
        {admin && (
          <section className="panel">
            <div className="panel-head">
              <h2>
                <RefreshCw size={19} /> TDLib / Telegram
              </h2>
              <span className={tg?.ready ? 'status live' : 'status'}>
                {tg?.ready ? 'Đã kết nối' : 'Chưa kết nối'}
              </span>
            </div>
            <p>
              Trạng thái: <code>{authState}</code>
            </p>
            {tg?.error && <div className="alert">{tg.error}</div>}
            {qr && (
              <div className="qr">
                <img src={qr} width="230" height="230" alt="Telegram QR Login" />
                <p>Telegram → Cài đặt → Thiết bị → Liên kết thiết bị</p>
              </div>
            )}
            <Button
              soft
              onClick={() =>
                execute(async () => {
                  await post('/api/telegram/auth', { action: 'qr' });
                  await refresh();
                })
              }
            >
              Tạo QR đăng nhập
            </Button>
            {authState === 'authorizationStateWaitPassword' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = (
                    e.currentTarget.elements.namedItem('tgpassword') as HTMLInputElement
                  ).value;
                  execute(async () => {
                    await post('/api/telegram/auth', { action: 'password', value });
                    await refresh();
                  });
                }}
              >
                <label>
                  Mật khẩu Telegram 2FA
                  <input type="password" name="tgpassword" required />
                </label>
                <Button type="submit">Xác nhận</Button>
              </form>
            )}
            <p className="muted small">
              Thiết lập TELEGRAM_API_ID và TELEGRAM_API_HASH trong .env rồi khởi động lại ứng dụng.
            </p>
          </section>
        )}
        {admin && <AdminStorageSettings />}
        {admin && (
          <section className="panel full">
            <div className="panel-head">
              <h2>
                <Users size={20} /> Quản lý thành viên
              </h2>
              <span>{members.length} tài khoản</span>
            </div>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                execute(async () => {
                  await post('/api/admin/users', {
                    username,
                    password,
                    can_manage_events: allowEvents,
                  });
                  setUsername('');
                  setPassword('');
                  await refresh();
                });
              }}
            >
              <input
                placeholder="Username mới"
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
                placeholder="Mật khẩu (ít nhất 10 ký tự)"
                required
                type="password"
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={allowEvents}
                  onChange={(e) => setAllowEvents(e.target.checked)}
                />{' '}
                Quản lý sự kiện
              </label>
              <Button type="submit">
                <Plus size={17} /> Thêm
              </Button>
            </form>
            <div className="member-list">
              {members.map((u) => (
                <div key={u.id} className="member-row">
                  <span>
                    <strong>{u.username}</strong>
                    <small>{u.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}</small>
                  </span>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={u.role === 'admin' || !!u.can_manage_events}
                      disabled={u.role === 'admin'}
                      onChange={(e) =>
                        execute(async () => {
                          await patch('/api/admin/users', {
                            id: u.id,
                            can_manage_events: e.target.checked,
                            disabled: u.disabled,
                          });
                          await refresh();
                        })
                      }
                    />{' '}
                    Quản lý sự kiện
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!u.disabled}
                      disabled={u.role === 'admin'}
                      onChange={(e) =>
                        execute(async () => {
                          await patch('/api/admin/users', {
                            id: u.id,
                            disabled: e.target.checked,
                            can_manage_events: u.can_manage_events,
                          });
                          await refresh();
                        })
                      }
                    />{' '}
                    Vô hiệu hóa
                  </label>
                </div>
              ))}
            </div>
          </section>
        )}
        {admin && (
          <section className="panel full">
            <div className="panel-head">
              <h2>
                <KeyRound size={20} /> Service phân phối ảnh
              </h2>
              <span>Quyền events:read</span>
            </div>
            <p>
              Tạo token chỉ đọc ảnh của sự kiện đã xuất bản. Secret chỉ hiển thị một lần; service
              khác gửi token qua <code>Authorization: Bearer</code>.
            </p>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                execute(async () => {
                  const result = await post<{ token: string }>('/api/admin/media-tokens', {
                    name: tokenName,
                  });
                  setNewToken(result.token);
                  setTokenName('');
                  await refresh();
                });
              }}
            >
              <input
                required
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="Tên service, ví dụ Website IT Club"
              />
              <Button type="submit">
                <Plus size={17} /> Tạo token
              </Button>
            </form>
            {newToken && (
              <div className="secret">
                <code>{newToken}</code>
                <button onClick={() => navigator.clipboard.writeText(newToken)}>
                  <ClipboardCopy size={18} />
                </button>
              </div>
            )}
            <div className="member-list">
              {tokens.map((k) => (
                <div className="member-row" key={k.id}>
                  <span>
                    <strong>{k.name}</strong>
                    <small>{k.scope}</small>
                  </span>
                  <span className={k.revoked_at ? 'status' : 'status live'}>
                    {k.revoked_at ? 'Đã thu hồi' : 'Đang hoạt động'}
                  </span>
                  {!k.revoked_at && (
                    <button
                      className="icon-btn danger"
                      title="Thu hồi token"
                      onClick={() =>
                        execute(async () => {
                          await del('/api/admin/media-tokens', { id: k.id });
                          await refresh();
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
export default function Home() {
  const [member, setMember] = useState<Member | null | undefined>(undefined);
  const [tab, setTab] = useState<'events' | 'drive' | 'settings'>(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('tab') === 'settings'
      ? 'settings'
      : 'events',
  );
  const [menu, setMenu] = useState(false);
  const { error, execute, setError, pending } = useAlerts();
  useEffect(() => {
    api<{ user: Member | null }>('/api/auth/status')
      .then((r) => setMember(r.user))
      .catch(() => setMember(null));
  }, []);
  if (member === undefined)
    return (
      <div className="loading">
        <LoaderCircle className="spin" size={25} /> Đang mở IT Club Media Cloud...
      </div>
    );
  if (member === null) return <SignIn onReady={setMember} />;
  return (
    <TransferCenter enabled={true}>
      <div className="app-shell">
        <aside className={menu ? 'sidebar show' : 'sidebar'}>
          <div className="brand">
            <img src="/brand/itclub-mark.svg" width="43" height="43" alt="IT Club" />
            <div>
              <strong>
                IT Club <span>Cloud</span>
              </strong>
              <small>MEDIA WORKSPACE</small>
            </div>
          </div>
          <div className="side-section">KHÔNG GIAN LÀM VIỆC</div>
          <nav>
            <button
              className={tab === 'events' ? 'nav active' : 'nav'}
              onClick={() => {
                setTab('events');
                setMenu(false);
              }}
            >
              <CalendarDays size={19} /> Sự kiện & Recap
            </button>
            <button
              className={tab === 'drive' ? 'nav active' : 'nav'}
              onClick={() => {
                setTab('drive');
                setMenu(false);
              }}
            >
              <HardDrive size={19} /> Drive
            </button>
            <button
              className={tab === 'settings' ? 'nav active' : 'nav'}
              onClick={() => {
                setTab('settings');
                setMenu(false);
              }}
            >
              <Settings2 size={19} /> Cài đặt
            </button>
          </nav>
          <div className="side-bottom">
            <button
              className="profile"
              onClick={() =>
                execute(async () => {
                  await post('/api/auth/logout', {});
                  setMember(null);
                })
              }
            >
              <span className="avatar">{member.username.slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{member.username}</strong>
                <small>{member.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}</small>
              </span>
              <LogOut size={17} />
            </button>
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <button className="mobile-menu" onClick={() => setMenu(!menu)}>
              <Menu size={21} />
            </button>
            <span>
              IT CLUB <b>/</b> MEDIA CLOUD
            </span>
            <div className="grow" />
          </header>
          <div className="content" key={tab}>
            {pending > 0 && (
              <div className="global-action-progress" role="status">
                <LoaderCircle className="spin" size={15} /> Đang xử lý...
              </div>
            )}
            {error && (
              <div className="alert dismiss">
                {error}
                <button onClick={() => setError('')}>×</button>
              </div>
            )}
            {tab === 'events' && <Events member={member} execute={execute} />}
            {tab === 'drive' && <Drive execute={execute} />}
            {tab === 'settings' && <Settings member={member} execute={execute} />}
          </div>
        </main>
      </div>
    </TransferCenter>
  );
}

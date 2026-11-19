'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  CloudUpload,
  HardDrive,
  Plus,
  Trash2,
  RefreshCw,
  Save,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/client';

type Bot = { name: string; chatId: string; token?: string };
type BotStatus = { name: string; chatId: string; username?: string; ok: boolean; error?: string };
type Bots = { bots: Bot[]; concurrency: number; mode: 'auto' | 'tdlib'; status: BotStatus[] };
type Backup = {
  enabled: boolean;
  connected: boolean;
  hasClientSecret: boolean;
  clientId: string;
  intervalHours: number;
  retention: number;
  includeFiles: boolean;
  folderName: string;
  folderId: string;
  status: {
    running?: boolean;
    configured?: boolean;
    lastSuccess?: string;
    error?: string;
    filesDone?: number;
    filesTotal?: number;
    uploadedBytes?: number;
    archiveBytes?: number;
  };
};
const human = (num: number) =>
  num > 1048576 ? `${(num / 1048576).toFixed(1)} MB` : `${Math.round(num / 1024)} KB`;
function Spinner() {
  return <LoaderCircle className="spin" size={16} />;
}
export function AdminStorageSettings() {
  const [bots, setBots] = useState<Bots>({ bots: [], concurrency: 2, mode: 'auto', status: [] });
  const [backup, setBackup] = useState<Backup | null>(null);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const [b, d] = await Promise.all([
      api<Bots>('/api/admin/bots'),
      api<Backup>('/api/admin/backup'),
    ]);
    setBots((v) => ({
      ...b,
      bots: b.bots.map((x) => ({
        ...x,
        token: v.bots.find((z) => z.name === x.name)?.token || '',
      })),
    }));
    setBackup(d);
  }, []);
  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const state = new URLSearchParams(window.location.search).get('oauth');
    if (state === 'connected') setMessage('Đã kết nối Google Drive.');
    if (state === 'cancelled') setError('Bạn đã hủy kết nối Google.');
    if (state) window.history.replaceState({}, '', window.location.pathname + '?tab=settings');
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      void api<Backup>('/api/admin/backup')
        .then(setBackup)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label);
    setError('');
    setMessage('');
    try {
      await job();
      setMessage(label === 'backup' ? 'Đã gửi yêu cầu sao lưu' : 'Đã lưu thành công');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể thực hiện');
    } finally {
      setBusy('');
    }
  };
  const editBot = (index: number, field: keyof Bot, value: string) =>
    setBots((old) => ({
      ...old,
      bots: old.bots.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    }));
  const saveBots = () =>
    void run('bots', async () => {
      const result = await api<Bots>('/api/admin/bots', {
        method: 'PUT',
        body: JSON.stringify(bots),
      });
      setBots({ ...result, bots: result.bots.map((b) => ({ ...b, token: '' })) });
    });
  const saveBackup = () =>
    void run('drive', async () => {
      if (!backup) return;
      const result = await api<Backup>('/api/admin/backup', {
        method: 'PUT',
        body: JSON.stringify({
          clientId: backup.clientId,
          clientSecret: secret || undefined,
          intervalHours: Number(backup.intervalHours),
          retention: Number(backup.retention),
          includeFiles: backup.includeFiles,
          folderId: backup.folderId,
          folderName: backup.folderName,
        }),
      });
      setBackup(result);
      setSecret('');
    });
  const checkBots = () =>
    void run('bot-test', async () => {
      const result = await api<Bots>('/api/admin/bots?check=1');
      setBots((old) => ({ ...old, status: result.status }));
      setMessage('Đã kiểm tra kết nối bot');
    });
  const checkDrive = () =>
    void run('drive-test', async () => {
      const value = await api<{ ok: boolean; message?: string }>('/api/admin/google/test');
      if (!value.ok) throw new Error(value.message || 'Không thể truy cập Drive');
      setMessage('Đã kết nối Google Drive thành công');
    });
  return (
    <>
      <section className="panel full">
        <div className="panel-head">
          <h2>
            <CloudUpload size={19} /> Telegram Bot
          </h2>
          <span className="status">{bots.bots.length} bot đã lưu</span>
        </div>
        <p>Quản lý các bot và kiểm tra kết nối lưu trữ.</p>
        <div className="bot-editor-list">
          {bots.bots.map((bot, index) => (
            <div key={index} className="bot-editor-row">
              <label>
                Tên bot
                <input
                  placeholder="bot01"
                  value={bot.name}
                  onChange={(e) => editBot(index, 'name', e.target.value)}
                />
              </label>
              <label>
                Chat ID nhóm
                <input
                  placeholder="-1001234567890"
                  value={bot.chatId}
                  onChange={(e) => editBot(index, 'chatId', e.target.value)}
                />
              </label>
              <label>
                Bot token
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Để trống nếu giữ token cũ"
                  value={bot.token || ''}
                  onChange={(e) => editBot(index, 'token', e.target.value)}
                />
              </label>
              <button
                className="icon-btn danger"
                title="Xóa bot"
                aria-label={`Xóa ${bot.name}`}
                onClick={() =>
                  setBots((x) => ({ ...x, bots: x.bots.filter((_, i) => i !== index) }))
                }
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="btn btn-soft"
          onClick={() =>
            setBots((x) => ({ ...x, bots: [...x.bots, { name: '', chatId: '', token: '' }] }))
          }
        >
          <Plus size={17} /> Thêm bot
        </button>
        <div className="settings-options">
          <label>
            Số luồng tải lên
            <select
              value={bots.concurrency}
              onChange={(e) => setBots((x) => ({ ...x, concurrency: Number(e.target.value) }))}
            >
              {[1, 2, 3, 4, 5].map((x) => (
                <option key={x} value={x}>
                  {x} luồng
                </option>
              ))}
            </select>
          </label>
          <label>
            Chế độ lưu
            <select
              value={bots.mode}
              onChange={(e) => setBots((x) => ({ ...x, mode: e.target.value as Bots['mode'] }))}
            >
              <option value="auto">Tự động (ưu tiên bot)</option>
              <option value="tdlib">Chỉ TDLib</option>
            </select>
          </label>
        </div>
        <div className="actions">
          <button className="btn btn-primary" disabled={!!busy} onClick={saveBots}>
            {busy === 'bots' ? <Spinner /> : <Save size={17} />} Lưu cấu hình
          </button>
          <button className="btn btn-soft" disabled={!!busy} onClick={checkBots}>
            {busy === 'bot-test' ? <Spinner /> : <RefreshCw size={17} />} Kiểm tra kết nối
          </button>
        </div>
        {bots.status.length > 0 && (
          <div className="member-list">
            {bots.status.map((status) => (
              <div className="member-row" key={status.name}>
                <span>
                  <strong>{status.name}</strong>
                  <small>
                    {status.username ? `@${status.username} · ` : ''}Nhóm {status.chatId}
                  </small>
                </span>
                <span className={status.ok ? 'status live' : 'status'}>
                  {status.ok ? 'Đã kết nối' : 'Lỗi'}
                </span>
                {status.error && <small className="error-text">{status.error}</small>}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel full">
        <div className="panel-head">
          <h2>
            <HardDrive size={19} /> Sao lưu Google Drive
          </h2>
          <span className={backup?.connected ? 'status live' : 'status'}>
            {backup?.connected ? 'Đã liên kết' : 'Chưa liên kết'}
          </span>
        </div>
        <p>Sao lưu dữ liệu và tài khoản an toàn trên Google Drive.</p>
        {!backup ? (
          <div className="preview-loader">
            <Spinner /> Đang đọc cài đặt...
          </div>
        ) : (
          <>
            <div className="settings-options">
              <label>
                Google OAuth Client ID
                <input
                  value={backup.clientId}
                  onChange={(e) => setBackup({ ...backup, clientId: e.target.value })}
                  placeholder="...apps.googleusercontent.com"
                />
              </label>
              <label>
                Client Secret
                <input
                  type="password"
                  autoComplete="new-password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={
                    backup.hasClientSecret
                      ? 'Đã lưu. Để trống nếu không thay đổi'
                      : 'Nhập Client Secret'
                  }
                />
              </label>
              <label>
                Chu kỳ sao lưu (giờ)
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="168"
                  value={backup.intervalHours}
                  onChange={(e) => setBackup({ ...backup, intervalHours: Number(e.target.value) })}
                />
              </label>
              <label>
                Số bản lưu
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={backup.retention}
                  onChange={(e) => setBackup({ ...backup, retention: Number(e.target.value) })}
                />
              </label>
              <label>
                Tên thư mục trên Drive
                <input
                  value={backup.folderName}
                  onChange={(e) => setBackup({ ...backup, folderName: e.target.value })}
                />
              </label>
              <label>
                Mã thư mục (không bắt buộc)
                <input
                  value={backup.folderId}
                  onChange={(e) => setBackup({ ...backup, folderId: e.target.value })}
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={backup.includeFiles}
                onChange={(e) => setBackup({ ...backup, includeFiles: e.target.checked })}
              />{' '}
              Bao gồm file gốc trong bản sao lưu
            </label>
            <div className="actions storage-buttons">
              <button className="btn btn-primary" disabled={!!busy} onClick={saveBackup}>
                {busy === 'drive' ? <Spinner /> : <Save size={16} />} Lưu cài đặt
              </button>
              <button
                className="btn btn-soft"
                disabled={!!busy || !backup.clientId || !backup.hasClientSecret}
                onClick={() => window.location.assign('/api/admin/google/connect')}
              >
                <ExternalLink size={16} /> Kết nối Google
              </button>
              <button
                className="btn btn-soft"
                disabled={!!busy || !backup.connected}
                onClick={checkDrive}
              >
                {busy === 'drive-test' ? <Spinner /> : <RefreshCw size={16} />} Kiểm tra Drive
              </button>
              <button
                className="btn btn-soft"
                disabled={!!busy || !backup.enabled}
                onClick={() =>
                  void run('backup', async () => {
                    await api('/api/admin/backup', { method: 'POST', body: '{}' });
                    setMessage('Đã gửi yêu cầu sao lưu');
                  })
                }
              >
                {busy === 'backup' ? <Spinner /> : <CloudUpload size={16} />} Sao lưu ngay
              </button>
              {backup.connected && (
                <button
                  className="btn btn-soft"
                  disabled={!!busy}
                  onClick={() => {
                    if (!confirm('Ngắt Google Drive? Các bản backup trên Drive không bị xóa.'))
                      return;
                    void run('disconnect', async () => {
                      setBackup(await api('/api/admin/backup', { method: 'DELETE' }));
                    });
                  }}
                >
                  Ngắt liên kết
                </button>
              )}
            </div>
            {backup.status?.running && (
              <div className="backup-progress">
                <div className="transfer-stage">
                  Đang sao lưu {backup.status.filesDone || 0}/{backup.status.filesTotal || 0} tệp{' '}
                  <span>{human(backup.status.uploadedBytes || 0)} đã gửi</span>
                </div>
                <div className="transfer-meter">
                  <i className="indeterminate" />
                </div>
              </div>
            )}
            {backup.status?.lastSuccess && (
              <p>
                Thành công gần nhất:{' '}
                <b>{new Date(backup.status.lastSuccess).toLocaleString('vi-VN')}</b>
              </p>
            )}
            {backup.status?.error && <div className="alert">{backup.status.error}</div>}
            <p className="muted small">
              Khóa giải mã backup nằm trong <code>data/backup-secret.key</code>. Hãy sao lưu file
              này ở nơi an toàn, riêng biệt với Google Drive.
            </p>
          </>
        )}
      </section>
      {(error || message) && (
        <div
          className={error ? 'alert storage-feedback' : 'storage-success storage-feedback'}
          role="status"
        >
          {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />} {error || message}
        </div>
      )}
    </>
  );
}

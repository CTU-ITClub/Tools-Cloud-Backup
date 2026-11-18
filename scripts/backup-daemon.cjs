'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { readPrivate } = require('./private-settings.cjs');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const DATA = path.resolve(process.env.DATA_DIR || './data');
const STATUS = path.join(DATA, 'backup-status.json');
const REQUEST = path.join(DATA, 'backup-request.json');
const PREFIX = 'itclub-media-';
const MAGIC = Buffer.from('ITCLUBBK1');

function status(value) {
  let previous = {};
  try {
    previous = JSON.parse(fs.readFileSync(STATUS, 'utf8'));
  } catch {}
  const temp = STATUS + '.tmp';
  fs.writeFileSync(temp, JSON.stringify({ ...previous, ...value }, null, 2), { mode: 0o600 });
  fs.renameSync(temp, STATUS);
}
function required(name) {
  const fallback =
    name === 'BACKUP_INTERNAL_TOKEN'
      ? 'backup-internal.key'
      : name === 'BACKUP_ENCRYPTION_KEY'
        ? 'backup-secret.key'
        : '';
  const local =
    fallback && fs.existsSync(path.join(DATA, fallback))
      ? fs.readFileSync(path.join(DATA, fallback), 'utf8').trim()
      : '';
  const value = local || process.env[name];
  if (!value) throw new Error(`Thiếu ${name}`);
  return value;
}
function backupKey() {
  const value = Buffer.from(required('BACKUP_ENCRYPTION_KEY'), 'base64');
  if (value.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY phải là 32 bytes Base64');
  return value;
}
function dbPath() {
  const dbNew = path.join(DATA, 'itclub-cloud.db');
  const dbOld = path.join(DATA, 'telecloud.db');
  if (fs.existsSync(dbOld) && fs.existsSync(dbNew)) throw new Error('Hai database cùng tồn tại');
  return fs.existsSync(dbOld) ? dbOld : dbNew;
}
async function token() {
  const payload = new URLSearchParams({
    client_id: required('GOOGLE_DRIVE_CLIENT_ID'),
    client_secret: required('GOOGLE_DRIVE_CLIENT_SECRET'),
    refresh_token: required('GOOGLE_DRIVE_REFRESH_TOKEN'),
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token)
    throw new Error(`Google OAuth: ${result.error_description || result.error || response.status}`);
  return result.access_token;
}
async function googleAPI(url, access, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${access}`, ...options.headers },
    signal: options.signal || AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Drive HTTP ${response.status}: ${text.slice(0, 350)}`);
  return text ? JSON.parse(text) : {};
}
async function ensureFolder(access) {
  if (process.env.GOOGLE_DRIVE_FOLDER_ID) return process.env.GOOGLE_DRIVE_FOLDER_ID;
  const saved = path.join(DATA, 'backup-google-folder.json');
  try {
    const old = JSON.parse(fs.readFileSync(saved, 'utf8'));
    if (old.id && old.name === (process.env.GOOGLE_DRIVE_BACKUP_FOLDER || 'ITClub Media Backups')) {
      await googleAPI(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(old.id)}?fields=id`,
        access,
      );
      return old.id;
    }
  } catch {}
  const info = await googleAPI('https://www.googleapis.com/drive/v3/files?fields=id,name', access, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: process.env.GOOGLE_DRIVE_BACKUP_FOLDER || 'ITClub Media Backups',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!info.id) throw new Error('Không tạo được thư mục Google Drive');
  fs.writeFileSync(
    saved,
    JSON.stringify({
      id: info.id,
      name: process.env.GOOGLE_DRIVE_BACKUP_FOLDER || 'ITClub Media Backups',
    }),
    { mode: 0o600 },
  );
  return info.id;
}
async function sendToDrive(file, filename, access, folder) {
  const size = (await fsp.stat(file)).size;
  const metadata = {
    name: filename,
    parents: [folder],
    mimeType: 'application/octet-stream',
    description: 'ITClub encrypted backup',
  };
  const start = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'application/octet-stream',
        'X-Upload-Content-Length': String(size),
      },
      body: JSON.stringify(metadata),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!start.ok)
    throw new Error(
      `Không thể tạo phiên upload Drive: ${start.status} ${(await start.text()).slice(0, 200)}`,
    );
  const uploadUrl = start.headers.get('location');
  if (!uploadUrl || !uploadUrl.startsWith('https://www.googleapis.com/'))
    throw new Error('Google Drive không cung cấp upload URL hợp lệ');
  const fd = await fsp.open(file, 'r');
  try {
    let offset = 0;
    while (offset < size) {
      const end = Math.min(offset + 8 * 1024 * 1024, size);
      const buffer = Buffer.alloc(end - offset);
      for (let filled = 0; filled < buffer.length;) {
        const { bytesRead } = await fd.read(
          buffer,
          filled,
          buffer.length - filled,
          offset + filled,
        );
        if (!bytesRead) throw new Error('Không đọc đủ file backup');
        filled += bytesRead;
      }
      let attempts = 0;
      while (true) {
        try {
          const res = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Length': String(buffer.length),
              'Content-Range': `bytes ${offset}-${end - 1}/${size}`,
            },
            body: buffer,
            signal: AbortSignal.timeout(120_000),
          });
          if (res.ok) {
            offset = end;
            break;
          }
          if (res.status === 308) {
            const range = /bytes=0-(\d+)/.exec(res.headers.get('range') || '');
            if (!range || Number(range[1]) + 1 !== end)
              throw new Error('Google Drive xác nhận chunk không đầy đủ');
            offset = end;
            break;
          }
          if (![429, 500, 502, 503, 504].includes(res.status))
            throw new Error(`Drive upload ${res.status}: ${(await res.text()).slice(0, 150)}`);
        } catch (err) {
          if (attempts >= 5) throw err;
        }
        if (++attempts > 5) throw new Error('Google Drive upload thất bại sau khi thử lại');
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.min(16, 2 ** attempts)));
        const check = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Length': '0', 'Content-Range': `bytes */${size}` },
          signal: AbortSignal.timeout(30_000),
        });
        if (check.ok) {
          offset = size;
          break;
        }
        if (check.status !== 308) throw new Error(`Drive resume lỗi ${check.status}`);
        const match = /bytes=0-(\d+)/.exec(check.headers.get('range') || '');
        const remote = match ? Number(match[1]) + 1 : 0;
        if (remote >= end) {
          offset = remote;
          break;
        }
        if (remote !== offset)
          throw new Error('Google Drive tiếp nhận một phần chunk; hãy chạy lại backup');
      }
      status({ uploadedBytes: offset, archiveBytes: size });
    }
  } finally {
    await fd.close();
  }
  return size;
}
async function cleanup(access, folder) {
  const configured = Number(process.env.BACKUP_RETENTION || 7);
  const keep = Number.isSafeInteger(configured) && configured >= 1 ? Math.min(50, configured) : 7;
  const search = new URL('https://www.googleapis.com/drive/v3/files');
  search.searchParams.set('q', `'${folder.replaceAll("'", "\\'")}' in parents and trashed = false`);
  search.searchParams.set('fields', 'nextPageToken,files(id,name,createdTime)');
  search.searchParams.set('pageSize', '1000');
  const result = await googleAPI(search.toString(), access);
  const old = (result.files || [])
    .filter((f) => f.name?.startsWith(PREFIX) && f.name.endsWith('.itcbak'))
    .sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));
  for (const file of old.slice(keep)) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${access}` },
      signal: AbortSignal.timeout(30_000),
    });
  }
}
async function downloadMedia(id, dest, expected) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('ID ảnh không hợp lệ');
  const endpoint = (process.env.BACKUP_APP_URL || 'http://media-cloud:3000').replace(/\/$/, '');
  const response = await fetch(`${endpoint}/api/internal/backup/files/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${required('BACKUP_INTERNAL_TOKEN')}` },
    signal: AbortSignal.timeout(900_000),
  });
  if (!response.ok || !response.body) throw new Error(`Đọc ảnh ${id} lỗi: HTTP ${response.status}`);
  const hash = crypto.createHash('sha256');
  let received = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body),
    meter,
    fs.createWriteStream(dest, { flags: 'wx', mode: 0o600 }),
  );
  if (received !== expected)
    throw new Error(`Ảnh ${id} không đủ dữ liệu (${received}/${expected})`);
  return hash.digest('hex');
}
async function archive(source, destination, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const out = fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 });
  out.write(Buffer.concat([MAGIC, iv]));
  const encrypt = new Transform({
    transform(chunk, _enc, cb) {
      try {
        cb(null, cipher.update(chunk));
      } catch (err) {
        cb(err);
      }
    },
    flush(cb) {
      try {
        this.push(cipher.final());
        this.push(cipher.getAuthTag());
        cb();
      } catch (err) {
        cb(err);
      }
    },
  });
  const process = spawn('tar', ['-czf', '-', '-C', source, '.'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  process.stderr.on('data', (chunk) => {
    errors += chunk.toString().slice(0, 300);
  });
  const completed = new Promise((resolve, reject) => {
    process.once('error', reject);
    process.once('exit', resolve);
  });
  await pipeline(process.stdout, encrypt, out);
  const code = await completed;
  if (code !== 0) throw new Error(`tar kết thúc với mã ${code}: ${errors.slice(0, 180)}`);
}
let active = false;
async function runBackup() {
  if (active) return;
  active = true;
  const tmp = await fsp.mkdtemp(path.join(DATA, 'backup-work-'));
  try {
    const key = backupKey();
    const access = await token();
    const folder = await ensureFolder(access);
    status({
      running: true,
      startedAt: new Date().toISOString(),
      error: null,
      uploadedBytes: 0,
      archiveBytes: 0,
    });
    const stage = path.join(tmp, 'snapshot');
    await fsp.mkdir(path.join(stage, 'media'), { recursive: true });
    const Database = require('better-sqlite3');
    const database = new Database(dbPath(), { readonly: true, fileMustExist: true });
    const destination = path.join(stage, 'database.sqlite');
    try {
      await database.backup(destination);
    } finally {
      database.close();
    }
    if (fs.existsSync(path.join(DATA, 'master.key')))
      await fsp.copyFile(path.join(DATA, 'master.key'), path.join(stage, 'master.key'));
    const snapshot = new Database(destination, { readonly: true, fileMustExist: true });
    let nodes = [];
    try {
      nodes = snapshot
        .prepare(
          "SELECT id,name,size,mime,etag FROM nodes WHERE kind='file' AND deleted_at IS NULL ORDER BY id",
        )
        .all();
    } finally {
      snapshot.close();
    }
    const included = [];
    if (process.env.BACKUP_INCLUDE_FILES !== 'false') {
      let count = 0;
      for (const node of nodes) {
        const sha256 = await downloadMedia(node.id, path.join(stage, 'media', node.id), node.size);
        included.push({ ...node, sha256 });
        status({ filesDone: ++count, filesTotal: nodes.length });
      }
    }
    await fsp.writeFile(
      path.join(stage, 'manifest.json'),
      JSON.stringify(
        {
          version: 1,
          createdAt: new Date().toISOString(),
          dbFile: 'database.sqlite',
          filesIncluded: process.env.BACKUP_INCLUDE_FILES !== 'false',
          files: included,
        },
        null,
        2,
      ),
    );
    const filename = `${PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}.itcbak`;
    const output = path.join(tmp, filename);
    await archive(stage, output, key);
    const size = await sendToDrive(output, filename, access, folder);
    status({
      running: false,
      lastSuccess: new Date().toISOString(),
      error: null,
      lastFile: filename,
      archiveBytes: size,
      filesDone: included.length,
      filesTotal: nodes.length,
    });
    await cleanup(access, folder).catch((err) => console.error('[backup] retention:', err.message));
    console.log('[backup] completed', filename);
  } catch (error) {
    status({
      running: false,
      lastErrorAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('[backup] error:', error instanceof Error ? error.message : error);
    if (process.argv.includes('--once')) process.exitCode = 1;
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
    active = false;
  }
}
async function main() {
  await fsp.mkdir(DATA, { recursive: true });
  status({ running: false });
  const tick = async () => {
    if (active) return;
    const stored = readPrivate('media:drive-backup:v1');
    if (stored) {
      const fields = {
        GOOGLE_DRIVE_CLIENT_ID: stored.clientId,
        GOOGLE_DRIVE_CLIENT_SECRET: stored.clientSecret,
        GOOGLE_DRIVE_REFRESH_TOKEN: stored.refreshToken,
        GOOGLE_DRIVE_FOLDER_ID: stored.folderId,
        GOOGLE_DRIVE_BACKUP_FOLDER: stored.folderName,
        BACKUP_INTERVAL_HOURS: String(stored.intervalHours),
        BACKUP_RETENTION: String(stored.retention),
        BACKUP_INCLUDE_FILES: String(stored.includeFiles),
      };
      for (const [key, value] of Object.entries(fields)) process.env[key] = value || '';
    }
    const intervalHours = Number(process.env.BACKUP_INTERVAL_HOURS || 6);
    if (!Number.isFinite(intervalHours) || intervalHours <= 0) return;
    if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
      status({ running: false, configured: false, intervalHours });
      return;
    }
    status({ configured: true, intervalHours });
    const manual = fs.existsSync(REQUEST);
    let last, lastErrorAt;
    try {
      const state = JSON.parse(fs.readFileSync(STATUS, 'utf8'));
      last = state.lastSuccess;
      lastErrorAt = state.lastErrorAt;
    } catch {}
    const due = !last || Date.now() - Date.parse(last) >= intervalHours * 3600_000;
    if (!manual && lastErrorAt && Date.now() - Date.parse(lastErrorAt) < 15 * 60_000 && due) return;
    if (manual) {
      await fsp.rm(REQUEST, { force: true });
    }
    if (manual || due) await runBackup();
  };
  await tick();
  if (process.argv.includes('--once')) return;
  setInterval(() => {
    void tick().catch((err) => console.error('[backup] scheduler', err));
  }, 60_000);
}
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
module.exports = { backupKey, dbPath, archive };

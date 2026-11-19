import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  openSync,
  closeSync,
  readSync,
  promises as fs,
} from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { db, id, now, sqlNode, validName, eventForNode } from './db';
import { dataDir, maxFileBytes } from './config';
import { telegram } from './telegram';
import { bots, uploadWithBots, botPartStream, deleteBotPart, type BotPart } from './bots';
import { BOTS_KEY, readPrivate, type BotSettings } from './private-settings';
import { startTransfer, updateTransfer, failTransfer } from './transfers';
import type { Node, User } from './model';

const images = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
export function isImage(mime: string) {
  return images.has(mime);
}

export async function storeFile(
  req: Request,
  owner: string,
  parentId: string | null,
  filename: string,
  mime: string,
  replaceId?: string,
  uploaderId?: string,
  optimizeImage = false,
): Promise<Node> {
  const name = validName(filename);
  if (parentId) {
    const parent = sqlNode(parentId);
    if (!parent || parent.owner !== owner || parent.kind !== 'folder')
      throw new Error('Thư mục không tồn tại');
  }
  if (mime.length > 128) throw new Error('MIME không hợp lệ');
  const existing = replaceId ? sqlNode(replaceId) : undefined;
  if (replaceId && (!existing || existing.owner !== owner || existing.kind !== 'file'))
    throw new Error('File thay thế không hợp lệ');
  const expected = Number(req.headers.get('content-length') || 0);
  if (!Number.isSafeInteger(expected) || expected < 0 || expected > maxFileBytes)
    throw new Error('Dung lượng tệp không hợp lệ');
  const transferId = startTransfer(
    uploaderId || owner,
    name,
    expected,
    req.headers.get('x-transfer-id') || undefined,
  );
  const tempDir = path.join(dataDir, 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  const temp = path.join(tempDir, `${id()}.upload`);
  let written = 0;
  const hash = createHash('sha256');
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      written += chunk.length;
      updateTransfer(transferId, 'receiving', written);
      if (written > maxFileBytes) {
        callback(new Error(`File vượt giới hạn ${maxFileBytes / 1048576} MiB`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  if (!req.body) throw new Error('Không có dữ liệu upload');
  try {
    await pipeline(
      Readable.fromWeb(req.body as never),
      limiter,
      createWriteStream(temp, { flags: 'wx', mode: 0o600 }),
    );
    if (written === 0) throw new Error('Không thể upload file rỗng');
    if (isImage(mime)) assertImageSignature(temp, mime);
    const user = db().prepare('SELECT quota_bytes FROM users WHERE id=?').get(owner) as {
      quota_bytes: number;
    };
    const used = db()
      .prepare(
        "SELECT COALESCE(SUM(size),0) AS total FROM nodes WHERE owner=? AND kind='file' AND deleted_at IS NULL",
      )
      .get(owner) as { total: number };
    if (user.quota_bytes > 0 && used.total + written - (existing?.size || 0) > user.quota_bytes)
      throw new Error('Vượt quota');
    const useBots =
      bots().length > 0 &&
      (readPrivate<BotSettings>(BOTS_KEY)?.mode || process.env.TELEGRAM_UPLOAD_MODE) !== 'tdlib';
    if (!useBots && !telegram().ready()) throw new Error('Chưa kết nối dịch vụ lưu trữ Telegram');
    updateTransfer(transferId, 'telegram', 0);
    let entries: {
      chatId: number;
      messageId: number;
      account: string;
      size: number;
      fileId?: string;
    }[];
    if (useBots)
      entries = await uploadWithBots(temp, name, written, (count) =>
        updateTransfer(transferId, 'telegram', count),
      );
    else {
      const sent = await telegram().sendDocument(temp, name, (count) =>
        updateTransfer(transferId, 'telegram', count),
      );
      entries = [{ ...sent, account: 'main', size: written }];
    }
    try {
      const value = db().transaction(() => {
        const current = db().prepare('SELECT quota_bytes FROM users WHERE id=?').get(owner) as { quota_bytes: number };
        const nowUsed = db().prepare(
          "SELECT COALESCE(SUM(size),0) AS total FROM nodes WHERE owner=? AND kind='file' AND deleted_at IS NULL",
        ).get(owner) as { total: number };
        if (current.quota_bytes > 0 && nowUsed.total + written - (existing?.size || 0) > current.quota_bytes)
          throw new Error('Đã hết dung lượng lưu trữ');
        const key = replaceId || id();
        const t = now();
        const finalName = replaceId ? name : availableFilename(owner, parentId, name);
        if (replaceId) {
          db()
            .prepare('UPDATE nodes SET name=?,size=?,mime=?,etag=?,updated_at=? WHERE id=?')
            .run(name, written, mime, hash.digest('hex'), t, key);
          db().prepare('DELETE FROM parts WHERE node_id=?').run(key);
        } else {
          db()
            .prepare(
              "INSERT INTO nodes(id,owner,parent_id,name,kind,size,mime,etag,created_at,updated_at) VALUES(?,?,?,?,'file',?,?,?,?,?)",
            )
            .run(key, owner, parentId, finalName, written, mime, hash.digest('hex'), t, t);
        }
        const partStmt = db().prepare(
          'INSERT INTO parts(node_id,part_index,chat_id,message_id,account,size) VALUES(?,?,?,?,?,?)',
        );
        const botStmt = db().prepare(
          'INSERT OR REPLACE INTO bot_files(account,chat_id,message_id,file_id) VALUES(?,?,?,?)',
        );
        entries.forEach((part, index) => {
          partStmt.run(key, index, part.chatId, part.messageId, part.account, part.size);
          if (part.fileId) botStmt.run(part.account, part.chatId, part.messageId, part.fileId);
        });
        return sqlNode(key)!;
      })();
      if (optimizeImage && isImage(mime)) {
        try {
          const { generateImageVariants, deleteImageVariants } = await import('./media-variants');
          if (replaceId) await deleteImageVariants(value.id);
          await generateImageVariants(temp, value.id);
        } catch (error) {
          console.error('Không tạo được ảnh thu nhỏ:', error);
        }
      }
      updateTransfer(transferId, 'done', written);
      return value;
    } catch (e) {
      await Promise.allSettled(
        entries.map((part) =>
          part.account.startsWith('bot:')
            ? deleteBotPart(part as BotPart)
            : telegram().deleteMessage(part.chatId, part.messageId),
        ),
      );
      throw e;
    }
  } catch (e) {
    failTransfer(transferId, e);
    throw e;
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

export async function downloadNode(node: Node, download = false): Promise<Response> {
  if (node.kind !== 'file') throw new Error('Đây không phải file');
  const parts = db()
    .prepare(
      'SELECT chat_id,message_id,account,size FROM parts WHERE node_id=? ORDER BY part_index',
    )
    .all(node.id) as { chat_id: number; message_id: number; account: string; size: number }[];
  if (!parts.length) throw new Error('File chưa có dữ liệu Telegram');
  const stream = Readable.from(
    (async function* () {
      for (const part of parts) {
        if (part.account.startsWith('bot:')) {
          const source = await botPartStream(part.account, part.chat_id, part.message_id);
          let received = 0;
          for await (const chunk of source) {
            received += (chunk as Buffer).length;
            if (received > part.size) throw new Error('Dung lượng Telegram vượt dự kiến');
            yield chunk;
          }
          if (received !== part.size) throw new Error('Tệp Telegram không đủ dữ liệu');
        } else {
          if (part.account !== 'main')
            throw new Error(`Tài khoản Telegram ${part.account} chưa được cấu hình`);
          const localPath = await telegram().localPath(part.chat_id, part.message_id);
          const source = createReadStream(localPath, { start: 0, end: part.size - 1 });
          for await (const chunk of source) yield chunk;
        }
      }
    })(),
  );
  const filename = encodeURIComponent(node.name);
  const headers = new Headers({
    'Content-Type': node.mime,
    'Content-Length': String(node.size),
    'Content-Disposition': `${download || !(isImage(node.mime) || node.mime === 'application/pdf' || node.mime.startsWith('video/') || node.mime.startsWith('audio/')) ? 'attachment' : 'inline'}; filename*=UTF-8''${filename}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (!(
    isImage(node.mime) ||
    node.mime === 'application/pdf' ||
    node.mime.startsWith('video/') ||
    node.mime.startsWith('audio/')
  ))
    headers.set('Content-Security-Policy', "sandbox; default-src 'none'");
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, { headers });
}
export function canViewNode(node: Node, user: User) {
  const event = eventForNode(node.id);
  if (user.role === 'admin') return true;
  if (event) {
    if (user.can_manage_events === 1) return true;
    // Recap photos are managed by the event team. Only the media service
    // (with its own read token) can distribute published recap photos publicly.
    if (node.parent_id === event.recap_folder_id) return false;
    return event.published === 1 || event.owner === user.id;
  }
  return node.owner === user.id;
}
export function requireOwnFolder(id: string | null, user: User) {
  if (!id) return;
  const node = sqlNode(id);
  if (!node || node.owner !== user.id || node.kind !== 'folder')
    throw new Error('Thư mục không hợp lệ');
}
export function protectedEventNode(nodeId: string) {
  return !!eventForNode(nodeId);
}

// Checks magic bytes rather than trusting the client-controlled Content-Type header.
function assertImageSignature(file: string, mime: string) {
  const fd = openSync(file, 'r');
  const signature = Buffer.alloc(16);
  try {
    readSync(fd, signature, 0, signature.length, 0);
  } finally {
    closeSync(fd);
  }
  const ok =
    (mime === 'image/jpeg' && signature.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) ||
    (mime === 'image/png' &&
      signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mime === 'image/gif' && ['GIF87a', 'GIF89a'].includes(signature.toString('ascii', 0, 6))) ||
    (mime === 'image/webp' &&
      signature.toString('ascii', 0, 4) === 'RIFF' &&
      signature.toString('ascii', 8, 12) === 'WEBP') ||
    (mime === 'image/avif' &&
      signature.toString('ascii', 4, 8) === 'ftyp' &&
      signature.toString('ascii', 8, 12).includes('avif'));
  if (!ok) throw new Error('Nội dung file không khớp định dạng ảnh');
}

// Choose a Drive-style nonconflicting name within the same SQLite transaction.
function availableFilename(owner: string, parentId: string | null, requested: string) {
  const check = db().prepare(
    'SELECT 1 FROM nodes WHERE owner=? AND parent_id IS ? AND name=? AND deleted_at IS NULL',
  );
  if (!check.get(owner, parentId, requested)) return requested;
  const match = /^(.*?)(\.[^.]+)?$/.exec(requested)!;
  const base = match[1];
  const ext = match[2] || '';
  for (let i = 1; i <= 10000; i++) {
    const suffix = ` (${i})`;
    const allowed = 240 - Buffer.byteLength(suffix) - Buffer.byteLength(ext);
    let stem = base;
    while (Buffer.byteLength(stem) > allowed) stem = stem.slice(0, -1);
    const filename = stem + suffix + ext;
    if (!check.get(owner, parentId, filename)) return filename;
  }
  throw new Error('Thư mục có quá nhiều file trùng tên');
}

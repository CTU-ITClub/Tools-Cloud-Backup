'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { dbPath } = require('./backup-daemon.cjs');
const { readPrivate } = require('./private-settings.cjs');
const CHUNK = 16 * 1024 * 1024;

function configuredBots() {
  let data;
  try {
    data =
      readPrivate('media:telegram-bots:v1')?.bots ??
      JSON.parse(process.env.TELEGRAM_BOTS_JSON || '[]');
  } catch {
    throw new Error('Không đọc được cấu hình Telegram Bot');
  }
  if (!Array.isArray(data) || !data.length)
    throw new Error('Cần ít nhất một bot Telegram để nhập lại dữ liệu');
  return data.map((item) => {
    const name = String(item.name || '');
    const token = String(item.token || '');
    const chatId = String(item.chatId || process.env.TELEGRAM_STORAGE_CHAT_ID || '');
    if (
      !/^[a-z][a-z0-9_-]{0,31}$/i.test(name) ||
      !/^\d+:[A-Za-z0-9_-]+$/.test(token) ||
      !/^-?\d+$/.test(chatId)
    )
      throw new Error('Cấu hình bot không hợp lệ');
    return { name, token, chatId };
  });
}
async function sendPart(bot, buffer, filename) {
  const form = new FormData();
  form.append('chat_id', bot.chatId);
  form.append(
    'document',
    new Blob([buffer], { type: 'application/octet-stream' }),
    filename.replace(/[\r\n]/g, '_').slice(0, 100),
  );
  const response = await fetch(`https://api.telegram.org/bot${bot.token}/sendDocument`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(900_000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok || !result.result?.document?.file_id)
    throw new Error(`Bot ${bot.name}: ${result.description || 'Không gửi được tệp'}`);
  return {
    account: `bot:${bot.name}`,
    chatId: Number(bot.chatId),
    messageId: result.result.message_id,
    fileId: result.result.document.file_id,
    size: buffer.length,
  };
}
async function verifyManifest(root) {
  const manifest = JSON.parse(await fsp.readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !manifest.filesIncluded || !Array.isArray(manifest.files))
    throw new Error('Backup không chứa bộ file đầy đủ');
  for (const file of manifest.files) {
    if (typeof file.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(file.id))
      throw new Error('ID file không hợp lệ');
    const src = path.join(root, 'media', file.id);
    const stat = await fsp.stat(src);
    if (stat.size !== file.size) throw new Error(`Sai dung lượng: ${file.id}`);
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(src)) hash.update(chunk);
    if (hash.digest('hex') !== file.sha256) throw new Error(`Sai checksum: ${file.id}`);
  }
  return manifest;
}
async function main() {
  const root = path.resolve(process.argv[2] || '');
  if (!process.argv[2])
    throw new Error('Cách dùng: npm run backup:restore-media -- /tmp/itclub-restore --apply');
  const manifest = await verifyManifest(root);
  console.log(`Đã xác minh ${manifest.files.length} tệp trong bản sao lưu`);
  if (!process.argv.includes('--apply')) {
    console.log(
      'Thêm --apply để upload lại các tệp lên Telegram và cập nhật parts của SQLite. Dừng website và sao lưu SQLite trước khi chạy.',
    );
    return;
  }
  const Database = require('better-sqlite3');
  const sql = new Database(dbPath(), { timeout: 30000 });
  const bots = configuredBots();
  let processed = 0;
  try {
    const insertPart = sql.prepare(
      'INSERT INTO parts(node_id,part_index,chat_id,message_id,account,size) VALUES(?,?,?,?,?,?)',
    );
    const insertFile = sql.prepare(
      'INSERT OR REPLACE INTO bot_files(account,chat_id,message_id,file_id) VALUES(?,?,?,?)',
    );
    for (const file of manifest.files) {
      const node = sql.prepare("SELECT id FROM nodes WHERE id=? AND kind='file'").get(file.id);
      if (!node) throw new Error(`Không thấy node ${file.id} trong SQLite`);
      const handle = await fsp.open(path.join(root, 'media', file.id), 'r');
      const parts = [];
      try {
        let pos = 0;
        while (pos < file.size) {
          const length = Math.min(CHUNK, file.size - pos),
            buffer = Buffer.allocUnsafe(length);
          let filled = 0;
          while (filled < length) {
            const { bytesRead } = await handle.read(buffer, filled, length - filled, pos + filled);
            if (!bytesRead) throw new Error('File khôi phục bị cắt ngắn');
            filled += bytesRead;
          }
          const bot = bots[(processed + parts.length) % bots.length];
          const part = await sendPart(bot, buffer, file.name || file.id);
          parts.push(part);
          pos += length;
        }
      } finally {
        await handle.close();
      }
      sql.transaction(() => {
        sql.prepare('DELETE FROM parts WHERE node_id=?').run(file.id);
        parts.forEach((part, index) => {
          insertPart.run(file.id, index, part.chatId, part.messageId, part.account, part.size);
          insertFile.run(part.account, part.chatId, part.messageId, part.fileId);
        });
      })();
      console.log(`${++processed}/${manifest.files.length}: ${file.name || file.id}`);
    }
    console.log('Khôi phục file hoàn tất. Có thể khởi động lại website.');
  } finally {
    sql.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

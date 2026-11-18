import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { Readable } from 'node:stream';
import { BOTS_KEY, readPrivate, type BotSettings } from './private-settings';

export type BotConfig = { name: string; token: string; chatId: string };
type BotMessage = { message_id: number; chat: { id: number }; document?: { file_id: string } };
export type BotPart = {
  chatId: number;
  messageId: number;
  account: string;
  size: number;
  fileId: string;
};
const LIMIT = 16 * 1024 * 1024;

export function bots(): BotConfig[] {
  const stored = readPrivate<BotSettings>(BOTS_KEY);
  const input = process.env.TELEGRAM_BOTS_JSON?.trim();
  const entries: unknown = stored !== null ? stored.bots : input ? JSON.parse(input) : [];
  if (!Array.isArray(entries) || entries.length > 20)
    throw new Error('TELEGRAM_BOTS_JSON phải là mảng tối đa 20 bot');
  const names = new Set<string>();
  return entries.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Cấu hình bot không hợp lệ');
    const item = entry as Record<string, unknown>;
    const name = String(item.name || '');
    const token = String(item.token || '');
    const chatId = String(item.chatId || process.env.TELEGRAM_STORAGE_CHAT_ID || '');
    if (!/^[a-z][a-z0-9_-]{0,31}$/i.test(name) || names.has(name))
      throw new Error('Tên bot trùng hoặc không hợp lệ');
    if (!/^\d+:[a-zA-Z0-9_-]+$/.test(token)) throw new Error(`Token bot ${name} không hợp lệ`);
    if (!/^-?\d+$/.test(chatId)) throw new Error(`Thiếu chat ID của bot ${name}`);
    names.add(name);
    return { name, token, chatId };
  });
}

function botByAccount(account: string) {
  const name = account.startsWith('bot:') ? account.slice(4) : '';
  const bot = bots().find((entry) => entry.name === name);
  if (!bot) throw new Error(`Bot lưu tệp ${name} chưa được cấu hình`);
  return bot;
}

async function method<T>(
  bot: BotConfig,
  action: string,
  data: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${bot.token}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: signal || AbortSignal.timeout(90_000),
  });
  const result = (await response.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
    parameters?: { retry_after?: number };
  };
  if (!response.ok || !result.ok)
    throw new Error(`Bot ${bot.name}: ${result.description || 'Telegram API thất bại'}`);
  return result.result as T;
}

export async function checkBots() {
  return Promise.all(
    bots().map(async (bot) => {
      try {
        const me = await method<{ username?: string }>(bot, 'getMe', {});
        await method(bot, 'getChat', { chat_id: bot.chatId });
        return { name: bot.name, username: me.username || '', chatId: bot.chatId, ok: true };
      } catch (error) {
        return {
          name: bot.name,
          chatId: bot.chatId,
          ok: false,
          error: error instanceof Error ? error.message : 'Kết nối thất bại',
        };
      }
    }),
  );
}

async function sendPart(
  bot: BotConfig,
  localPath: string,
  start: number,
  size: number,
  filename: string,
  onBytes: (size: number) => void,
): Promise<BotPart> {
  const boundary = `----ItClub${randomUUID().replaceAll('-', '')}`;
  const safeName = filename.replace(/[\r\n"\\]/g, '_').slice(0, 110);
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${bot.chatId}\r\n--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${safeName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Readable.from(
    (async function* () {
      yield prefix;
      for await (const chunk of createReadStream(localPath, {
        start,
        end: start + size - 1,
        highWaterMark: 256 * 1024,
      })) {
        onBytes((chunk as Buffer).length);
        yield chunk;
      }
      yield suffix;
    })(),
  );
  const url = `https://api.telegram.org/bot${bot.token}/sendDocument`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(prefix.length + size + suffix.length),
    },
    body: Readable.toWeb(body) as unknown as ReadableStream,
    duplex: 'half',
    signal: AbortSignal.timeout(900_000),
  } as RequestInit & { duplex: 'half' });
  const answer = (await response.json()) as {
    ok: boolean;
    result?: BotMessage;
    description?: string;
  };
  if (!response.ok || !answer.ok || !answer.result?.message_id)
    throw new Error(`Bot ${bot.name}: ${answer.description || 'Không gửi được tệp'}`);
  return {
    account: `bot:${bot.name}`,
    chatId: Number(bot.chatId),
    messageId: answer.result.message_id,
    size,
    fileId: answer.result.document?.file_id || '',
  };
}

let nextBot = 0;
export async function uploadWithBots(
  localPath: string,
  filename: string,
  totalBytes: number,
  onProgress: (bytes: number) => void,
): Promise<BotPart[]> {
  const group = bots();
  if (!group.length) throw new Error('Chưa cấu hình bot Telegram');
  const chunks: { index: number; start: number; length: number; bot: BotConfig }[] = [];
  const offset = nextBot++;
  for (let start = 0; start < totalBytes; start += LIMIT) {
    chunks.push({
      index: chunks.length,
      start,
      length: Math.min(LIMIT, totalBytes - start),
      bot: group[(offset + chunks.length) % group.length],
    });
  }
  const completed: BotPart[] = new Array(chunks.length);
  let done = 0;
  const pending = new Map<number, number>();
  const selected =
    readPrivate<BotSettings>(BOTS_KEY)?.concurrency ??
    Number(process.env.TELEGRAM_BOT_CONCURRENCY || group.length);
  const concurrency = Math.min(group.length, Math.max(1, Math.min(5, selected)));
  try {
    for (let round = 0; round < chunks.length; round += concurrency) {
      const batch = chunks.slice(round, round + concurrency);
      const settled = await Promise.allSettled(
        batch.map(async (part) => {
          let sent = 0;
          const uploaded = await sendPart(
            part.bot,
            localPath,
            part.start,
            part.length,
            filename,
            (bytes) => {
              sent += bytes;
              pending.set(part.index, sent);
              onProgress(
                Math.min(totalBytes, done + [...pending.values()].reduce((a, b) => a + b, 0)),
              );
            },
          );
          completed[part.index] = uploaded;
        }),
      );
      const errors = settled.filter((v) => v.status === 'rejected');
      done += batch.reduce((sum, part) => sum + (completed[part.index]?.size || 0), 0);
      pending.clear();
      onProgress(Math.min(totalBytes, done));
      if (errors.length) throw (errors[0] as PromiseRejectedResult).reason;
    }
    if (completed.some((p) => !p.fileId)) throw new Error('Telegram không trả về file_id');
    return completed;
  } catch (error) {
    await Promise.allSettled(completed.filter(Boolean).map((part) => deleteBotPart(part)));
    throw error;
  }
}
export async function deleteBotPart(part: BotPart) {
  const bot = botByAccount(part.account);
  return method(bot, 'deleteMessage', { chat_id: part.chatId, message_id: part.messageId });
}
export async function botPartStream(
  account: string,
  chatId: number,
  messageId: number,
): Promise<Readable> {
  const bot = botByAccount(account);
  if (Number(bot.chatId) !== chatId) throw new Error('Chat bot không khớp cấu hình');
  const fileId = lookupBotFileId(account, chatId, messageId);
  if (!fileId) throw new Error('Không tìm thấy Telegram file ID; kiểm tra bảng bot_files');
  const data = await method<{ file_path?: string }>(bot, 'getFile', { file_id: fileId });
  if (!data.file_path) throw new Error('Telegram chưa cung cấp đường dẫn tệp');
  const response = await fetch(`https://api.telegram.org/file/bot${bot.token}/${data.file_path}`, {
    signal: AbortSignal.timeout(900_000),
  });
  if (!response.ok || !response.body) throw new Error('Không tải được tệp từ Telegram');
  return Readable.fromWeb(response.body as never);
}
function lookupBotFileId(account: string, chatId: number, messageId: number) {
  const row = db()
    .prepare('SELECT file_id FROM bot_files WHERE account=? AND chat_id=? AND message_id=?')
    .get(account, chatId, messageId) as { file_id: string } | undefined;
  return row?.file_id;
}

export function safeBotSettings() {
  const config = readPrivate<BotSettings>(BOTS_KEY);
  return {
    bots: bots().map(({ name, chatId }) => ({ name, chatId })),
    concurrency: config?.concurrency ?? Number(process.env.TELEGRAM_BOT_CONCURRENCY || 2),
    mode: config?.mode || process.env.TELEGRAM_UPLOAD_MODE || 'auto',
  };
}

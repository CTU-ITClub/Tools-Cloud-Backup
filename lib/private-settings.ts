import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { db } from './db';
import { masterKey } from './config';

export const BOTS_KEY = 'media:telegram-bots:v1';
export const BACKUP_KEY = 'media:drive-backup:v1';

export type BotSettings = {
  bots: { name: string; token: string; chatId: string }[];
  concurrency: number;
  mode: 'auto' | 'tdlib';
};
export type BackupSettings = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  intervalHours: number;
  retention: number;
  includeFiles: boolean;
  folderId: string;
  folderName: string;
};
export function readPrivate<T>(key: string): T | null {
  const row = db().prepare('SELECT value FROM settings WHERE key=?').get(key) as
    { value: string } | undefined;
  if (!row) return null;
  const encoded = row.value;
  if (!encoded.startsWith('enc:v1:')) throw new Error('Cấu hình bảo mật không được mã hóa');
  const raw = Buffer.from(encoded.slice(7), 'base64');
  if (raw.length < 29) throw new Error('Cấu hình bảo mật không hợp lệ');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(masterKey(), 'base64'),
    raw.subarray(0, 12),
  );
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'),
  ) as T;
}
export function writePrivate(key: string, value: object) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(masterKey(), 'base64'), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const stored = 'enc:v1:' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  db()
    .prepare(
      'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    )
    .run(key, stored);
}

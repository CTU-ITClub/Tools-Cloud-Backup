import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const dataDir = path.resolve(process.env.DATA_DIR || './data');
export const maxFileBytes =
  Math.max(1, Math.min(1900, Number(process.env.MAX_FILE_MIB || 150))) * 1048576;
export const appOrigin = (process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
export const tdlibPath = path.resolve(
  process.env.TDLIB_PATH || './tdlib-native/lib/libtdjson.so.1.8.67',
);

export function masterKey(): string {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'master.key');
  let value = process.env.MASTER_KEY || (existsSync(file) ? readFileSync(file, 'utf8').trim() : '');
  if (!value) {
    value = randomBytes(32).toString('base64');
    writeFileSync(file, value, { mode: 0o600 });
  }
  if (Buffer.from(value, 'base64').length !== 32)
    throw new Error('MASTER_KEY must be 32 base64 bytes');
  if (existsSync(file)) chmodSync(file, 0o600);
  return value;
}

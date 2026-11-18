import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { dataDir } from './config';
import type { Node, ClubEvent, User } from './model';

const globalDb = globalThis as typeof globalThis & { __clubDb?: Database.Database };

export function db(): Database.Database {
  if (globalDb.__clubDb) return globalDb.__clubDb;
  mkdirSync(dataDir, { recursive: true });
  const current = path.join(dataDir, 'itclub-cloud.db');
  const legacy = path.join(dataDir, 'telecloud.db');
  if (existsSync(current) && existsSync(legacy))
    throw new Error('Both legacy and current DB exist. Select one.');
  const database = new Database(existsSync(legacy) ? legacy : current, { timeout: 10000 });
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
      quota_bytes INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0,
      api_hash TEXT, s3_access TEXT, s3_secret TEXT,
      telegram_user_id INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES nodes(id), name TEXT NOT NULL, kind TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0, mime TEXT NOT NULL DEFAULT 'application/octet-stream',
      etag TEXT NOT NULL DEFAULT '', deleted_at INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS node_live_name ON nodes(owner, COALESCE(parent_id, ''), name) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS node_owner_parent ON nodes(owner,parent_id);
    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      part_index INTEGER NOT NULL, chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL,
      account TEXT NOT NULL DEFAULT 'main', size INTEGER NOT NULL,
      UNIQUE(node_id, part_index)
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      owner TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      folder_id TEXT NOT NULL REFERENCES nodes(id), recap_folder_id TEXT NOT NULL REFERENCES nodes(id),
      poster_node_id TEXT REFERENCES nodes(id), published INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_published ON events(published, updated_at DESC);
    CREATE TABLE IF NOT EXISTS bot_files (
      account TEXT NOT NULL, chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL,
      file_id TEXT NOT NULL, PRIMARY KEY(account,chat_id,message_id)
    );
    CREATE TABLE IF NOT EXISTS transfer_jobs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, direction TEXT NOT NULL DEFAULT 'upload',
      stage TEXT NOT NULL DEFAULT 'receiving', bytes_total INTEGER NOT NULL,
      bytes_received INTEGER NOT NULL DEFAULT 0, bytes_remote INTEGER NOT NULL DEFAULT 0,
      error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS transfer_jobs_user ON transfer_jobs(user_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS media_service_tokens (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL CHECK(scope = 'events:read'),
      created_at INTEGER NOT NULL, revoked_at INTEGER, last_used_at INTEGER
    );
  `);
  const userColumns = database.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userColumns.some((c) => c.name === 'can_manage_events')) {
    database.exec('ALTER TABLE users ADD COLUMN can_manage_events INTEGER NOT NULL DEFAULT 0');
  }
  database.prepare("UPDATE users SET can_manage_events=1 WHERE role='admin'").run();
  database
    .prepare(
      "UPDATE transfer_jobs SET stage='error',error='Tác vụ bị gián đoạn',updated_at=? WHERE stage NOT IN ('done','error')",
    )
    .run(Math.floor(Date.now() / 1000));
  database
    .prepare("DELETE FROM transfer_jobs WHERE created_at < ? AND stage IN ('done','error')")
    .run(Math.floor(Date.now() / 1000) - 7 * 86400);
  globalDb.__clubDb = database;
  return database;
}
export const now = () => Math.floor(Date.now() / 1000);
export const id = () => randomUUID();
export const sqlNode = (id: string) =>
  db().prepare('SELECT * FROM nodes WHERE id=? AND deleted_at IS NULL').get(id) as Node | undefined;
export const getEvent = (id: string) =>
  db().prepare('SELECT * FROM events WHERE id=?').get(id) as ClubEvent | undefined;
export const safeUser = (id: string) =>
  db()
    .prepare(
      'SELECT id, username,role,quota_bytes,disabled,can_manage_events,created_at FROM users WHERE id=?',
    )
    .get(id) as User | undefined;
export function validName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Tên không hợp lệ');
  const name = value.trim();
  if (
    !name ||
    Buffer.byteLength(name) > 240 ||
    name === '.' ||
    name === '..' ||
    /[\\/\x00-\x1f\x7f]/u.test(name)
  )
    throw new Error('Tên không hợp lệ');
  return name;
}
export function folder(parent: string | null, owner: string, name: string): Node {
  if (parent) {
    const root = sqlNode(parent);
    if (!root || root.owner !== owner || root.kind !== 'folder')
      throw new Error('Thư mục không tồn tại');
  }
  const t = now();
  const key = id();
  db()
    .prepare(
      "INSERT INTO nodes(id,owner,parent_id,name,kind,created_at,updated_at) VALUES(?,?,?,?,'folder',?,?)",
    )
    .run(key, owner, parent, name, t, t);
  return sqlNode(key)!;
}

export function eventForNode(nodeId: string): ClubEvent | undefined {
  const row = db()
    .prepare(
      `WITH RECURSIVE parents(id,parent_id) AS (
    SELECT id,parent_id FROM nodes WHERE id=? UNION ALL
    SELECT n.id,n.parent_id FROM nodes n JOIN parents p ON n.id=p.parent_id
  ) SELECT e.* FROM events e JOIN parents p ON e.folder_id=p.id LIMIT 1`,
    )
    .get(nodeId) as ClubEvent | undefined;
  return row;
}

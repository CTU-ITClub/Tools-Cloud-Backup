import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { dataDir } from './config';
import { BACKUP_KEY, readPrivate, writePrivate, type BackupSettings } from './private-settings';

export function getBackupSettings(): BackupSettings {
  const stored = readPrivate<BackupSettings>(BACKUP_KEY);
  return (
    stored ?? {
      clientId: process.env.GOOGLE_DRIVE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || '',
      refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '',
      intervalHours: Number(process.env.BACKUP_INTERVAL_HOURS || 6),
      retention: Number(process.env.BACKUP_RETENTION || 7),
      includeFiles: process.env.BACKUP_INCLUDE_FILES !== 'false',
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
      folderName: process.env.GOOGLE_DRIVE_BACKUP_FOLDER || 'ITClub Media Backups',
    }
  );
}
export function saveBackupSettings(input: BackupSettings) {
  writePrivate(BACKUP_KEY, input);
}
export function prepareBackupKeys() {
  mkdirSync(dataDir, { recursive: true });
  for (const [file, source] of [
    [
      'backup-secret.key',
      () => process.env.BACKUP_ENCRYPTION_KEY || randomBytes(32).toString('base64'),
    ],
    [
      'backup-internal.key',
      () => process.env.BACKUP_INTERNAL_TOKEN || randomBytes(32).toString('hex'),
    ],
  ] as const) {
    const target = path.join(dataDir, file);
    if (!existsSync(target)) writeFileSync(target, source(), { mode: 0o600, flag: 'wx' });
  }
}
export function internalBackupToken() {
  if (process.env.BACKUP_INTERNAL_TOKEN) return process.env.BACKUP_INTERNAL_TOKEN;
  const target = path.join(dataDir, 'backup-internal.key');
  return existsSync(target) ? readFileSync(target, 'utf8').trim() : '';
}
export function backupSafe() {
  const config = getBackupSettings();
  let status: Record<string, unknown> = {};
  try {
    status = JSON.parse(readFileSync(path.join(dataDir, 'backup-status.json'), 'utf8'));
  } catch {}
  return {
    enabled: !!(config.clientId && config.clientSecret && config.refreshToken),
    clientId: config.clientId,
    hasClientSecret: !!config.clientSecret,
    connected: !!config.refreshToken,
    folderName: config.folderName,
    folderId: config.folderId,
    intervalHours: config.intervalHours,
    retention: config.retention,
    includeFiles: config.includeFiles,
    status,
  };
}

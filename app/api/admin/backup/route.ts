import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { requireAdmin, requireUser } from '@/lib/auth';
import {
  getBackupSettings,
  saveBackupSettings,
  prepareBackupKeys,
  backupSafe,
} from '@/lib/backup-settings';
import { dataDir } from '@/lib/config';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => {
    requireAdmin(await requireUser());
    return ok(backupSafe());
  });
}
export async function PUT(req: Request) {
  return handle(async () => {
    secureMutation(req);
    requireAdmin(await requireUser());
    const body = (await req.json()) as Record<string, unknown>;
    if (!body || typeof body !== 'object') throw new Error('Cấu hình không hợp lệ');
    const prev = getBackupSettings();
    const intervalHours = Number(body.intervalHours ?? prev.intervalHours);
    const retention = Number(body.retention ?? prev.retention);
    if (!Number.isFinite(intervalHours) || intervalHours < 0.25 || intervalHours > 168)
      throw new Error('Chu kỳ từ 15 phút đến 168 giờ');
    if (!Number.isInteger(retention) || retention < 1 || retention > 50)
      throw new Error('Số bản lưu từ 1 đến 50');
    const clientId = String(body.clientId ?? prev.clientId).trim();
    const secret = String(body.clientSecret || prev.clientSecret).trim();
    const folderId = String(body.folderId ?? prev.folderId).trim();
    const folderName = String(body.folderName ?? prev.folderName).trim();
    if (
      clientId.length > 250 ||
      secret.length > 300 ||
      folderId.length > 200 ||
      !folderName ||
      folderName.length > 120
    )
      throw new Error('Thông tin Google Drive quá dài hoặc không hợp lệ');
    if (folderId && !/^[a-zA-Z0-9_-]+$/.test(folderId)) throw new Error('Folder ID không hợp lệ');
    const changedCredentials = clientId !== prev.clientId || secret !== prev.clientSecret;
    saveBackupSettings({
      ...prev,
      clientId,
      clientSecret: secret,
      folderId,
      folderName,
      retention,
      intervalHours,
      includeFiles:
        body.includeFiles === undefined ? prev.includeFiles : body.includeFiles === true,
      refreshToken: changedCredentials ? '' : prev.refreshToken,
    });
    prepareBackupKeys();
    return ok(backupSafe());
  });
}
export async function DELETE(req: Request) {
  return handle(async () => {
    secureMutation(req);
    requireAdmin(await requireUser());
    const config = getBackupSettings();
    saveBackupSettings({ ...config, refreshToken: '' });
    return ok(backupSafe());
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    requireAdmin(await requireUser());
    if (!backupSafe().enabled) throw new Error('Cần kết nối Google Drive trước');
    prepareBackupKeys();
    writeFileSync(
      path.join(dataDir, 'backup-request.json'),
      JSON.stringify({ requestedAt: Date.now() }),
      { mode: 0o600 },
    );
    return ok({ queued: true });
  });
}

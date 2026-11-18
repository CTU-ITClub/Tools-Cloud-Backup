import { requireAdmin, requireUser } from '@/lib/auth';
import { getBackupSettings } from '@/lib/backup-settings';
import { handle } from '@/lib/route';
import { ok } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => {
    requireAdmin(await requireUser());
    const cfg = getBackupSettings();
    if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken)
      return ok({ ok: false, message: 'Chưa kết nối Google Drive' });
    const data = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: 'refresh_token',
    });
    const token = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: data,
      signal: AbortSignal.timeout(20000),
    });
    const result = (await token.json()) as { access_token?: string };
    if (!token.ok || !result.access_token)
      return ok({ ok: false, message: 'Google OAuth không còn hợp lệ. Vui lòng kết nối lại.' });
    const response = await fetch(
      'https://www.googleapis.com/drive/v3/files?fields=files(id)&pageSize=1',
      {
        headers: { Authorization: `Bearer ${result.access_token}` },
        signal: AbortSignal.timeout(20000),
      },
    );
    return ok({
      ok: response.ok,
      message: response.ok ? 'Đã kết nối Google Drive' : 'Không có quyền Drive',
    });
  });
}

import { cookies } from 'next/headers';
import { fixedEqual, requireAdmin, requireUser } from '@/lib/auth';
import { getBackupSettings, saveBackupSettings, prepareBackupKeys } from '@/lib/backup-settings';
import { appOrigin } from '@/lib/config';
import { handle } from '@/lib/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => {
    requireAdmin(await requireUser());
    const jar = await cookies();
    const given = new URL(request.url).searchParams;
    const original = jar.get('itclub_oauth_state')?.value || '';
    const verifier = jar.get('itclub_oauth_verifier')?.value || '';
    jar.delete('itclub_oauth_state');
    jar.delete('itclub_oauth_verifier');
    if (!original || !verifier || !given.get('state') || !fixedEqual(original, given.get('state')!))
      throw new Error('Phiên kết nối Google hết hạn hoặc không hợp lệ');
    if (given.get('error'))
      return Response.redirect(`${appOrigin}/?tab=settings&oauth=cancelled`, 302);
    const code = given.get('code');
    if (!code) throw new Error('Google không cung cấp mã xác thực');
    const previous = getBackupSettings();
    const payload = new URLSearchParams({
      client_id: previous.clientId,
      client_secret: previous.clientSecret,
      code,
      redirect_uri: `${appOrigin}/api/admin/google/callback`,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    });
    const result = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
      signal: AbortSignal.timeout(30_000),
    });
    const token = (await result.json()) as { refresh_token?: string; error?: string };
    if (!result.ok || !token.refresh_token)
      throw new Error(
        'Không nhận được refresh token. Hãy kết nối lại và chấp thuận quyền Google Drive.',
      );
    saveBackupSettings({ ...previous, refreshToken: token.refresh_token });
    prepareBackupKeys();
    return Response.redirect(`${appOrigin}/?tab=settings&oauth=connected`, 302);
  });
}

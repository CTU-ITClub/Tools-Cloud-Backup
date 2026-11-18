import { cookies } from 'next/headers';
import { randomBytes, createHash } from 'node:crypto';
import { appOrigin } from '@/lib/config';
import { getBackupSettings } from '@/lib/backup-settings';
import { requireAdmin, requireUser } from '@/lib/auth';
import { handle } from '@/lib/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const redirectUri = () => `${appOrigin}/api/admin/google/callback`;
export async function GET() {
  return handle(async () => {
    requireAdmin(await requireUser());
    const { clientId, clientSecret } = getBackupSettings();
    if (!clientId || !clientSecret)
      throw new Error('Lưu Client ID và Client Secret trước khi kết nối');
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const jar = await cookies();
    const flags = {
      httpOnly: true,
      secure: appOrigin.startsWith('https:'),
      sameSite: 'lax' as const,
      path: '/api/admin/google',
      maxAge: 600,
    };
    jar.set('itclub_oauth_state', state, flags);
    jar.set('itclub_oauth_verifier', verifier, flags);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [key, value] of Object.entries({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }))
      url.searchParams.set(key, value);
    return Response.redirect(url, 302);
  });
}

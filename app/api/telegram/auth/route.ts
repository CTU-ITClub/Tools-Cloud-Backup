import { requireUser, requireAdmin } from '@/lib/auth';
import { telegram } from '@/lib/telegram';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    requireAdmin(await requireUser());
    const { action, value } = await req.json();
    const tg = telegram();
    const request =
      action === 'qr'
        ? { '@type': 'requestQrCodeAuthentication', other_user_ids: [] }
        : action === 'phone'
          ? { '@type': 'setAuthenticationPhoneNumber', phone_number: String(value) }
          : action === 'code'
            ? { '@type': 'checkAuthenticationCode', code: String(value) }
            : action === 'password'
              ? { '@type': 'checkAuthenticationPassword', password: String(value) }
              : null;
    if (!request) throw new Error('Thao tác không hợp lệ');
    return ok(await tg.call(request));
  });
}

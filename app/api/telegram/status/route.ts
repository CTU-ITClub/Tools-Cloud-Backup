import { requireUser, requireAdmin } from '@/lib/auth';
import { telegram } from '@/lib/telegram';
import { handle } from '@/lib/route';
import { ok } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => {
    requireAdmin(await requireUser());
    const tg = telegram();
    let account: { id: number; name: string; username: string } | null = null;
    if (tg.ready()) {
      try {
        const me = await tg.call({ '@type': 'getMe' }, 12000);
        account = {
          id: me.id,
          name: [me.first_name, me.last_name].filter(Boolean).join(' ').trim(),
          username: me.usernames?.active_usernames?.[0] || me.username || '',
        };
      } catch { /* Connection status remains available while the profile is loading. */ }
    }
    return ok({ ready: tg.ready(), state: tg.ready() ? { '@type': 'authorizationStateReady' } : tg.state, error: tg.error, account });
  });
}

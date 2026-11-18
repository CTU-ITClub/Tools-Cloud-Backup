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
    return ok({ ready: tg.ready(), state: tg.state, error: tg.error });
  });
}

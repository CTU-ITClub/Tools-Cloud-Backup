import { db } from '@/lib/db';
import { sessionUser } from '@/lib/auth';
import { handle } from '@/lib/route';
import { ok } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () =>
    ok({
      setup_required:
        (db().prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count ===
        0,
      user: await sessionUser(),
    }),
  );
}

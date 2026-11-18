import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const jobs = db()
      .prepare(
        `SELECT id,name,direction,stage,bytes_total,bytes_received,bytes_remote,error,created_at,updated_at
      FROM transfer_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 40`,
      )
      .all(user.id);
    return ok(jobs);
  });
}

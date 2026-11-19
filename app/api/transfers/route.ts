import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const jobs = db()
      .prepare(
        `SELECT id,name,direction,stage,bytes_total,bytes_received,bytes_remote,error,created_at,updated_at
      FROM transfer_jobs WHERE user_id=? AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 40`,
      )
      .all(user.id);
    return ok(jobs);
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    secureMutation(req);
    const user = await requireUser();
    const { id } = (await req.json()) as { id?: string };
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))
      throw new Error('Tác vụ không hợp lệ');
    db().transaction(() => {
      db().prepare('UPDATE transfer_jobs SET dismissed_at=? WHERE id=? AND user_id=?').run(Math.floor(Date.now() / 1000), id, user.id);
      db().prepare("DELETE FROM transfer_jobs WHERE id=? AND user_id=? AND stage IN ('done','error')").run(id, user.id);
    })();
    return ok({ ok: true });
  });
}

import { requireUser, requireEventManager } from '@/lib/auth';
import { db, getEvent, now, sqlNode, validName } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const event = getEvent((await params).id);
    if (!event) throw new Error('Sự kiện không tồn tại');
    const poster = event.poster_node_id ? sqlNode(event.poster_node_id) : null;
    const recap = db()
      .prepare(
        "SELECT id,name,size,mime,created_at FROM nodes WHERE parent_id=? AND kind='file' AND deleted_at IS NULL ORDER BY created_at DESC",
      )
      .all(event.recap_folder_id);
    return ok({ ...event, poster, recap });
  });
}
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    secureMutation(req);
    requireEventManager(await requireUser());
    const event = getEvent((await params).id);
    if (!event) throw new Error('Sự kiện không tồn tại');
    const input = await req.json();
    const title = input.title === undefined ? event.title : validName(input.title);
    const description =
      input.description === undefined
        ? event.description
        : String(input.description).slice(0, 1000);
    const published = input.published === undefined ? event.published : input.published ? 1 : 0;
    db()
      .prepare('UPDATE events SET title=?,description=?,published=?,updated_at=? WHERE id=?')
      .run(title, description, published, now(), event.id);
    return ok(getEvent(event.id));
  });
}
export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    secureMutation(req);
    requireEventManager(await requireUser());
    const event = getEvent((await params).id);
    if (!event) throw new Error('Sự kiện không tồn tại');
    const t = now();
    db().transaction(() => {
      db().prepare('DELETE FROM events WHERE id=?').run(event.id);
      db()
        .prepare(
          `WITH RECURSIVE tree(id) AS (SELECT id FROM nodes WHERE id=? UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent_id=t.id)
   UPDATE nodes SET deleted_at=?,updated_at=? WHERE id IN (SELECT id FROM tree)`,
        )
        .run(event.folder_id, t, t);
    })();
    return ok({ ok: true });
  });
}

import { requireUser, requireEventManager } from '@/lib/auth';
import { db, getEvent, now, sqlNode, validName } from '@/lib/db';
import { canViewNode } from '@/lib/files';
import { deleteImageVariants } from '@/lib/media-variants';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const event = getEvent((await params).id);
    if (!event || (!event.published && user.role !== 'admin' && !user.can_manage_events))
      throw new Error('Sự kiện không tồn tại');
    const posterNode = event.poster_node_id ? sqlNode(event.poster_node_id) : null;
    const poster =
      posterNode &&
      canViewNode(posterNode, user) &&
      db().prepare('SELECT 1 FROM parts WHERE node_id=? LIMIT 1').get(posterNode.id)
        ? posterNode
        : null;
    const recap = db()
      .prepare(
        "SELECT n.id,n.name,n.size,n.mime,n.created_at FROM nodes n WHERE n.parent_id=? AND n.kind='file' AND n.deleted_at IS NULL AND EXISTS (SELECT 1 FROM parts p WHERE p.node_id=n.id) ORDER BY n.created_at DESC",
      )
      .all(event.recap_folder_id);
    const canSeeRecap = user.role === 'admin' || user.can_manage_events === 1;
    return ok({ ...event, poster, recap: canSeeRecap ? recap : [] });
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
    const variantIds = [
      ...(event.poster_node_id ? [event.poster_node_id] : []),
      ...(
        db().prepare('SELECT id FROM nodes WHERE parent_id=?').all(event.recap_folder_id) as {
          id: string;
        }[]
      ).map((item) => item.id),
    ];
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
    await Promise.allSettled(variantIds.map((nodeId) => deleteImageVariants(nodeId)));
    return ok({ ok: true });
  });
}

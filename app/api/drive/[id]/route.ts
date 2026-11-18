import { requireUser } from '@/lib/auth';
import { db, sqlNode, now, validName, eventForNode } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
import { telegram } from '@/lib/telegram';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    secureMutation(req);
    const user = await requireUser();
    const node = sqlNode((await params).id);
    const input = await req.json();
    if (!node || node.owner !== user.id) throw new Error('File không tồn tại');
    if (eventForNode(node.id)) throw new Error('Chỉnh ảnh sự kiện tại tab Sự kiện');
    const name = validName(input.name);
    db().prepare('UPDATE nodes SET name=?,updated_at=? WHERE id=?').run(name, now(), node.id);
    return ok({ ok: true });
  });
}
export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    secureMutation(req);
    const user = await requireUser();
    const node = sqlNode((await params).id);
    if (!node || node.owner !== user.id) throw new Error('File không tồn tại');
    if (eventForNode(node.id)) throw new Error('Xóa sự kiện tại tab Sự kiện');
    const parts = db()
      .prepare(
        `WITH RECURSIVE tree(id) AS (
 SELECT id FROM nodes WHERE id=? UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent_id=t.id
 ) SELECT chat_id,message_id FROM parts WHERE node_id IN (SELECT id FROM tree)`,
      )
      .all(node.id) as { chat_id: number; message_id: number }[];
    db().transaction(() => {
      // Soft delete keeps historical node IDs for compatibility; descendants are also marked.
      db()
        .prepare(
          `WITH RECURSIVE tree(id) AS (
 SELECT id FROM nodes WHERE id=? UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent_id=t.id
 ) UPDATE nodes SET deleted_at=?,updated_at=? WHERE id IN (SELECT id FROM tree)`,
        )
        .run(node.id, now(), now());
    })();
    // Do not delete Telegram messages until an explicit permanent purge/GC operation.
    void parts;
    return ok({ ok: true });
  });
}

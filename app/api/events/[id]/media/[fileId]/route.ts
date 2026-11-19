import { requireUser, requireEventManager } from '@/lib/auth';
import { db, getEvent, now, sqlNode } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
import { deleteImageVariants } from '@/lib/media-variants';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string; fileId: string }> };
export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    secureMutation(req);
    requireEventManager(await requireUser());
    const { id, fileId } = await params;
    const event = getEvent(id);
    const file = sqlNode(fileId);
    if (!event || !file || file.kind !== 'file') throw new Error('Ảnh sự kiện không tồn tại');
    const poster = event.poster_node_id === fileId;
    const recap = file.parent_id === event.recap_folder_id;
    if (!poster && !recap) throw new Error('Ảnh không thuộc sự kiện');
    db().transaction(() => {
      if (poster)
        db()
          .prepare('UPDATE events SET poster_node_id=NULL,updated_at=? WHERE id=?')
          .run(now(), event.id);
      else db().prepare('UPDATE events SET updated_at=? WHERE id=?').run(now(), event.id);
      db()
        .prepare('UPDATE nodes SET deleted_at=?,updated_at=? WHERE id=?')
        .run(now(), now(), file.id);
    })();
    await deleteImageVariants(file.id).catch(() => {});
    return ok({ ok: true });
  });
}

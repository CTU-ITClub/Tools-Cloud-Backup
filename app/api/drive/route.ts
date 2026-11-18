import { requireUser } from '@/lib/auth';
import { db, sqlNode } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const parent = url.searchParams.get('parent');
    if (parent) {
      const p = sqlNode(parent);
      if (!p || p.owner !== user.id || p.kind !== 'folder')
        throw new Error('Thư mục không tồn tại');
    }
    const rows = db()
      .prepare(
        'SELECT id,owner,parent_id,name,kind,size,mime,etag,created_at,updated_at FROM nodes WHERE owner=? AND parent_id IS ? AND deleted_at IS NULL ORDER BY kind DESC,name COLLATE NOCASE',
      )
      .all(user.id, parent);
    return ok(rows);
  });
}

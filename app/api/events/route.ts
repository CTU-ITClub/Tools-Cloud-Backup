import { requireUser, requireEventManager } from '@/lib/auth';
import { db, id, now, folder, validName } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => {
    await requireUser();
    const rows = db()
      .prepare(
        `SELECT e.*, (SELECT COUNT(*) FROM nodes n WHERE n.parent_id=e.recap_folder_id AND n.kind='file' AND n.deleted_at IS NULL) AS recap_count
 FROM events e ORDER BY e.created_at DESC`,
      )
      .all();
    return ok(rows);
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    const user = await requireUser();
    requireEventManager(user);
    const { title, description, slug } = await req.json();
    const name = validName(title);
    const normalSlug = String(
      slug ||
        name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
    ).slice(0, 80);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalSlug)) throw new Error('Slug không hợp lệ');
    const key = id();
    const t = now();
    const result = db().transaction(() => {
      const root = folder(null, user.id, name);
      const recap = folder(root.id, user.id, 'recap');
      db()
        .prepare(
          'INSERT INTO events(id,slug,title,description,owner,folder_id,recap_folder_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .run(
          key,
          normalSlug,
          name,
          String(description || '').slice(0, 1000),
          user.id,
          root.id,
          recap.id,
          t,
          t,
        );
      return { id: key, slug: normalSlug, folder_id: root.id, recap_folder_id: recap.id };
    })();
    return ok(result, 201);
  });
}

import { requireUser, requireEventManager } from '@/lib/auth';
import { db, id, now, folder, validName } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = db()
      .prepare(
        `SELECT e.id,e.slug,e.title,e.description,e.owner,e.folder_id,e.recap_folder_id,e.published,e.created_at,e.updated_at,
  CASE WHEN EXISTS (SELECT 1 FROM nodes n WHERE n.id=e.poster_node_id AND n.deleted_at IS NULL AND EXISTS (SELECT 1 FROM parts p WHERE p.node_id=n.id))
  THEN e.poster_node_id ELSE NULL END AS poster_node_id,
  (SELECT COUNT(*) FROM nodes n WHERE n.parent_id=e.recap_folder_id AND n.kind='file' AND n.deleted_at IS NULL AND EXISTS (SELECT 1 FROM parts p WHERE p.node_id=n.id)) AS recap_count
 FROM events e WHERE (?=1 OR e.published=1) ORDER BY e.created_at DESC`,
      )
      .all(user.role === 'admin' || user.can_manage_events === 1 ? 1 : 0);
    const allowed = user.role === 'admin' || user.can_manage_events === 1;
    return ok(
      (rows as (Record<string, unknown> & { recap_count: number })[]).map((event) => ({
        ...event,
        recap_count: allowed ? event.recap_count : 0,
      })),
    );
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

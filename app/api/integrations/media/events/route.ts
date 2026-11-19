import { db } from '@/lib/db';
import { requireMediaService } from '@/lib/service-auth';
import { handle } from '@/lib/route';
import { ok } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  return handle(async () => {
    requireMediaService(req);
    const events = db()
      .prepare(
        `SELECT e.id,e.slug,e.title,e.description,e.updated_at,
 CASE WHEN EXISTS (
   SELECT 1 FROM nodes poster
   WHERE poster.id=e.poster_node_id AND poster.deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM parts p WHERE p.node_id=poster.id)
 ) THEN e.poster_node_id ELSE NULL END AS poster_id, (SELECT COUNT(*) FROM nodes n WHERE n.parent_id=e.recap_folder_id AND n.kind='file' AND n.deleted_at IS NULL AND EXISTS (SELECT 1 FROM parts p WHERE p.node_id=n.id)) AS recap_count
 FROM events e WHERE published=1 ORDER BY updated_at DESC`,
      )
      .all();
    return ok({ events });
  });
}

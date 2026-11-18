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
        `SELECT id,slug,title,description,updated_at,
 poster_node_id AS poster_id, (SELECT COUNT(*) FROM nodes n WHERE n.parent_id=e.recap_folder_id AND n.kind='file' AND n.deleted_at IS NULL) AS recap_count
 FROM events e WHERE published=1 ORDER BY updated_at DESC`,
      )
      .all();
    return ok({ events });
  });
}

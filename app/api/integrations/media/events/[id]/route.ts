import { db } from '@/lib/db';
import { requireMediaService, publicEvent } from '@/lib/service-auth';
import { handle } from '@/lib/route';
import { ok } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    requireMediaService(req);
    const event = publicEvent((await params).id);
    const recap = db()
      .prepare(
        "SELECT id,name,mime,size,created_at FROM nodes WHERE parent_id=? AND kind='file' AND deleted_at IS NULL ORDER BY created_at DESC",
      )
      .all(event.recap_folder_id);
    const toMedia = (row: {
      id: string;
      name: string;
      mime: string;
      size: number;
      created_at: number;
    }) => ({
      ...row,
      content_path: `/api/integrations/media/files/${row.id}`,
    });
    const poster = event.poster_node_id
      ? (db()
          .prepare(
            'SELECT id,name,mime,size,created_at FROM nodes WHERE id=? AND deleted_at IS NULL',
          )
          .get(event.poster_node_id) as Parameters<typeof toMedia>[0] | undefined)
      : undefined;
    return ok({
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      updated_at: event.updated_at,
      poster: poster ? toMedia(poster) : null,
      recap: (recap as Parameters<typeof toMedia>[0][]).map(toMedia),
    });
  });
}

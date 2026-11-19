import { requireUser, requireEventManager } from '@/lib/auth';
import { db, getEvent, now, sqlNode } from '@/lib/db';
import { isImage, storeFile } from '@/lib/files';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export const maxDuration = 900;
type Ctx = { params: Promise<{ id: string }> };
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    secureMutation(req);
    const uploader = await requireUser();
    requireEventManager(uploader);
    const event = getEvent((await params).id);
    if (!event) throw new Error('Sự kiện không tồn tại');
    const type = req.headers.get('x-media-kind');
    const mime = req.headers.get('content-type') || '';
    if (type !== 'poster' && type !== 'recap')
      throw new Error('Loại ảnh phải là poster hoặc recap');
    if (!isImage(mime)) throw new Error('Chỉ chấp nhận ảnh JPEG, PNG, WebP, GIF hoặc AVIF');
    const original = decodeURIComponent(req.headers.get('x-filename') || '');
    const extension: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/avif': '.avif',
    };
    const filename = type === 'poster' ? 'poster' + extension[mime] : original;
    // A fresh poster node prevents updating a published node before the new upload completes.
    const node = await storeFile(
      req,
      event.owner,
      type === 'poster' ? event.folder_id : event.recap_folder_id,
      filename,
      mime,
      type === 'poster' ? event.poster_node_id || undefined : undefined,
      uploader.id,
      true,
    );
    if (type === 'poster') {
      db()
        .prepare('UPDATE events SET poster_node_id=?,updated_at=? WHERE id=?')
        .run(node.id, now(), event.id);
    } else db().prepare('UPDATE events SET updated_at=? WHERE id=?').run(now(), event.id);
    return ok(node, 201);
  });
}

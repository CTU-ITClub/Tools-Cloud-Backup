import { requireUser } from '@/lib/auth';
import { storeFile } from '@/lib/files';
import { eventForNode } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export const maxDuration = 900;
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    const user = await requireUser();
    const parent = req.headers.get('x-parent-id') || null;
    if (parent && eventForNode(parent)) throw new Error('Upload ảnh sự kiện tại tab Sự kiện');
    const name = decodeURIComponent(req.headers.get('x-filename') || '');
    const node = await storeFile(
      req,
      user.id,
      parent,
      name,
      req.headers.get('content-type') || 'application/octet-stream',
    );
    return ok(node, 201);
  });
}

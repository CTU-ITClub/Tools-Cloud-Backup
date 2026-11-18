import { requireMediaService, requirePublishedMedia } from '@/lib/service-auth';
import { sqlNode } from '@/lib/db';
import { downloadNode } from '@/lib/files';
import { handle } from '@/lib/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    requireMediaService(req);
    const id = (await params).id;
    requirePublishedMedia(id);
    const node = sqlNode(id);
    if (!node) throw new Error('Ảnh không tồn tại');
    return downloadNode(node);
  });
}

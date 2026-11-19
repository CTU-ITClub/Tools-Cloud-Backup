import { requireMediaService, requirePublishedMedia } from '@/lib/service-auth';
import { sqlNode } from '@/lib/db';
import { downloadNode } from '@/lib/files';
import { imageVariantResponse } from '@/lib/media-variants';
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
    const variant = new URL(req.url).searchParams.get('size');
    if (variant === 'web' || variant === 'thumb') {
      try { return await imageVariantResponse(node, variant); }
      catch { return downloadNode(node); }
    }
    if (variant) return new Response('Kích thước không hợp lệ', { status: 400 });
    return downloadNode(node);
  });
}

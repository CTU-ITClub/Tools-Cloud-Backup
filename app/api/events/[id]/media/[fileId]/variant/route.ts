import { requireUser } from '@/lib/auth';
import { getEvent, sqlNode } from '@/lib/db';
import { canViewNode, downloadNode } from '@/lib/files';
import { imageVariantResponse, type ImageVariant } from '@/lib/media-variants';
import { handle } from '@/lib/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string; fileId: string }> };
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id, fileId } = await params;
    const event = getEvent(id);
    const node = sqlNode(fileId);
    if (!event || !node || node.kind !== 'file' || !canViewNode(node, user) ||
      !(node.id === event.poster_node_id || node.parent_id === event.recap_folder_id))
      return new Response('Không tìm thấy ảnh', { status: 404 });
    const variant = new URL(req.url).searchParams.get('size');
    if (variant !== 'thumb' && variant !== 'web') return new Response('Kích thước không hợp lệ', { status: 400 });
    try { return await imageVariantResponse(node, variant as ImageVariant); }
    catch (error) {
      console.error('Không tạo được ảnh tối ưu:', error);
      return downloadNode(node);
    }
  });
}

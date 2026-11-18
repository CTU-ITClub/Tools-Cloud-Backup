import { requireUser } from '@/lib/auth';
import { sqlNode } from '@/lib/db';
import { canViewNode, downloadNode } from '@/lib/files';
import { handle } from '@/lib/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const node = sqlNode((await params).id);
    if (!node || !canViewNode(node, user)) throw new Error('File không tồn tại');
    return downloadNode(node, new URL(req.url).searchParams.has('download'));
  });
}

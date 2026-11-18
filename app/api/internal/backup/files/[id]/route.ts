import { timingSafeEqual } from 'node:crypto';
import { sqlNode } from '@/lib/db';
import { downloadNode } from '@/lib/files';
import { internalBackupToken } from '@/lib/backup-settings';
import { handle } from '@/lib/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 900;
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const secret = internalBackupToken();
    const bearer = req.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
    const a = Buffer.from(secret);
    const b = Buffer.from(bearer);
    if (a.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const node = sqlNode((await params).id);
    if (!node || node.kind !== 'file') return new Response('Not found', { status: 404 });
    return downloadNode(node, true);
  });
}

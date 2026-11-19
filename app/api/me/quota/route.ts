import { requireUser } from '@/lib/auth';
import { usedBytes } from '@/lib/db';
import { ok } from '@/lib/http';
import { handle } from '@/lib/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok({ quota_bytes: user.quota_bytes, used_bytes: usedBytes(user.id) });
  });
}

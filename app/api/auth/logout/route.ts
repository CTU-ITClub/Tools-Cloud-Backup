import { removeSession } from '@/lib/auth';
import { secureMutation, ok } from '@/lib/http';
import { handle } from '@/lib/route';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    await removeSession();
    return ok({ ok: true });
  });
}

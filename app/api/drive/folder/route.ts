import { requireUser } from '@/lib/auth';
import { folder, validName, eventForNode } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    const user = await requireUser();
    const { parent_id, name } = await req.json();
    if (parent_id && eventForNode(parent_id))
      throw new Error('Thư mục sự kiện chỉ được chỉnh trong tab Sự kiện');
    return ok(folder(parent_id || null, user.id, validName(name)), 201);
  });
}

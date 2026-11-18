import { randomBytes } from 'node:crypto';
import { requireUser, requireAdmin, hash } from '@/lib/auth';
import { db, id, now, validName } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET() {
  return handle(async () => {
    requireAdmin(await requireUser());
    return ok(
      db()
        .prepare(
          'SELECT id,name,scope,created_at,revoked_at,last_used_at FROM media_service_tokens ORDER BY created_at DESC',
        )
        .all(),
    );
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    requireAdmin(await requireUser());
    const { name } = await req.json();
    const key = 'itcm_' + randomBytes(32).toString('base64url');
    const tokenId = id();
    db()
      .prepare(
        "INSERT INTO media_service_tokens(id,name,token_hash,scope,created_at) VALUES(?,?,?,'events:read',?)",
      )
      .run(tokenId, validName(name), hash(key), now());
    return ok({ id: tokenId, scope: 'events:read', token: key }, 201);
  });
}
export async function DELETE(req: Request) {
  return handle(async () => {
    secureMutation(req);
    requireAdmin(await requireUser());
    const { id } = await req.json();
    db()
      .prepare('UPDATE media_service_tokens SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
      .run(now(), id);
    return ok({ ok: true });
  });
}

import { requireUser, requireAdmin, validUsername, validPassword } from '@/lib/auth';
import { db, id, now, safeUser } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
import argon2 from 'argon2';
export const runtime = 'nodejs';
export async function GET() {
  return handle(async () => {
    requireAdmin(await requireUser());
    return ok(
      db()
        .prepare(
          'SELECT id,username,role,quota_bytes,disabled,can_manage_events,created_at FROM users ORDER BY created_at',
        )
        .all(),
    );
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    requireAdmin(await requireUser());
    const payload = await req.json();
    const username = validUsername(payload.username);
    const password = validPassword(payload.password);
    const key = id();
    db()
      .prepare(
        "INSERT INTO users(id,username,password_hash,role,can_manage_events,created_at) VALUES(?,?,?,'user',?,?)",
      )
      .run(key, username, await argon2.hash(password), payload.can_manage_events ? 1 : 0, now());
    return ok({ user: safeUser(key) }, 201);
  });
}
export async function PATCH(req: Request) {
  return handle(async () => {
    secureMutation(req);
    const admin = await requireUser();
    requireAdmin(admin);
    const data = await req.json();
    const target = safeUser(data.id);
    if (!target || target.role === 'admin') throw new Error('Không thể chỉnh tài khoản quản trị');
    db()
      .prepare('UPDATE users SET can_manage_events=?,disabled=? WHERE id=?')
      .run(data.can_manage_events ? 1 : 0, data.disabled ? 1 : 0, data.id);
    if (data.disabled) db().prepare('DELETE FROM sessions WHERE user_id=?').run(data.id);
    return ok({ user: safeUser(data.id) });
  });
}

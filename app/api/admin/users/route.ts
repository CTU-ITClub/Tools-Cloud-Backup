import { requireUser, requireAdmin, validUsername, validPassword } from '@/lib/auth';
import { db, id, now, safeUser, usedBytes } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
import argon2 from 'argon2';
export const runtime = 'nodejs';
function quota(value: unknown): number {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 0 || size > 10 * 1024 ** 4)
    throw new Error('Dung lượng giới hạn không hợp lệ');
  return size;
}
export async function GET() {
  return handle(async () => {
    requireAdmin(await requireUser());
    const users = db()
      .prepare(
        'SELECT id,username,role,quota_bytes,disabled,can_manage_events,created_at FROM users ORDER BY created_at',
      )
      .all() as { id: string }[];
    return ok(users.map((user) => ({ ...user, used_bytes: usedBytes(user.id) })));
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    requireAdmin(await requireUser());
    const payload = await req.json();
    const username = validUsername(payload.username);
    const password = validPassword(payload.password);
    const limit = quota(payload.quota_bytes ?? 0);
    const key = id();
    db()
      .prepare(
        "INSERT INTO users(id,username,password_hash,role,can_manage_events,quota_bytes,created_at) VALUES(?,?,?,'user',?,?,?)",
      )
      .run(
        key, username, await argon2.hash(password),
        payload.can_manage_events ? 1 : 0, limit, now(),
      );
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
    const nextLimit =
      data.quota_bytes === undefined ? target.quota_bytes : quota(data.quota_bytes);
    const nextEvents =
      data.can_manage_events === undefined ? target.can_manage_events : data.can_manage_events ? 1 : 0;
    const nextDisabled =
      data.disabled === undefined ? target.disabled : data.disabled ? 1 : 0;
    db()
      .prepare('UPDATE users SET can_manage_events=?,disabled=?,quota_bytes=? WHERE id=?')
      .run(nextEvents, nextDisabled, nextLimit, data.id);
    if (nextDisabled) db().prepare('DELETE FROM sessions WHERE user_id=?').run(data.id);
    return ok({ user: safeUser(data.id) });
  });
}

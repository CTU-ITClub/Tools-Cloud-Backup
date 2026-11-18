import { requireUser, verifyPassword, validPassword, removeSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { ok, secureMutation } from '@/lib/http';
import { handle } from '@/lib/route';
import argon2 from 'argon2';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    const user = await requireUser();
    const { old_password, password } = await req.json();
    const current = db().prepare('SELECT password_hash FROM users WHERE id=?').get(user.id) as {
      password_hash: string;
    };
    if (!(await verifyPassword(current.password_hash, old_password || '')))
      throw new Error('Mật khẩu cũ không đúng');
    const newHash = await argon2.hash(validPassword(password));
    db().transaction(() => {
      db().prepare('UPDATE users SET password_hash=? WHERE id=?').run(newHash, user.id);
      db().prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    })();
    await removeSession();
    return ok({ ok: true });
  });
}

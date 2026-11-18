import { db, id, now, safeUser } from '@/lib/db';
import { validUsername, validPassword, createSession, fixedEqual } from '@/lib/auth';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
import argon2 from 'argon2';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    const input = (await req.json()) as {
      username?: string;
      password?: string;
      setup_token?: string;
    };
    const name = validUsername(input.username);
    const pwd = validPassword(input.password);
    if (!process.env.SETUP_TOKEN || !fixedEqual(input.setup_token || '', process.env.SETUP_TOKEN))
      throw new Error('SETUP_TOKEN không đúng');
    const identifier = id();
    const passwordHash = await argon2.hash(pwd);
    db().transaction(() => {
      const row = db().prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
      if (row.count) throw new Error('Ứng dụng đã thiết lập');
      db()
        .prepare(
          "INSERT INTO users(id,username,password_hash,role,created_at,can_manage_events) VALUES(?,?,?,'admin',?,1)",
        )
        .run(identifier, name, passwordHash, now());
    })();
    await createSession(identifier);
    return ok({ user: safeUser(identifier) }, 201);
  });
}

import { db, safeUser } from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
const attempts = new Map<string, { count: number; expire: number }>();
export async function POST(req: Request) {
  return handle(async () => {
    secureMutation(req);
    const body = (await req.json()) as { username?: string; password?: string };
    const username = String(body.username || '').slice(0, 40);
    const key = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    const item = attempts.get(key) || { count: 0, expire: Date.now() + 900_000 };
    if (Date.now() > item.expire) {
      item.count = 0;
      item.expire = Date.now() + 900_000;
    }
    if (item.count >= 15) throw new Error('Quá nhiều lần đăng nhập, thử lại sau 15 phút');
    const row = db()
      .prepare('SELECT id,password_hash FROM users WHERE username=? AND disabled=0')
      .get(username) as { id: string; password_hash: string } | undefined;
    const good = !!row && (await verifyPassword(row.password_hash, body.password || ''));
    if (!good) {
      item.count++;
      attempts.set(key, item);
      throw new Error('Sai tên đăng nhập hoặc mật khẩu');
    }
    attempts.delete(key);
    await createSession(row.id);
    return ok({ user: safeUser(row.id) });
  });
}

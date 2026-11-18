import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { cookies } from 'next/headers';
import { db, id, now, safeUser } from './db';
import type { User } from './model';
import { appOrigin } from './config';

export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function validUsername(v: unknown): string {
  if (typeof v !== 'string' || !/^[a-z0-9_-]{3,40}$/i.test(v))
    throw new Error('Username phải gồm 3–40 ký tự a-z, 0-9, _ hoặc -');
  return v;
}
export function validPassword(p: unknown): string {
  if (typeof p !== 'string' || p.length < 10 || p.length > 1024)
    throw new Error('Mật khẩu phải dài 10–1024 ký tự');
  return p;
}
export async function sessionUser(): Promise<User | null> {
  const token = (await cookies()).get('tc_session')?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id FROM users u JOIN sessions s ON s.user_id=u.id
    WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0`,
    )
    .get(hash(token), now()) as { id: string } | undefined;
  return row ? safeUser(row.id) || null : null;
}
export async function requireUser(): Promise<User> {
  const user = await sessionUser();
  if (!user) throw new Error('Bạn cần đăng nhập');
  return user;
}
export function requireAdmin(u: User) {
  if (u.role !== 'admin') throw new Error('Chỉ quản trị viên được thao tác');
}
export function requireEventManager(u: User) {
  if (u.role !== 'admin' && u.can_manage_events !== 1)
    throw new Error('Bạn không có quyền quản lý sự kiện');
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  db()
    .prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .run(hash(token), userId, now() + 86400 * 30);
  (await cookies()).set('tc_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appOrigin.startsWith('https:'),
    path: '/',
    maxAge: 86400 * 30,
  });
}
export async function removeSession() {
  const jar = await cookies();
  const token = jar.get('tc_session')?.value;
  if (token) db().prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));
  jar.delete('tc_session');
}
export async function verifyPassword(hashString: string, password: string) {
  try {
    return await argon2.verify(hashString, password);
  } catch {
    return false;
  }
}
export function fixedEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

import { NextResponse } from 'next/server';
import { appOrigin } from './config';

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
export function fail(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : 'Có lỗi xảy ra';
  console.error('[api]', message);
  return NextResponse.json({ error: message }, { status });
}
export function secureMutation(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== appOrigin) throw new Error('Origin không hợp lệ');
  if (req.headers.get('x-requested-with') !== 'ITClub Media')
    throw new Error('Thiếu X-Requested-With');
}
export function jsonBody<T>(req: Request): Promise<T> {
  return req.json() as Promise<T>;
}

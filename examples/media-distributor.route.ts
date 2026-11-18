/**
 * Example for the consuming IT Club Website (Next.js App Router).
 * Copy to app/api/club-media/[id]/route.ts in the WEBSITE project.
 * Set MEDIA_CLOUD_ORIGIN and MEDIA_CLOUD_TOKEN as server-only env vars.
 * Never use NEXT_PUBLIC_ for the Bearer secret.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Invalid media ID', { status: 400 });
  const origin = process.env.MEDIA_CLOUD_ORIGIN;
  const token = process.env.MEDIA_CLOUD_TOKEN;
  if (!origin || !token)
    return NextResponse.json({ error: 'Missing server config' }, { status: 503 });
  const upstream = await fetch(`${origin.replace(/\/$/, '')}/api/integrations/media/files/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!upstream.ok || !upstream.body) return new Response('Image not available', { status: 404 });
  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=120',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

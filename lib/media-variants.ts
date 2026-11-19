import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { dataDir } from './config';
import type { Node } from './model';
import { downloadNode, isImage } from './files';

export type ImageVariant = 'thumb' | 'web';
const sizes: Record<ImageVariant, { width: number; quality: number }> = {
  thumb: { width: 480, quality: 69 },
  web: { width: 1600, quality: 80 },
};
const locks = new Map<string, Promise<void>>();
const directory = (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Ảnh không hợp lệ');
  return path.join(dataDir, 'media-variants', id);
};
const location = (id: string, variant: ImageVariant) => path.join(directory(id), `${variant}.webp`);

async function build(source: string, id: string) {
  const dir = directory(id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await Promise.all((Object.keys(sizes) as ImageVariant[]).map(async (variant) => {
    const tmp = path.join(dir, `${variant}-${randomUUID()}.tmp`);
    try {
      await sharp(source, { limitInputPixels: 80_000_000, failOn: 'error' })
        .rotate()
        .resize({ width: sizes[variant].width, withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: sizes[variant].quality, effort: 4 })
        .toFile(tmp);
      await rename(tmp, location(id, variant));
    } finally {
      await rm(tmp, { force: true }).catch(() => {});
    }
  }));
}

export async function generateImageVariants(source: string, nodeId: string) {
  const previous = locks.get(nodeId);
  if (previous) await previous;
  const job = build(source, nodeId);
  locks.set(nodeId, job);
  try { await job; } finally { if (locks.get(nodeId) === job) locks.delete(nodeId); }
}

export async function deleteImageVariants(nodeId: string) {
  await rm(directory(nodeId), { recursive: true, force: true });
}

export async function imageVariantResponse(node: Node, variant: ImageVariant) {
  if (!isImage(node.mime)) throw new Error('Không phải ảnh');
  let file = location(node.id, variant);
  try {
    await stat(file);
  } catch {
    const existing = locks.get(node.id);
    if (existing) await existing;
    else {
      const dir = directory(node.id);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const original = path.join(dir, `${randomUUID()}.source`);
      try {
        const response = await downloadNode(node);
        if (!response.body) throw new Error('Không đọc được file gốc');
        await pipeline(Readable.fromWeb(response.body as never), createWriteStream(original, { mode: 0o600 }));
        await generateImageVariants(original, node.id);
      } finally { await rm(original, { force: true }).catch(() => {}); }
    }
  }
  file = location(node.id, variant);
  const info = await stat(file);
  const stream = createReadStream(file);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(info.size),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

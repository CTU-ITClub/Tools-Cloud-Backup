import { requireAdmin, requireUser } from '@/lib/auth';
import { bots, checkBots, safeBotSettings } from '@/lib/bots';
import { BOTS_KEY, writePrivate, type BotSettings } from '@/lib/private-settings';
import { db } from '@/lib/db';
import { handle } from '@/lib/route';
import { ok, secureMutation } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function validate(input: unknown): BotSettings {
  if (!input || typeof input !== 'object') throw new Error('Dữ liệu bot không hợp lệ');
  const data = input as Record<string, unknown>;
  if (!Array.isArray(data.bots) || data.bots.length > 20) throw new Error('Tối đa 20 bot');
  const old = new Map(bots().map((b) => [b.name, b]));
  const seen = new Set<string>();
  const list = data.bots.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Bot không hợp lệ');
    const item = value as Record<string, unknown>;
    const name = String(item.name || '').trim();
    const chatId = String(item.chatId || '').trim();
    if (!/^[a-z][a-z0-9_-]{0,31}$/i.test(name) || seen.has(name))
      throw new Error('Tên bot trùng hoặc không hợp lệ');
    if (!/^-?\d+$/.test(chatId)) throw new Error('Chat ID không hợp lệ');
    const secret = String(item.token || '').trim();
    const token = secret || old.get(name)?.token || '';
    if (!/^\d+:[a-zA-Z0-9_-]+$/.test(token)) throw new Error(`Token của ${name} không hợp lệ`);
    seen.add(name);
    return { name, chatId, token };
  });
  for (const [name, previous] of old) {
    const current = list.find((b) => b.name === name);
    const used = db().prepare('SELECT 1 FROM parts WHERE account=? LIMIT 1').get(`bot:${name}`);
    if (
      used &&
      (!current || current.chatId !== previous.chatId || current.token !== previous.token)
    )
      throw new Error(`Bot ${name} có file đang sử dụng: không được xóa hoặc đổi token/chat ID`);
  }
  const concurrency = Number(data.concurrency ?? 2);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5)
    throw new Error('Số luồng phải từ 1 đến 5');
  if (data.mode !== 'auto' && data.mode !== 'tdlib') throw new Error('Chế độ lưu trữ không hợp lệ');
  return { bots: list, concurrency, mode: data.mode };
}
export async function GET(req: Request) {
  return handle(async () => {
    requireAdmin(await requireUser());
    return ok({
      ...safeBotSettings(),
      status: new URL(req.url).searchParams.get('check') === '1' ? await checkBots() : [],
    });
  });
}
export async function PUT(req: Request) {
  return handle(async () => {
    secureMutation(req);
    requireAdmin(await requireUser());
    const candidate = validate(await req.json());
    writePrivate(BOTS_KEY, candidate);
    return ok({ ...safeBotSettings(), status: [] });
  });
}

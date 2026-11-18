import { db, id, now } from './db';

export type TransferStage = 'receiving' | 'telegram' | 'done' | 'error';

export function startTransfer(userId: string, name: string, size: number, proposedId?: string) {
  const key = proposedId && /^[0-9a-f-]{36}$/i.test(proposedId) ? proposedId : id();
  db()
    .prepare(
      `INSERT INTO transfer_jobs(id,user_id,name,direction,stage,bytes_total,created_at,updated_at)
    VALUES(?, ?, ?, 'upload', 'receiving', ?, ?, ?)`,
    )
    .run(key, userId, name, size, now(), now());
  return key;
}
export function updateTransfer(key: string, stage: TransferStage, bytes: number, error?: string) {
  const column = stage === 'receiving' ? 'bytes_received' : 'bytes_remote';
  db()
    .prepare(
      `UPDATE transfer_jobs SET stage=?,${column}=?,error=?,updated_at=? WHERE id=? AND stage NOT IN ('done','error')`,
    )
    .run(stage, Math.max(0, Math.trunc(bytes)), error || null, now(), key);
}
export function failTransfer(key: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Không thể truyền dữ liệu';
  db()
    .prepare("UPDATE transfer_jobs SET stage='error',error=?,updated_at=? WHERE id=?")
    .run(message.slice(0, 350), now(), key);
}

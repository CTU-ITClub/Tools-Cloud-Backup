import { db, now } from './db';
import { hash } from './auth';
import { getEvent, eventForNode } from './db';

export function requireMediaService(req: Request) {
  const provided = req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!provided) throw new Error('Missing Bearer token');
  const row = db()
    .prepare(
      "SELECT id FROM media_service_tokens WHERE token_hash=? AND scope='events:read' AND revoked_at IS NULL",
    )
    .get(hash(provided)) as { id: string } | undefined;
  if (!row) throw new Error('Invalid or revoked media token');
  db().prepare('UPDATE media_service_tokens SET last_used_at=? WHERE id=?').run(now(), row.id);
  return row;
}
export function requirePublishedMedia(nodeId: string) {
  const event = eventForNode(nodeId);
  if (!event || event.published !== 1) throw new Error('Media chưa được xuất bản');
  const isPoster = event.poster_node_id === nodeId;
  const isRecap = db()
    .prepare(
      `WITH RECURSIVE parent(id,parent_id) AS (
   SELECT id,parent_id FROM nodes WHERE id=? UNION ALL
   SELECT n.id,n.parent_id FROM nodes n JOIN parent p ON n.id=p.parent_id
  ) SELECT 1 AS found FROM parent WHERE id=? LIMIT 1`,
    )
    .get(nodeId, event.recap_folder_id);
  if (!isPoster && !isRecap) throw new Error('Tệp không thuộc poster hoặc recap');
  return event;
}
export function publicEvent(id: string) {
  const e = getEvent(id);
  if (!e || !e.published) throw new Error('Sự kiện không được xuất bản');
  return e;
}

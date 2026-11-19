import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const source = (path) => readFileSync(path, 'utf8');
const ddl = source('lib/db.ts').match(/database\.exec\(`([\s\S]*?)`\);/)?.[1];

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(ddl);
  db.exec('ALTER TABLE users ADD COLUMN can_manage_events INTEGER NOT NULL DEFAULT 0');
  db.prepare("INSERT INTO users(id,username,password_hash,role,created_at) VALUES('owner','owner','hash','admin',1)").run();
  db.prepare("INSERT INTO users(id,username,password_hash,role,created_at) VALUES('reader','reader','hash','user',1)").run();
  return db;
}

test('Removing transfers deletes terminal jobs only for their owner', () => {
  const route = source('app/api/transfers/route.ts');
  assert.match(route, /secureMutation\(req\)/);
  assert.match(route, /id=\? AND user_id=\? AND stage IN \('done','error'\)/);
  assert.match(route, /dismissed_at=\?/);
  const db = database();
  const insert = db.prepare('INSERT INTO transfer_jobs(id,user_id,name,stage,bytes_total,created_at,updated_at) VALUES(?,?,?,?,10,1,1)');
  insert.run('finished', 'owner', 'f', 'done');
  insert.run('running', 'owner', 'r', 'telegram');
  insert.run('someone-else', 'reader', 'x', 'error');
  const remove = db.prepare("DELETE FROM transfer_jobs WHERE id=? AND user_id=? AND stage IN ('done','error')");
  remove.run('finished', 'owner');
  db.prepare('UPDATE transfer_jobs SET dismissed_at=5 WHERE id=\'running\' AND user_id=\'owner\'').run();
  remove.run('running', 'owner');
  remove.run('someone-else', 'owner');
  assert.deepEqual(db.prepare('SELECT id FROM transfer_jobs ORDER BY id').all().map((r) => r.id), ['running', 'someone-else']);
  assert.deepEqual(db.prepare('SELECT id FROM transfer_jobs WHERE dismissed_at IS NULL ORDER BY id').all().map((r) => r.id), ['someone-else']);
  db.close();
});

test('Event list hides missing posters and recap nodes without Telegram parts', () => {
  const list = source('app/api/events/route.ts');
  const sql = list.match(/`(SELECT e\.id,[\s\S]*?FROM events e WHERE \(\?=1 OR e\.published=1\) ORDER BY e\.created_at DESC)`/)?.[1];
  assert.ok(sql);
  const db = database();
  for (const [id, parent, name, kind] of [
    ['root', null, 'event', 'folder'], ['recap', 'root', 'recap', 'folder'],
    ['poster', 'root', 'poster.jpg', 'file'], ['image', 'recap', 'image.jpg', 'file'],
  ]) db.prepare('INSERT INTO nodes(id,owner,parent_id,name,kind,created_at,updated_at) VALUES(?,?,?,?,?,1,1)').run(id, 'owner', parent, name, kind);
  db.prepare("INSERT INTO events(id,slug,title,owner,folder_id,recap_folder_id,poster_node_id,published,created_at,updated_at) VALUES('e','e','Event','owner','root','recap','poster',1,1,1)").run();
  let item = db.prepare(sql).get(0);
  assert.equal(item.poster_node_id, null);
  assert.equal(item.recap_count, 0);
  db.prepare("INSERT INTO parts(node_id,part_index,chat_id,message_id,account,size) VALUES('poster',0,123,1,'main',20)").run();
  db.prepare("INSERT INTO parts(node_id,part_index,chat_id,message_id,account,size) VALUES('image',0,123,2,'main',20)").run();
  item = db.prepare(sql).get(0);
  assert.equal(item.poster_node_id, 'poster');
  assert.equal(item.recap_count, 1);
  db.close();
});

test('Recap stays private to event managers while service uses a read token', () => {
  assert.match(source('lib/files.ts'), /if \(node\.parent_id === event\.recap_folder_id\) return false/);
  assert.match(source('app/api/events/[id]/route.ts'), /canSeeRecap \? recap : \[\]/);
  assert.match(source('app/api/events/[id]/media/[fileId]/variant/route.ts'), /canViewNode\(node, user\)/);
  assert.match(source('app/api/integrations/media/files/[id]/route.ts'), /requireMediaService\(req\)/);
});

test('Optimized event images leave original uploads untouched and offer both sizes', () => {
  const variants = source('lib/media-variants.ts');
  assert.match(variants, /thumb: \{ width: 480/);
  assert.match(variants, /web: \{ width: 1600/);
  assert.match(variants, /withoutEnlargement: true/);
  assert.match(source('app/api/events/[id]/upload/route.ts'), /uploader\.id,\s*true,/);
  assert.match(source('app/api/integrations/media/events/[id]/route.ts'), /thumbnail_path:/);
  assert.match(source('lib/files.ts'), /generateImageVariants\(temp, value\.id\)/);
});

test('Quota management and Telegram account status are permission-scoped', () => {
  assert.match(source('app/api/admin/users/route.ts'), /requireAdmin\(admin\)/);
  assert.match(source('app/api/admin/users/route.ts'), /quota_bytes=\?/);
  assert.match(source('app/api/me/quota/route.ts'), /usedBytes\(user\.id\)/);
  assert.match(source('app/api/telegram/status/route.ts'), /requireAdmin\(await requireUser\(\)\)/);
  assert.match(source('app/page.tsx'), /tg\?\.ready \? \(/);
});

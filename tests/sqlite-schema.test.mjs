import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const source = readFileSync('lib/db.ts', 'utf8');
const ddl = source.match(/database\.exec\(`([\s\S]*?)`\);/)?.[1];
assert.ok(ddl, 'database DDL must be present');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(ddl);
  db.exec('ALTER TABLE users ADD COLUMN can_manage_events INTEGER NOT NULL DEFAULT 0');
  db.prepare(
    `INSERT INTO users(id,username,password_hash,role,created_at)
    VALUES('alice','alice','legacy-argon2','admin',123)`,
  ).run();
  return db;
}

test('Additive schema preserves legacy user and creates event/media tables', () => {
  const db = fixture();
  assert.equal(
    db.prepare("SELECT password_hash FROM users WHERE id='alice'").get().password_hash,
    'legacy-argon2',
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('nodes','parts','events','media_service_tokens')",
      )
      .get().n,
    4,
  );
  db.close();
});

test('Published event can be resolved from nested recap image', () => {
  const db = fixture();
  for (const [id, parent, name, kind] of [
    ['event', null, 'Demo Event', 'folder'],
    ['recap', 'event', 'recap', 'folder'],
    ['photo', 'recap', 'photo.jpg', 'file'],
  ]) {
    db.prepare(
      'INSERT INTO nodes(id,owner,parent_id,name,kind,created_at,updated_at) VALUES(?,?,?,?,?,1,1)',
    ).run(id, 'alice', parent, name, kind);
  }
  db.prepare(
    `INSERT INTO events(id,slug,title,owner,folder_id,recap_folder_id,published,created_at,updated_at)
    VALUES('event-1','demo','Demo','alice','event','recap',1,1,1)`,
  ).run();
  const row = db
    .prepare(
      `WITH RECURSIVE parents(id,parent_id) AS (
      SELECT id,parent_id FROM nodes WHERE id=? UNION ALL SELECT n.id,n.parent_id FROM nodes n JOIN parents p ON n.id=p.parent_id
    ) SELECT e.* FROM events e JOIN parents p ON e.folder_id=p.id LIMIT 1`,
    )
    .get('photo');
  assert.equal(row?.id, 'event-1');
  db.close();
});

test('Soft delete a directory marks descendants and permits reusing names', () => {
  const db = fixture();
  db.prepare(
    "INSERT INTO nodes(id,owner,name,kind,created_at,updated_at) VALUES('a','alice','Event','folder',1,1)",
  ).run();
  db.prepare(
    "INSERT INTO nodes(id,owner,parent_id,name,kind,created_at,updated_at) VALUES('b','alice','a','recap','folder',1,1)",
  ).run();
  db.prepare(
    `WITH RECURSIVE tree(id) AS (SELECT id FROM nodes WHERE id=? UNION ALL
    SELECT n.id FROM nodes n JOIN tree t ON n.parent_id=t.id)
    UPDATE nodes SET deleted_at=?,updated_at=? WHERE id IN (SELECT id FROM tree)`,
  ).run('a', 2, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nodes WHERE deleted_at=2').get().n, 2);
  db.prepare(
    "INSERT INTO nodes(id,owner,name,kind,created_at,updated_at) VALUES('c','alice','Event','folder',3,3)",
  ).run();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM nodes WHERE name='Event'").get().n, 2);
  db.close();
});

test('Service access tokens reject write scopes at database layer', () => {
  const db = fixture();
  assert.throws(() =>
    db
      .prepare(
        `INSERT INTO media_service_tokens(id,name,token_hash,scope,created_at)
    VALUES('id','test','hash','events:write',1)`,
      )
      .run(),
  );
  db.prepare(
    `INSERT INTO media_service_tokens(id,name,token_hash,scope,created_at)
    VALUES('id','test','hash','events:read',1)`,
  ).run();
  assert.equal(
    db.prepare("SELECT scope FROM media_service_tokens WHERE id='id'").get().scope,
    'events:read',
  );
  db.close();
});

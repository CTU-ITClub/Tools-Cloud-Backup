import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const ddl = readFileSync('lib/db.ts', 'utf8').match(/database\.exec\(`([\s\S]*?)`\);/)?.[1];
test('Bot files can be associated with distinct accounts and transfer states persist', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(ddl);
  db.prepare(
    "INSERT INTO users(id,username,password_hash,created_at) VALUES('owner','owner','hash',1)",
  ).run();
  db.prepare(
    `INSERT INTO transfer_jobs(id,user_id,name,bytes_total,created_at,updated_at) VALUES('job','owner','poster.png',100,1,1)`,
  ).run();
  db.prepare(
    "UPDATE transfer_jobs SET stage='telegram',bytes_received=100,bytes_remote=45 WHERE id='job'",
  ).run();
  const job = db
    .prepare("SELECT stage,bytes_received,bytes_remote FROM transfer_jobs WHERE id='job'")
    .get();
  assert.equal(job.stage, 'telegram');
  assert.equal(job.bytes_received, 100);
  assert.equal(job.bytes_remote, 45);
  db.prepare(
    "INSERT INTO bot_files(account,chat_id,message_id,file_id) VALUES('bot:one',-100,1,'file-A')",
  ).run();
  db.prepare(
    "INSERT INTO bot_files(account,chat_id,message_id,file_id) VALUES('bot:two',-100,1,'file-B')",
  ).run();
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM bot_files').get().c, 2);
  db.close();
});

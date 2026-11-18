import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { archive } = require('../scripts/backup-daemon.cjs');

test('Encrypted tar can be restored with the correct key, and rejects the wrong key', async () => {
  const root = mkdtempSync(join(tmpdir(), 'itclub-backup-'));
  const previous = process.env.BACKUP_ENCRYPTION_KEY;
  try {
    const source = join(root, 'source'),
      out = join(root, 'restored'),
      bad = join(root, 'wrong');
    mkdirSync(source);
    writeFileSync(join(source, 'sample.txt'), 'Sự kiện IT Club\nPoster và Recap');
    const file = join(root, 'sample.itcbak');
    const key = Buffer.alloc(32, 7);
    process.env.BACKUP_ENCRYPTION_KEY = key.toString('base64');
    await archive(source, file, key);
    assert.ok(!readFileSync(file).includes(Buffer.from('Sự kiện IT Club')));
    const correct = spawnSync(process.execPath, ['scripts/restore-backup.cjs', file, out], {
      env: process.env,
      encoding: 'utf8',
    });
    assert.equal(correct.status, 0, correct.stderr);
    assert.equal(readFileSync(join(out, 'sample.txt'), 'utf8'), 'Sự kiện IT Club\nPoster và Recap');
    const incorrect = spawnSync(process.execPath, ['scripts/restore-backup.cjs', file, bad], {
      env: { ...process.env, BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64') },
      encoding: 'utf8',
    });
    assert.notEqual(incorrect.status, 0);
  } finally {
    if (previous === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
    else process.env.BACKUP_ENCRYPTION_KEY = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

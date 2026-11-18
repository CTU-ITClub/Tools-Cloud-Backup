import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('Backup worker reads encrypted web settings without exposing OAuth refresh token', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'itclub-cfg-'));
  const original = process.env.DATA_DIR;
  process.env.DATA_DIR = home;
  const key = crypto.randomBytes(32);
  fs.writeFileSync(path.join(home, 'master.key'), key.toString('base64'));
  fs.writeFileSync(path.join(home, 'itclub-cloud.db'), 'placeholder');
  const settings = {
    clientId: 'example',
    clientSecret: 'secret',
    refreshToken: 'refresh-value',
    intervalHours: 6,
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(settings)), cipher.final()]);
  const value = 'enc:v1:' + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  assert.equal(value.includes(settings.refreshToken), false);
  const Module = require('node:module');
  const previous = Module._load;
  Module._load = function (request, ...args) {
    if (request === 'better-sqlite3')
      return class Database {
        prepare() {
          return { get: () => ({ value }) };
        }
        close() {}
      };
    return previous.call(this, request, ...args);
  };
  try {
    const { readPrivate } = require('../scripts/private-settings.cjs');
    assert.deepEqual(readPrivate('media:drive-backup:v1'), settings);
    const invalid = crypto.randomBytes(32);
    fs.writeFileSync(path.join(home, 'master.key'), invalid.toString('base64'));
    assert.throws(() => readPrivate('media:drive-backup:v1'));
  } finally {
    Module._load = previous;
    process.env.DATA_DIR = original;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

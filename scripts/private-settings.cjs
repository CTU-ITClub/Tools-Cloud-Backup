'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DATA = path.resolve(process.env.DATA_DIR || './data');
function readPrivate(key) {
  const current = path.join(DATA, 'itclub-cloud.db'),
    legacy = path.join(DATA, 'telecloud.db');
  if (!fs.existsSync(current) && !fs.existsSync(legacy)) return null;
  const Database = require('better-sqlite3');
  const connection = new Database(fs.existsSync(legacy) ? legacy : current, {
    readonly: true,
    fileMustExist: true,
  });
  let row;
  try {
    row = connection.prepare('SELECT value FROM settings WHERE key=?').get(key);
  } finally {
    connection.close();
  }
  if (!row) return null;
  if (!row.value.startsWith('enc:v1:')) throw new Error('Cấu hình bảo mật không được mã hóa');
  const source =
    process.env.MASTER_KEY || fs.readFileSync(path.join(DATA, 'master.key'), 'utf8').trim();
  const master = Buffer.from(source, 'base64');
  if (master.length !== 32) throw new Error('Khóa dữ liệu không hợp lệ');
  const raw = Buffer.from(row.value.slice(7), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', master, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'),
  );
}
module.exports = { readPrivate };

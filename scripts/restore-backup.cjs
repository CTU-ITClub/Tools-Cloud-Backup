'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const { backupKey } = require('./backup-daemon.cjs');
async function main() {
  const input = process.argv[2],
    out = process.argv[3];
  if (!input || !out)
    throw new Error('Cách dùng: npm run backup:restore -- /path/file.itcbak /path/empty-directory');
  const target = path.resolve(out);
  await fsp.mkdir(target, { recursive: true });
  if ((await fsp.readdir(target)).length) throw new Error('Thư mục khôi phục phải rỗng');
  const fd = await fsp.open(input, 'r');
  const size = (await fd.stat()).size;
  const magic = Buffer.alloc(9),
    iv = Buffer.alloc(12),
    tag = Buffer.alloc(16);
  try {
    await fd.read(magic, 0, 9, 0);
    await fd.read(iv, 0, 12, 9);
    await fd.read(tag, 0, 16, size - 16);
  } finally {
    await fd.close();
  }
  if (!magic.equals(Buffer.from('ITCLUBBK1')) || size < 37)
    throw new Error('File backup không hợp lệ');
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'itclub-restore-'));
  try {
    const unpack = path.join(temp, 'verified.tar.gz');
    const decipher = crypto.createDecipheriv('aes-256-gcm', backupKey(), iv);
    decipher.setAuthTag(tag);
    await pipeline(
      fs.createReadStream(input, { start: 21, end: size - 17 }),
      decipher,
      fs.createWriteStream(unpack, { flags: 'wx', mode: 0o600 }),
    );
    const tar = spawn('tar', ['-xzf', unpack, '-C', target, '--no-same-owner'], {
      stdio: ['ignore', 'inherit', 'pipe'],
    });
    let errors = '';
    tar.stderr.on('data', (v) => {
      errors += String(v).slice(0, 300);
    });
    const code = await new Promise((resolve, reject) => {
      tar.once('error', reject);
      tar.once('exit', resolve);
    });
    if (code !== 0) throw new Error(`tar: ${errors}`);
    console.log('Đã giải mã vào:', target);
    console.log('Kiểm tra manifest.json và database.sqlite trước khi đưa vào DATA_DIR.');
  } finally {
    await fsp.rm(temp, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const client = process.env.GOOGLE_DRIVE_CLIENT_ID;
const secret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
if (!client || !secret) {
  console.error('Cần GOOGLE_DRIVE_CLIENT_ID và GOOGLE_DRIVE_CLIENT_SECRET trong .env');
  process.exit(1);
}
const redirect = 'http://127.0.0.1:42831/oauth2callback';
const state = crypto.randomBytes(24).toString('hex');
const link = new URL('https://accounts.google.com/o/oauth2/v2/auth');
for (const [k, v] of Object.entries({
  client_id: client,
  redirect_uri: redirect,
  response_type: 'code',
  access_type: 'offline',
  prompt: 'consent',
  scope: 'https://www.googleapis.com/auth/drive.file',
  state,
}))
  link.searchParams.set(k, v);
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', redirect);
  if (u.pathname !== '/oauth2callback') {
    res.writeHead(404).end();
    return;
  }
  if (u.searchParams.get('state') !== state) {
    res.writeHead(400).end('Invalid OAuth state');
    return;
  }
  if (u.searchParams.has('error')) {
    res.writeHead(400).end('OAuth rejected');
    return;
  }
  try {
    const params = new URLSearchParams({
      client_id: client,
      client_secret: secret,
      code: u.searchParams.get('code') || '',
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    });
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await response.json();
    if (!response.ok || !data.refresh_token)
      throw new Error(data.error_description || 'No refresh token');
    console.log('\nGOOGLE_DRIVE_REFRESH_TOKEN=' + data.refresh_token + '\n');
    res
      .writeHead(200, { 'Content-Type': 'text/plain' })
      .end('Đã kết nối. Quay lại terminal để lưu refresh token.');
  } catch (err) {
    res.writeHead(500).end('OAuth failed');
    console.error(err.message);
  }
  server.close();
});
server.listen(42831, '127.0.0.1', () => {
  console.log('Mở liên kết này và cấp quyền truy cập Drive:\n' + link.toString());
});

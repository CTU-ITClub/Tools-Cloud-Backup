import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const get = (p) => readFileSync(join(root, p), 'utf8');

test('Read-only service endpoint verifies bearer on each request', () => {
  for (const p of [
    'app/api/integrations/media/events/route.ts',
    'app/api/integrations/media/events/[id]/route.ts',
    'app/api/integrations/media/files/[id]/route.ts',
  ])
    assert.match(get(p), /requireMediaService\(req\)/);
});
test('Media stream is gated on published event and node ancestry', () => {
  const f = get('lib/service-auth.ts');
  assert.match(f, /published !== 1/);
  assert.match(f, /recap_folder_id/);
  assert.match(f, /poster_node_id/);
});
test('Media mutations require event permission', () => {
  for (const p of [
    'app/api/events/route.ts',
    'app/api/events/[id]/route.ts',
    'app/api/events/[id]/upload/route.ts',
  ])
    assert.match(get(p), /requireEventManager/);
});
test('Native worker uses the precompiled tdjson C ABI', () => {
  const src = get('lib/native/tdlib-worker.cjs');
  for (const name of ['td_create_client_id', 'td_send', 'td_receive', 'td_execute'])
    assert.match(src, new RegExp(name));
});

/* Native TDLib JSON client. This dedicated worker is the ONLY td_receive caller. */
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
let ffi;
let client = null;
let state = { '@type': 'starting' };

function emit(payload) { parentPort.postMessage(payload); }
function send(request) {
  ffi.send(client, JSON.stringify(request));
}
function safeSend(request) {
  try { send(request); } catch (error) { emit({ kind: 'error', error: String(error) }); }
}
function processState(value) {
  state = value;
  emit({ kind: 'state', state });
  switch (value['@type']) {
    case 'authorizationStateWaitTdlibParameters':
      safeSend({
        '@type': 'setTdlibParameters',
        use_test_dc: false,
        database_directory: workerData.databaseDirectory,
        files_directory: workerData.filesDirectory,
        database_encryption_key: workerData.masterKey,
        use_file_database: true,
        use_chat_info_database: true,
        use_message_database: true,
        use_secret_chats: false,
        api_id: workerData.apiId,
        api_hash: workerData.apiHash,
        system_language_code: 'vi',
        device_model: 'ITClub Next Cloud',
        system_version: 'Linux',
        application_version: '2.0.0',
        enable_storage_optimizer: true,
      });
      break;
    case 'authorizationStateWaitEncryptionKey':
      safeSend({ '@type': 'checkDatabaseEncryptionKey', encryption_key: workerData.masterKey });
      break;
    case 'authorizationStateWaitPhoneNumber':
      safeSend({ '@type': 'requestQrCodeAuthentication', other_user_ids: [] });
      break;
  }
}

try {
  if (!fs.existsSync(workerData.library)) throw new Error(`TDLib not found: ${workerData.library}`);
  fs.mkdirSync(workerData.databaseDirectory, { recursive: true });
  fs.mkdirSync(workerData.filesDirectory, { recursive: true });
  const koffi = require('koffi');
  const lib = koffi.load(path.resolve(workerData.library));
  ffi = {
    create: lib.func('int td_create_client_id(void)'),
    send: lib.func('void td_send(int client_id, const char *request)'),
    receive: lib.func('const char *td_receive(double timeout)'),
    execute: lib.func('const char *td_execute(const char *request)'),
  };
  ffi.execute(JSON.stringify({ '@type': 'setLogVerbosityLevel', new_verbosity_level: 1 }));
  client = ffi.create();
  parentPort.on('message', (msg) => {
    if (msg?.kind === 'call') safeSend({ ...msg.payload, '@extra': msg.id });
  });
  safeSend({ '@type': 'getAuthorizationState' });
  emit({ kind: 'loaded' });
  const poll = () => {
    try {
      const result = ffi.receive(0.1);
      if (result) {
        const update = JSON.parse(result);
        if (update['@client_id'] === undefined || update['@client_id'] === client) {
          if (update['@type'] === 'updateAuthorizationState') processState(update.authorization_state);
          else if (update['@type']?.startsWith('authorizationState')) processState(update);
          emit({ kind: 'update', payload: update });
        }
      }
    } catch (err) { emit({ kind: 'error', error: String(err) }); }
    setImmediate(poll);
  };
  poll();
} catch (err) {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[TDLib] Initialization failed: ${message}`);
  emit({ kind: 'fatal', error: message });
  // Let the parent receive the useful error, then terminate with a failure code.
  process.exitCode = 1;
  parentPort.close();
}

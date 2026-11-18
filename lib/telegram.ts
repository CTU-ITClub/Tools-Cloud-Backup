import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { dataDir, masterKey, tdlibPath } from './config';
import { db } from './db';

export type TdObject = Record<string, any>;

class TdClient extends EventEmitter {
  state: TdObject = { '@type': 'starting' };
  error: string | null = null;
  worker?: Worker;
  private pending = new Map<string, { resolve: (v: TdObject) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  constructor() {
    super();
    const savedId = db().prepare("SELECT value FROM settings WHERE key='tg_api_id'").get() as { value: string } | undefined;
    const apiId = Number(process.env.TELEGRAM_API_ID || savedId?.value || 0);
    const apiHash = process.env.TELEGRAM_API_HASH || '';
    if (!apiId || !apiHash) {
      this.error = 'Cần cấu hình TELEGRAM_API_ID và TELEGRAM_API_HASH trong .env';
      return;
    }
    try {
      const workerPath = path.join(process.cwd(), 'lib/native/tdlib-worker.cjs');
      this.worker = new Worker(workerPath, {
        workerData: {
          library: tdlibPath,
          apiId,
          apiHash,
          masterKey: masterKey(),
          databaseDirectory: path.join(dataDir, 'tdlib/main'),
          filesDirectory: path.join(dataDir, 'tdlib/main/files'),
        },
      });
      this.worker.on('message', (msg) => {
        if (msg.kind === 'state') this.state = msg.state;
        if (msg.kind === 'error') this.error = msg.error;
        if (msg.kind === 'fatal') {
          this.error = msg.error;
          this.state = { '@type': 'stopped' };
          this.rejectAll(new Error(msg.error));
        }
        if (msg.kind === 'update') {
          const obj = msg.payload as TdObject;
          const id = obj['@extra'];
          if (id && this.pending.has(id)) {
            const pending = this.pending.get(id)!;
            this.pending.delete(id);
            clearTimeout(pending.timer);
            obj['@type'] === 'error'
              ? pending.reject(new Error(`TDLib ${obj.code}: ${obj.message}`))
              : pending.resolve(obj);
          }
          this.emit('update', obj);
        }
      });
      this.worker.on('error', (err) => { this.error = err.message; this.rejectAll(err); });
      this.worker.on('exit', (code) => {
        // An initialization failure is reported via 'fatal' just before exiting.
        // Preserve that message instead of overwriting it with 'exited (0)'.
        this.error ||= `TDLib worker exited (${code})`;
        this.state = { '@type': 'stopped' };
        this.worker = undefined;
        this.rejectAll(new Error(this.error));
      });
    } catch (err) { this.error = String(err); }
  }
  private rejectAll(error: Error) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear();
  }
  ready() { return this.state['@type'] === 'authorizationStateReady'; }
  async call(payload: TdObject, timeoutMs = 180_000): Promise<TdObject> {
    if (!this.worker || this.error) throw new Error(this.error || 'TDLib không khả dụng');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('TDLib timeout')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ kind: 'call', id, payload });
    });
  }
  async chatId(): Promise<number> {
    const target = db().prepare("SELECT value FROM settings WHERE key='storage_chat'").get() as {value:string}|undefined;
    const choice = target?.value || process.env.STORAGE_CHAT || 'me';
    if (choice === 'me') {
      const me = await this.call({ '@type': 'getMe' });
      const chat = await this.call({ '@type': 'createPrivateChat', user_id: me.id, force: false });
      return chat.id;
    }
    if (/^-?\d+$/.test(choice)) {
      const chatId = Number(choice);
      if (!Number.isSafeInteger(chatId)) throw new Error('Storage Chat ID không hợp lệ');
      const isKnownChat = async () => {
        try {
          await this.call({ '@type': 'getChat', chat_id: chatId }, 10_000);
          return true;
        } catch (error) {
          if (/TDLib 400: Chat not found/i.test(String(error))) return false;
          throw error;
        }
      };
      if (await isKnownChat()) return chatId;

      // TDLib's getChat only sees chats already loaded into this session.
      for (const chatList of [null, { '@type': 'chatListArchive' }]) {
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            await this.call({ '@type': 'loadChats', chat_list: chatList, limit: 100 }, 30_000);
          } catch (error) {
            // TDLib returns 404 when this chat list has been fully loaded.
            if (/TDLib 404:/.test(String(error))) break;
            throw error;
          }
          if (await isKnownChat()) return chatId;
        }
      }
      throw new Error(
        `Không tìm thấy nhóm Telegram ${choice}. Hãy kiểm tra đúng Chat ID, ` +
        'tài khoản đăng nhập TDLib đã tham gia nhóm và có quyền gửi file. ' +
        'Nếu nhóm công khai, bạn có thể dùng @username thay cho ID.'
      );
    }
    const chat = await this.call({ '@type': 'searchPublicChat', username: choice.replace(/^@/, '') });
    return chat.id;
  }
  async sendDocument(filePath: string, name: string, onProgress?: (bytes: number) => void) {
    if (!this.ready()) throw new Error('Cần đăng nhập Telegram trước khi upload');
    const chat = await this.chatId();
    return new Promise<{ chatId: number; messageId: number }>((resolve, reject) => {
      let tempId: number | null = null;
      let fileId: number | null = null;
      let finished = false;
      const earlySuccess: { value: TdObject | null } = { value: null };
      const timeout = setTimeout(() => finish(new Error('Telegram upload timeout')), 15 * 60_000);
      const onUpdate = (msg: TdObject) => {
        if (msg['@type'] === 'updateFile' && fileId != null && msg.file?.id === fileId) {
          onProgress?.(Number(msg.file.remote?.uploaded_size || 0));
        }
        if (msg['@type'] === 'updateMessageSendSucceeded' && msg.message?.chat_id === chat) {
          if (tempId === null) { earlySuccess.value = msg; return; }
          if (msg.old_message_id === tempId) finish(null, msg.message.id);
        }
        if (msg['@type'] === 'updateMessageSendFailed' && msg.message?.chat_id === chat && msg.old_message_id === tempId) {
          finish(new Error(msg.error?.message || 'Telegram send failed'));
        }
      };
      const finish = (error: Error | null, messageId?: number) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        this.off('update', onUpdate);
        if (error) reject(error);
        else resolve({ chatId: chat, messageId: messageId! });
      };
      this.on('update', onUpdate);
      this.call({
        '@type': 'sendMessage',
        chat_id: chat,
        input_message_content: {
          '@type': 'inputMessageDocument',
          document: { '@type': 'inputDocument', document: { '@type': 'inputFileLocal', path: filePath }, disable_content_type_detection: true },
          caption: { '@type': 'formattedText', text: name, entities: [] },
        },
      }, 15 * 60_000).then((message) => {
        tempId = message.id;
        fileId = message.content?.document?.document?.id || null;
        if (!message.sending_state) finish(null, message.id);
        else if (earlySuccess.value && earlySuccess.value.old_message_id === tempId) finish(null, earlySuccess.value.message.id);
      }).catch((err) => finish(err));
    });
  }
  async deleteMessage(chatId: number, messageId: number) {
    return this.call({ '@type': 'deleteMessages', chat_id: chatId, message_ids: [messageId], revoke: true });
  }
  async localPath(chatId: number, messageId: number): Promise<string> {
    const msg = await this.call({ '@type': 'getMessage', chat_id: chatId, message_id: messageId });
    const content = msg.content;
    const file = content?.['@type'] === 'messageDocument' ? content.document?.document
      : content?.['@type'] === 'messagePhoto' ? content.photo?.sizes?.at(-1)?.photo
      : content?.['@type'] === 'messageVideo' ? content.video?.video : null;
    if (!file?.id) throw new Error('Tin nhắn Telegram không còn file');
    const result = await this.call({ '@type': 'downloadFile', file_id: file.id, priority: 32, offset: 0, limit: 0, synchronous: true }, 15 * 60_000);
    const localPath = result.local?.path;
    if (!localPath || !result.local?.is_downloading_completed) throw new Error('Telegram chưa tải hoàn tất file');
    return localPath;
  }
}

const singleton = globalThis as typeof globalThis & { __clubTd?: TdClient };
export function telegram(): TdClient { return singleton.__clubTd ||= new TdClient(); }

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'ITClub Media');
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const result = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!result.ok) {
    const payload = await result.json().catch(() => ({}));
    throw new Error(payload.error || `HTTP ${result.status}`);
  }
  return result.json();
}
export const post = <T = any>(url: string, data: unknown): Promise<T> =>
  api<T>(url, { method: 'POST', body: JSON.stringify(data) });
export const patch = <T = any>(url: string, data: unknown): Promise<T> =>
  api<T>(url, { method: 'PATCH', body: JSON.stringify(data) });
export const del = (url: string, data?: unknown) =>
  api(url, { method: 'DELETE', body: data === undefined ? undefined : JSON.stringify(data) });

export function uploadFile(
  path: string,
  file: File,
  extra: Record<string, string> = {},
  options: {
    id?: string;
    signal?: AbortSignal;
    onProgress?: (sent: number, total: number) => void;
  } = {},
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Requested-With', 'ITClub Media');
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    if (options.id) xhr.setRequestHeader('X-Transfer-Id', options.id);
    Object.entries(extra).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    const abort = () => xhr.abort();
    const finish = () => options.signal?.removeEventListener('abort', abort);
    options.signal?.addEventListener('abort', abort, { once: true });
    xhr.upload.onprogress = (event) => options.onProgress?.(event.loaded, file.size);
    xhr.onload = () => {
      finish();
      let result: { error?: string } = {};
      try {
        result = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(file.size, file.size);
        resolve(result);
      } else reject(new Error(result.error || `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => {
      finish();
      reject(new Error('Mất kết nối khi tải tệp lên'));
    };
    xhr.onabort = () => {
      finish();
      reject(new Error('Đã hủy tải lên'));
    };
    if (options.signal?.aborted) {
      finish();
      reject(new Error('Đã hủy tải lên'));
      return;
    }
    xhr.send(file);
  });
}

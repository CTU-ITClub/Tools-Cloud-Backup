import { fail } from './http';
export async function handle(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = /đăng nhập|Missing Bearer|Invalid or revoked/i.test(message)
      ? 401
      : /quyền|Origin|được xuất bản|Thiếu X-Requested-With|không thuộc poster/i.test(message)
        ? 403
        : /không tồn tại/i.test(message)
          ? 404
          : 400;
    return fail(error, status);
  }
}

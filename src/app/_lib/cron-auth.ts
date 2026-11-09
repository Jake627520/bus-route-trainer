import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Change 52: 驗證 Vercel cron 帶的 `Authorization: Bearer $CRON_SECRET`。
 * - 伺服器沒設定密鑰（或只有空白）→ 一律拒絕，絕不因為「密鑰是空的」而放行。
 * - 以雜湊後定時比較，避免從回應時間猜出密鑰。
 */
export function isAuthorizedCron(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

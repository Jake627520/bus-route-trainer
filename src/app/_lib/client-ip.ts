/**
 * Change 49: 取得用戶端 IP，供限流用。
 * 讀 x-forwarded-for 的第一個值（Vercel 由平台設定；上線後需用真實請求驗證）。
 * 取不到時回共用 key "unknown"——寧可保守限流，也不讓請求跳過限制。
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first ? first : 'unknown';
}

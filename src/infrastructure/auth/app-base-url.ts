/**
 * 對外連結（例如重設密碼信）的 base URL。
 *
 * 不從 request 取 origin：request.url 由 Host / X-Forwarded-Host 組成，
 * 偽造時重設連結會指向攻擊者網域，token 外洩（password reset poisoning）。
 * - APP_URL 有設 → 一律用它（只取 origin）。
 * - production 沒設 → throw（fail closed，不寄信）。
 * - 非 production 沒設 → 用 request origin（本機開發方便）。
 */
export function getAppBaseUrl(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error(`APP_URL is not a valid URL: ${configured}`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(`APP_URL must be an http(s) URL: ${configured}`);
    }
    return url.origin;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_URL must be set in production (reset links must not be built from the request host).');
  }
  return new URL(request.url).origin;
}

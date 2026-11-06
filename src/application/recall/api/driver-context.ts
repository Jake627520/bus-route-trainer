import { timingSafeEqual } from 'node:crypto';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { readSessionDriverId } from '@/infrastructure/auth/session-cookie';

export class ClientSuppliedDriverIdError extends Error {
  constructor(message = 'Client is strictly forbidden from specifying driverId. Identity is resolved server-side.') {
    super(message);
    this.name = 'ClientSuppliedDriverIdError';
  }
}

/**
 * Validates that an incoming payload (e.g., parsed JSON body) does not contain a client-supplied driverId.
 * Throws ClientSuppliedDriverIdError if driverId is present.
 */
export function assertNoClientDriverId(payload: unknown): void {
  if (payload && typeof payload === 'object' && 'driverId' in (payload as Record<string, unknown>)) {
    throw new ClientSuppliedDriverIdError();
  }
}

/**
 * Validates that URL query parameters or search params do not contain driverId.
 * Throws ClientSuppliedDriverIdError if driverId is present.
 */
export function assertNoDriverIdInUrl(urlOrRequest: string | Request): void {
  const url = typeof urlOrRequest === 'string' ? new URL(urlOrRequest, 'http://localhost') : new URL(urlOrRequest.url);
  if (url.searchParams.has('driverId')) {
    throw new ClientSuppliedDriverIdError();
  }
}

const MIN_UPSTREAM_SECRET_LENGTH = 32;

/** 上游 gateway 必須帶出與 UPSTREAM_AUTH_SECRET 相符的 x-upstream-auth-secret（常數時間比對）。 */
function hasValidUpstreamSecret(request: Request): boolean {
  const expected = process.env.UPSTREAM_AUTH_SECRET ?? '';
  if (expected.length < MIN_UPSTREAM_SECRET_LENGTH) return false;
  const presented = Buffer.from(request.headers.get('x-upstream-auth-secret') ?? '');
  const want = Buffer.from(expected);
  return presented.length === want.length && timingSafeEqual(presented, want);
}

export class UnauthenticatedError extends Error {
  constructor(message = 'Authentication required. No trusted driver identity provided.') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

/**
 * P0 Security Invariant:
 * Authoritatively resolves the driver identity from the server-side context.
 *
 * TRUST BOUNDARY SPECIFICATION:
 * - In automated integration test environments (`NODE_ENV === 'test'`) or development (`NODE_ENV === 'development'`),
 *   it supports 'x-authenticated-driver-id' for multi-driver tenant isolation, or defaults to DEFAULT_DRIVER_ID.
 * - In trusted gateway mode (`TRUST_UPSTREAM_DRIVER_HEADER === 'true'`), accepts the upstream identity header ONLY when
 *   the request also carries `x-upstream-auth-secret` equal to `UPSTREAM_AUTH_SECRET` (>= 32 chars). Without the secret
 *   any client could send `x-authenticated-driver-id` directly (nothing in front of Vercel strips it) and impersonate
 *   any driver. Flag on but secret missing/short -> fail closed (401).
 * - In production without trusted gateway identity: throws UnauthenticatedError -> maps to HTTP 401 UNAUTHENTICATED.
 *   NEVER falls back to default driver in production, preventing authentication bypass or data misplacement.
 * - Client-supplied query params or body fields named 'driverId' are unconditionally forbidden (HTTP 400).
 */
export async function resolveAuthenticatedDriver(request?: Request): Promise<string> {
  if (request) {
    assertNoDriverIdInUrl(request);

    // Change 26: 登入 session cookie 是第一等身分，跨環境有效（不需 trusted gateway）。
    const sessionDriverId = await readSessionDriverId(request);
    if (sessionDriverId) {
      return sessionDriverId;
    }
  }

  const isTestEnv = process.env.NODE_ENV === 'test';
  const isDevEnv = process.env.NODE_ENV === 'development';
  const isTrustedGateway = process.env.TRUST_UPSTREAM_DRIVER_HEADER === 'true';

  // 1. Trusted gateway mode (production or staging behind trusted reverse proxy)
  if (isTrustedGateway && request) {
    if (!hasValidUpstreamSecret(request)) {
      throw new UnauthenticatedError();
    }
    const authHeader = request.headers.get('x-authenticated-driver-id');
    if (authHeader && authHeader.trim().length > 0) {
      return authHeader.trim();
    }
    throw new UnauthenticatedError();
  }

  // 2. Test or local development environment seam
  if (isTestEnv || isDevEnv) {
    if (request) {
      const authHeader = request.headers.get('x-authenticated-driver-id');
      if (authHeader && authHeader.trim().length > 0) {
        return authHeader.trim();
      }
    }
    return DEFAULT_DRIVER_ID;
  }

  // 3. Production environment without trusted gateway identity: strictly reject
  throw new UnauthenticatedError();
}

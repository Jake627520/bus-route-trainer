import { describe, it, expect } from 'vitest';
import {
  resolveAuthenticatedDriver,
  assertNoClientDriverId,
  assertNoDriverIdInUrl,
  ClientSuppliedDriverIdError,
  UnauthenticatedError,
} from '@/application/recall/api/driver-context';
import { handleApiError } from '@/application/recall/api/error-mapper';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { DriverNotEnrolledError } from '@/application/recall/start-planned-recall-session-use-case';
import {
  SessionNotFoundError,
  SessionOwnershipError,
  SessionNotActiveError,
  PromptIndexMismatchError,
  IdempotencyConflictError,
} from '@/application/recall/submit-session-answer-use-case';
import { CannotAbandonCompletedSessionError } from '@/application/recall/abandon-recall-session-use-case';

describe('Change 09 Auth & Error Boundary Contract Unit Tests', () => {
  describe('P0 Security Invariant: driver-context', () => {
    it('authoritatively resolves default driver ID when no driverId in request', () => {
      const driverId = resolveAuthenticatedDriver();
      expect(driverId).toBe(DEFAULT_DRIVER_ID);
    });

    it('throws ClientSuppliedDriverIdError when payload contains driverId', () => {
      expect(() => {
        assertNoClientDriverId({ routeId: 'R66', driverId: 'hacker_driver' });
      }).toThrow(ClientSuppliedDriverIdError);
    });

    it('passes assertion when payload does NOT contain driverId', () => {
      expect(() => {
        assertNoClientDriverId({ routeId: 'R66', variantKey: 'R66_0' });
      }).not.toThrow();
    });

    it('throws ClientSuppliedDriverIdError when URL contains driverId query param', () => {
      expect(() => {
        assertNoDriverIdInUrl('http://localhost/api/recall/sessions/123?driverId=hacker_driver');
      }).toThrow(ClientSuppliedDriverIdError);
    });

    it('resolves authenticated driver from header in test environment', () => {
      const req = new Request('http://localhost/api/test', {
        headers: { 'x-authenticated-driver-id': 'mock-driver-auth' },
      });
      expect(resolveAuthenticatedDriver(req)).toBe('mock-driver-auth');
    });

    // Test 1: Production + spoofed header + no trusted gateway -> throws UnauthenticatedError
    it('1. throws UnauthenticatedError in production when client passes spoofed header without trusted gateway', () => {
      const origEnv = process.env.NODE_ENV;
      const origTrust = process.env.TRUST_UPSTREAM_DRIVER_HEADER;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        delete process.env.TRUST_UPSTREAM_DRIVER_HEADER;

        const req = new Request('http://localhost/api/test', {
          headers: { 'x-authenticated-driver-id': 'spoofed-driver' },
        });
        expect(() => resolveAuthenticatedDriver(req)).toThrow(UnauthenticatedError);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
        if (origTrust !== undefined) {
          process.env.TRUST_UPSTREAM_DRIVER_HEADER = origTrust;
        }
      }
    });

    // Test 2: Production + no identity -> throws UnauthenticatedError
    it('2. throws UnauthenticatedError in production when request has no identity', () => {
      const origEnv = process.env.NODE_ENV;
      const origTrust = process.env.TRUST_UPSTREAM_DRIVER_HEADER;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        delete process.env.TRUST_UPSTREAM_DRIVER_HEADER;

        const req = new Request('http://localhost/api/test');
        expect(() => resolveAuthenticatedDriver(req)).toThrow(UnauthenticatedError);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
        if (origTrust !== undefined) {
          process.env.TRUST_UPSTREAM_DRIVER_HEADER = origTrust;
        }
      }
    });

    // Test 3: Production + trusted gateway identity -> resolves verified driver
    it('3. resolves verified driver in production when trusted gateway flag is enabled', () => {
      const origEnv = process.env.NODE_ENV;
      const origTrust = process.env.TRUST_UPSTREAM_DRIVER_HEADER;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        process.env.TRUST_UPSTREAM_DRIVER_HEADER = 'true';

        const req = new Request('http://localhost/api/test', {
          headers: { 'x-authenticated-driver-id': 'gateway-verified-driver' },
        });
        expect(resolveAuthenticatedDriver(req)).toBe('gateway-verified-driver');
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
        if (origTrust !== undefined) {
          process.env.TRUST_UPSTREAM_DRIVER_HEADER = origTrust;
        } else {
          delete process.env.TRUST_UPSTREAM_DRIVER_HEADER;
        }
      }
    });

    // Test 4: Test environment + test header -> maintains current testing seam
    it('4. resolves authenticated driver from test header in test environment', () => {
      const req = new Request('http://localhost/api/test', {
        headers: { 'x-authenticated-driver-id': 'test-seam-driver' },
      });
      expect(resolveAuthenticatedDriver(req)).toBe('test-seam-driver');
    });
  });

  describe('Centralized Error Mapping: handleApiError', () => {
    it('maps ClientSuppliedDriverIdError to 400 DISALLOWED_FIELD', async () => {
      const res = handleApiError(new ClientSuppliedDriverIdError());
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: 'DISALLOWED_FIELD',
          message: expect.stringContaining('driverId'),
        },
      });
    });

    it('maps UnauthenticatedError to 401 UNAUTHENTICATED', async () => {
      const res = handleApiError(new UnauthenticatedError());
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: 'UNAUTHENTICATED',
          message: expect.stringContaining('Authentication required'),
        },
      });
    });

    it('maps SessionNotFoundError to 404 SESSION_NOT_FOUND', async () => {
      const res = handleApiError(new SessionNotFoundError('sess_123'));
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: "Recall session 'sess_123' was not found",
        },
      });
    });

    it('maps DriverNotEnrolledError to 404 DRIVER_NOT_ENROLLED', async () => {
      const res = handleApiError(new DriverNotEnrolledError('drv_1', 'R66_0'));
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: 'DRIVER_NOT_ENROLLED',
          message: "Driver 'drv_1' is not enrolled in variant 'R66_0'",
        },
      });
    });

    it('maps SessionOwnershipError to 403 SESSION_FORBIDDEN', async () => {
      const res = handleApiError(new SessionOwnershipError('sess_123', 'drv_2'));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: 'SESSION_FORBIDDEN',
          message: "Driver 'drv_2' is not the owner of session 'sess_123'",
        },
      });
    });

    it('maps IdempotencyConflictError to 409 IDEMPOTENCY_CONFLICT', async () => {
      const res = handleApiError(new IdempotencyConflictError('sess_123', 2));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: 'IDEMPOTENCY_CONFLICT',
          message: expect.stringContaining('already submitted with different input'),
        },
      });
    });

    it('maps CannotAbandonCompletedSessionError to 409 CANNOT_ABANDON_COMPLETED_SESSION', async () => {
      const res = handleApiError(new CannotAbandonCompletedSessionError('sess_123'));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: 'CANNOT_ABANDON_COMPLETED_SESSION',
          message: "Cannot abandon session 'sess_123' because it is already COMPLETED",
        },
      });
    });

    it('maps SessionNotActiveError to 409 SESSION_NOT_ACTIVE', async () => {
      const res = handleApiError(new SessionNotActiveError('sess_123', 'COMPLETED'));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: 'SESSION_NOT_ACTIVE',
          message: "Recall session 'sess_123' is not active (status: COMPLETED)",
        },
      });
    });

    it('maps PromptIndexMismatchError to 400 PROMPT_INDEX_MISMATCH', async () => {
      const res = handleApiError(new PromptIndexMismatchError(1, 0));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: 'PROMPT_INDEX_MISMATCH',
          message: expect.stringContaining('does not match session currentPromptIndex'),
        },
      });
    });

    it('sanitizes unexpected Error to 500 INTERNAL_SERVER_ERROR without leaking raw stack/message', async () => {
      const res = handleApiError(new Error('DATABASE_DEADLOCK: table pg_catalog.pg_locks lock timeout'));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected internal error occurred',
        },
      });
      // Guarantees internal database/Prisma details are NEVER serialized to client
      expect(JSON.stringify(data)).not.toContain('pg_catalog');
    });
  });
});

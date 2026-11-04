import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET as getProgress } from '@/app/api/progress/[variantKey]/route';
import { POST as enroll } from '@/app/api/progress/enroll/route';
import { GetVariantProgressUseCase } from '@/application/learning/get-variant-progress-use-case';
import { EnrollVariantUseCase } from '@/application/learning/enroll-variant-use-case';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { sessionCookie, ensureDrivers } from '@/__tests__/helpers/session';

/**
 * Security audit 2026-11: 未預期錯誤不能把內部訊息（Prisma 表名、欄位、連線資訊）回給客戶端。
 */
const INTERNAL = 'Invalid `prisma.learningProgress.findUnique()` invocation: relation "learning_progress" secret detail';

describe('progress routes do not leak internal error messages', () => {
  beforeEach(() => ensureDrivers(DEFAULT_DRIVER_ID));
  afterEach(() => vi.restoreAllMocks());

  it('GET /api/progress/[variantKey] returns a generic 500 message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(GetVariantProgressUseCase.prototype, 'execute').mockRejectedValue(new Error(INTERNAL));
    const res = await getProgress(
      new Request('http://localhost/api/progress/V1', { headers: { cookie: sessionCookie(DEFAULT_DRIVER_ID) } }),
      { params: Promise.resolve({ variantKey: 'V1' }) }
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  });

  it('POST /api/progress/enroll returns a generic 500 message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(EnrollVariantUseCase.prototype, 'execute').mockRejectedValue(new Error(INTERNAL));
    const res = await enroll(
      new Request('http://localhost/api/progress/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: sessionCookie(DEFAULT_DRIVER_ID) },
        body: JSON.stringify({ routeId: 'R1', variantKey: 'V1' }),
      })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  });
});

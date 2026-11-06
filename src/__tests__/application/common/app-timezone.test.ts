import { describe, it, expect } from 'vitest';
import { toAppDateString, APP_TIME_ZONE } from '@/application/common/app-timezone';

/**
 * Change 33: 應用時區（Australia/Brisbane, UTC+10, 無夏令時）日界。
 */
describe('Change 33: app timezone', () => {
  it('uses Australia/Brisbane', () => {
    expect(APP_TIME_ZONE).toBe('Australia/Brisbane');
  });

  it('maps a UTC instant to the Brisbane calendar date (UTC+10)', () => {
    // 2026-03-01T20:00Z = 2026-03-02 06:00 Brisbane → 隔天
    expect(toAppDateString(new Date('2026-03-01T20:00:00.000Z'))).toBe('2026-03-02');
    // 2026-03-02T02:00Z = 2026-03-02 12:00 Brisbane → 當天
    expect(toAppDateString(new Date('2026-03-02T02:00:00.000Z'))).toBe('2026-03-02');
    // 午夜前一刻 UTC 仍是 Brisbane 當天上午
    expect(toAppDateString(new Date('2026-03-02T13:59:00.000Z'))).toBe('2026-03-02');
    // 跨過 14:00Z → Brisbane 隔天 00:00
    expect(toAppDateString(new Date('2026-03-02T14:00:00.000Z'))).toBe('2026-03-03');
  });
});

import { toAppDayStart } from '@/application/common/app-timezone';
describe('Change 52: toAppDayStart', () => {
  it('is Brisbane midnight of the same Brisbane day', () => {
    // 2026-10-14T19:00Z = 2026-10-15 05:00 Brisbane → 當日起點 = 2026-10-14T14:00Z
    expect(toAppDayStart(new Date('2026-10-14T19:00:00Z')).toISOString()).toBe('2026-10-14T14:00:00.000Z');
  });
  it('late UTC evening still belongs to the next Brisbane day', () => {
    expect(toAppDayStart(new Date('2026-10-14T14:00:00Z')).toISOString()).toBe('2026-10-14T14:00:00.000Z');
    expect(toAppDayStart(new Date('2026-10-14T13:59:59Z')).toISOString()).toBe('2026-10-13T14:00:00.000Z');
  });
});

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

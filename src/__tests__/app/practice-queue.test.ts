import { describe, it, expect } from 'vitest';
import { encodeQueue, parseQueue, type QueueItem } from '@/app/_lib/practice-queue';

/**
 * Change 18 Task 1: 批次佇列編碼/解碼（variantKey 可能含冒號 → 用 JSON）。
 */
describe('Change 18: practice-queue codec', () => {
  it('round-trips items including variantKeys with colons', () => {
    const items: QueueItem[] = [
      { routeId: 'R1', variantKey: 'route-1:dir-0:hash-abc' },
      { routeId: 'R2', variantKey: '66-1-INBOUND' },
    ];
    const encoded = encodeQueue(items);
    expect(encoded).not.toContain(' ');
    expect(parseQueue(encoded)).toEqual(items);
  });

  it('returns [] for null / empty / malformed input', () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue('')).toEqual([]);
    expect(parseQueue('not-json')).toEqual([]);
    expect(parseQueue(encodeURIComponent('{"not":"array"}'))).toEqual([]);
  });

  it('drops items missing routeId/variantKey', () => {
    const raw = encodeURIComponent(JSON.stringify([
      { routeId: 'R1', variantKey: 'V1' },
      { routeId: 'R2' },
      { variantKey: 'V3' },
      { routeId: 'R4', variantKey: 'V4', extra: 1 },
    ]));
    expect(parseQueue(raw)).toEqual([
      { routeId: 'R1', variantKey: 'V1' },
      { routeId: 'R4', variantKey: 'V4' },
    ]);
  });
});

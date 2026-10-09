import { describe, it, expect } from 'vitest';
import { parseVariantKey } from '@/domain/route/route-variant';

/**
 * Change 43: variantKey 解析。
 * 格式 `<routeId>_DIR<n>_<stopId>><stopId>...`（見 groupTripsIntoRouteVariants）。
 * 練習頁需要「路線 / 方向 / 站數」而不是整串 60 幾個站牌代碼。
 */
describe('Change 43: parseVariantKey', () => {
  it('parses routeId, directionId and stopIds', () => {
    const parsed = parseVariantKey('R66_DIR0_ST_1>ST_2>ST_3');
    expect(parsed).toEqual({
      routeId: 'R66',
      directionId: 0,
      stopIds: ['ST_1', 'ST_2', 'ST_3'],
    });
  });

  it('handles a route id that itself contains a hyphen and digits', () => {
    const parsed = parseVariantKey('123-4948_DIR1_16511>12008>10820');
    expect(parsed?.routeId).toBe('123-4948');
    expect(parsed?.directionId).toBe(1);
    expect(parsed?.stopIds).toHaveLength(3);
  });

  it('reports the stop count for a long real-world variant', () => {
    const stops = Array.from({ length: 62 }, (_, i) => `S${i + 1}`);
    const parsed = parseVariantKey(`123-4948_DIR1_${stops.join('>')}`);
    expect(parsed?.stopIds).toHaveLength(62);
  });

  it('returns null for a key that does not match the format', () => {
    expect(parseVariantKey('not-a-variant-key')).toBeNull();
    expect(parseVariantKey('')).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { GtfsVariantHeadsignAdapter } from '@/infrastructure/gtfs/gtfs-variant-headsign-adapter';
import { RouteNotFoundError } from '@/application/gtfs/get-route-variants-use-case';
import type { RouteVariantDto } from '@/application/gtfs/gtfs-read-repository.port';

/**
 * Change 15 Task 1: headsign 查詢 adapter（包 GetRouteVariantsUseCase）。
 */
describe('Change 15: GtfsVariantHeadsignAdapter', () => {
  const variant = (variantKey: string, headsign: string | null): RouteVariantDto =>
    ({ variantKey, routeId: 'R1', directionId: 0, headsign, stopCount: 3, sampleTripId: 'T', tripCount: 1, orderedStops: [] });

  it('maps route variants to { variantKey, headsign }', async () => {
    const getRouteVariants = { execute: vi.fn().mockResolvedValue([variant('V1', 'City → Uni'), variant('V2', null)]) };
    const adapter = new GtfsVariantHeadsignAdapter(getRouteVariants);

    const result = await adapter.findHeadsignsByRoute('R1');

    expect(getRouteVariants.execute).toHaveBeenCalledWith('R1');
    expect(result).toEqual([
      { variantKey: 'V1', headsign: 'City → Uni' },
      { variantKey: 'V2', headsign: null },
    ]);
  });

  it('returns [] when the route is not found', async () => {
    const getRouteVariants = { execute: vi.fn().mockRejectedValue(new RouteNotFoundError('nope')) };
    const adapter = new GtfsVariantHeadsignAdapter(getRouteVariants);

    expect(await adapter.findHeadsignsByRoute('missing')).toEqual([]);
  });

  it('propagates non-RouteNotFound errors', async () => {
    const getRouteVariants = { execute: vi.fn().mockRejectedValue(new Error('db down')) };
    const adapter = new GtfsVariantHeadsignAdapter(getRouteVariants);

    await expect(adapter.findHeadsignsByRoute('R1')).rejects.toThrow('db down');
  });
});

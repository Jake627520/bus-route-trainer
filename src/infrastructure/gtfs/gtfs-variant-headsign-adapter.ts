import {
  GetRouteVariantsUseCase,
  RouteNotFoundError,
} from '@/application/gtfs/get-route-variants-use-case';
import {
  VariantHeadsignQueryPort,
  VariantHeadsign,
} from '@/application/learning/variant-headsign-query-port';

/**
 * Change 15: 以 GetRouteVariantsUseCase 實作 headsign 查詢。
 * route 不存在（RouteNotFoundError）→ 回空陣列（該路線無可補 headsign）；
 * 其他錯誤往上拋，由呼叫端（use-case）決定降級。
 */
export class GtfsVariantHeadsignAdapter implements VariantHeadsignQueryPort {
  constructor(private readonly getRouteVariants: Pick<GetRouteVariantsUseCase, 'execute'>) {}

  async findHeadsignsByRoute(routeId: string): Promise<VariantHeadsign[]> {
    try {
      const variants = await this.getRouteVariants.execute(routeId);
      return variants.map((v) => ({ variantKey: v.variantKey, headsign: v.headsign }));
    } catch (e) {
      if (e instanceof RouteNotFoundError) return [];
      throw e;
    }
  }
}

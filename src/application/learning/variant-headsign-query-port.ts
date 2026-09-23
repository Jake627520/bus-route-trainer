/**
 * Change 15: 查某 routeId 下各 variant 的終點 headsign，供複習彙總補值。
 */
export interface VariantHeadsign {
  variantKey: string;
  headsign: string | null;
}

export interface VariantHeadsignQueryPort {
  findHeadsignsByRoute(routeId: string): Promise<VariantHeadsign[]>;
}

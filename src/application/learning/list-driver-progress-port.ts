import { DriverVariantProgress } from '@/domain/learning/driver-variant-progress';

/**
 * Change 11: 列舉某 driver 全部 enrolled progress（含 cards），
 * 供複習彙總（GetReviewSummaryUseCase）由 cards 直接計算到期/新卡/下次複習。
 */
export interface ListDriverProgressPort {
  findAllByDriver(driverId: string): Promise<DriverVariantProgress[]>;
}

import { randomUUID } from 'crypto';
import { CardState, CardType, LearningCard } from '@/domain/learning/learning-card';
import {
  generateNextStopCardKey,
  generateStopCardKey,
  generateStopNumberCardKey,
} from '@/domain/learning/card-key-generator';
import { parseStopName } from '@/domain/gtfs/stop-name';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';

/**
 * Change 46: 目前的卡片組版本。
 * 每當引入新題型（＝新的 cardKey 種類）就 +1，既有報名會在下次開練習時補發。
 *
 * 1 = Change 45 的 STOP_NUM:: 站號卡
 */
export const CURRENT_CARDS_VERSION = 1;

export interface ProgressForBackfill {
  readonly id: string;
  readonly routeId: string;
  readonly targetVariantKey: string;
  readonly cardsVersion: number;
  readonly cardKeys: readonly string[];
}

export interface BackfillCardsRepository {
  findProgressForBackfill(driverId: string, variantKey: string): Promise<ProgressForBackfill | null>;
  /** 於單一交易內補入卡片並更新版本。 */
  addCardsAndSetVersion(progressId: string, cards: LearningCard[], version: number): Promise<void>;
}

export interface BackfillVariantCardsCommand {
  readonly driverId: string;
  readonly variantKey: string;
}

export interface BackfillVariantCardsResult {
  readonly added: number;
  /** 已是最新版本而直接略過（未查詢拓撲）。 */
  readonly skipped: boolean;
}

/**
 * 為既有報名補發新題型卡片。
 *
 * 嚴格只「新增」缺少的 cardKey，**絕不修改或重建既有卡片**，
 * 因此司機已累積的 SRS 進度完全不受影響。
 */
export class BackfillVariantCardsUseCase {
  constructor(
    private readonly repo: BackfillCardsRepository,
    private readonly getRouteVariantsUseCase: GetRouteVariantsUseCase,
  ) {}

  async execute(command: BackfillVariantCardsCommand): Promise<BackfillVariantCardsResult> {
    const progress = await this.repo.findProgressForBackfill(command.driverId, command.variantKey);
    if (!progress) return { added: 0, skipped: true };

    // O(1) 版本檢查：已是最新就不查拓撲，避免每次開練習都打 GTFS
    if (progress.cardsVersion >= CURRENT_CARDS_VERSION) {
      return { added: 0, skipped: true };
    }

    const variants = await this.getRouteVariantsUseCase.execute(progress.routeId);
    const variant = variants.find((v) => v.variantKey === progress.targetVariantKey);
    if (!variant) {
      // 變體已不存在（GTFS 改版）：不補卡，但仍標記版本避免每次重試
      await this.repo.addCardsAndSetVersion(progress.id, [], CURRENT_CARDS_VERSION);
      return { added: 0, skipped: false };
    }

    const existing = new Set(progress.cardKeys);
    const missing: LearningCard[] = [];
    const push = (cardKey: string, cardType: CardType) => {
      if (existing.has(cardKey)) return;
      existing.add(cardKey);
      missing.push(
        new LearningCard({
          id: randomUUID(),
          progressId: progress.id,
          cardKey,
          cardType,
          state: CardState.NEW,
          nextReviewAt: null,
          repetitions: 0,
          lapses: 0,
        }),
      );
    };

    const stops = variant.orderedStops;
    for (const s of stops) {
      push(generateStopCardKey(s.stopId), CardType.STOP);
      if (parseStopName(s.stopName ?? '').stopNumber) {
        push(generateStopNumberCardKey(s.stopId), CardType.STOP);
      }
    }
    for (let i = 0; i < stops.length - 1; i++) {
      push(generateNextStopCardKey(stops[i].stopId, stops[i + 1].stopId), CardType.NEXT_STOP);
    }

    await this.repo.addCardsAndSetVersion(progress.id, missing, CURRENT_CARDS_VERSION);
    return { added: missing.length, skipped: false };
  }
}

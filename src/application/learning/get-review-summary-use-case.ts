import { Clock } from '@/application/common/clock';
import { ListDriverProgressPort } from '@/application/learning/list-driver-progress-port';
import { VariantHeadsignQueryPort } from '@/application/learning/variant-headsign-query-port';
import { ProgressStatus } from '@/domain/learning/driver-variant-progress';
import { CardState } from '@/domain/learning/learning-card';
import { isCardDue } from '@/domain/srs/is-card-due';

export interface VariantReviewSummary {
  routeId: string;
  variantKey: string;
  directionId: number;
  status: ProgressStatus;
  headsign: string | null;
  dueCount: number;
  newCount: number;
  masteredCount: number;
  totalCards: number;
  /** 未到期卡片中最近的複習時間（ISO）；全到期或無未來卡則 null。 */
  nextReviewAt: string | null;
}

export interface GetReviewSummaryCommand {
  driverId: string;
}

/**
 * Change 11: 複習彙總。
 * 由每個 enrolled variant 的 cards 直接計算 dueCount / newCount / totalCards / nextReviewAt，
 * 依 dueCount 由多到少排序（同分再依 nextReviewAt 早者、variantKey）。
 */
export class GetReviewSummaryUseCase {
  constructor(
    private readonly progressPort: ListDriverProgressPort,
    private readonly clock: Clock,
    private readonly headsignPort: VariantHeadsignQueryPort
  ) {}

  async execute(command: GetReviewSummaryCommand): Promise<VariantReviewSummary[]> {
    const now = this.clock.now();
    const enrolled = await this.progressPort.findAllByDriver(command.driverId);

    // headsign 為增益：每個 distinct routeId 只查一次，任一路線查詢失敗則該路線降級為 null。
    const headsignMap = new Map<string, string | null>();
    const distinctRoutes = [...new Set(enrolled.map((p) => p.routeId))];
    await Promise.all(
      distinctRoutes.map(async (routeId) => {
        try {
          const list = await this.headsignPort.findHeadsignsByRoute(routeId);
          for (const h of list) headsignMap.set(`${routeId}::${h.variantKey}`, h.headsign);
        } catch {
          /* 降級：該路線 headsign 留空 → null */
        }
      })
    );

    const summaries: VariantReviewSummary[] = enrolled.map((progress) => {
      const cards = progress.cards;

      const dueCount = cards.filter((c) => isCardDue(c, now)).length;
      const newCount = cards.filter((c) => c.state === CardState.NEW).length;
      const masteredCount = cards.filter((c) => c.state === CardState.MASTERED).length;

      const upcoming = cards
        .map((c) => c.nextReviewAt)
        .filter((d): d is Date => d !== null && d.getTime() > now.getTime())
        .sort((a, b) => a.getTime() - b.getTime());

      return {
        routeId: progress.routeId,
        variantKey: progress.targetVariantKey,
        directionId: progress.directionId,
        status: progress.status,
        headsign: headsignMap.get(`${progress.routeId}::${progress.targetVariantKey}`) ?? null,
        dueCount,
        newCount,
        masteredCount,
        totalCards: cards.length,
        nextReviewAt: upcoming.length > 0 ? upcoming[0].toISOString() : null,
      };
    });

    return summaries.sort((a, b) => {
      if (a.dueCount !== b.dueCount) return b.dueCount - a.dueCount;
      if (a.nextReviewAt !== b.nextReviewAt) {
        if (a.nextReviewAt === null) return 1;
        if (b.nextReviewAt === null) return -1;
        return a.nextReviewAt < b.nextReviewAt ? -1 : 1;
      }
      return a.variantKey < b.variantKey ? -1 : a.variantKey > b.variantKey ? 1 : 0;
    });
  }
}

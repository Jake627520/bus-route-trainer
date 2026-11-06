import { toAppDateString, toAppDayStart } from '@/application/common/app-timezone';
import type {
  PushSender,
  PushSubscriptionRecord,
  PushSubscriptionRepository,
  ReminderStatsQuery,
} from './push.port';
import { MAX_SUBSCRIPTIONS_PER_RUN, SEND_BATCH_SIZE } from './reminder-config';
import { buildReminderPayload } from './reminder-message';

export interface SendRemindersResult {
  sent: number;
  skippedNoDue: number;
  skippedPractised: number;
  removed: number;
  failed: number;
}

interface Options {
  maxPerRun?: number;
  batchSize?: number;
}

type DriverFacts = { due: number; practised: boolean };

/**
 * Change 52: 每日複習提醒。
 * 每個訂閱每個 Brisbane 日只處理一次（處理 = 發送，或判定不需發送）：
 * 暫時性失敗不標記，同日再跑會重試；已處理的同日不會再發。
 * 單一訂閱或單一司機出錯只記 log，不影響其他人。
 */
export class SendDailyReviewRemindersUseCase {
  private readonly maxPerRun: number;
  private readonly batchSize: number;

  constructor(
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly stats: ReminderStatsQuery,
    private readonly sender: PushSender,
    options: Options = {},
  ) {
    this.maxPerRun = options.maxPerRun ?? MAX_SUBSCRIPTIONS_PER_RUN;
    this.batchSize = options.batchSize ?? SEND_BATCH_SIZE;
  }

  async execute(command: { now: Date }): Promise<SendRemindersResult> {
    const { now } = command;
    const day = toAppDateString(now);
    const dayStart = toAppDayStart(now);
    const result: SendRemindersResult = { sent: 0, skippedNoDue: 0, skippedPractised: 0, removed: 0, failed: 0 };

    const pending = await this.subscriptions.findNotCheckedOn(day, this.maxPerRun);
    // 同一司機的到期數只算一次（多台裝置共用）。
    const facts = new Map<string, Promise<DriverFacts>>();
    const factsFor = (driverId: string): Promise<DriverFacts> => {
      let p = facts.get(driverId);
      if (!p) {
        p = this.loadFacts(driverId, now, dayStart);
        facts.set(driverId, p);
      }
      return p;
    };

    for (let i = 0; i < pending.length; i += this.batchSize) {
      const batch = pending.slice(i, i + this.batchSize);
      await Promise.all(batch.map((sub) => this.processOne(sub, day, factsFor, result)));
    }
    return result;
  }

  private async loadFacts(driverId: string, now: Date, dayStart: Date): Promise<DriverFacts> {
    const due = await this.stats.countDueCards(driverId, now);
    if (due <= 0) return { due: 0, practised: false };
    return { due, practised: await this.stats.hasAttemptSince(driverId, dayStart) };
  }

  private async processOne(
    sub: PushSubscriptionRecord,
    day: string,
    factsFor: (driverId: string) => Promise<DriverFacts>,
    result: SendRemindersResult,
  ): Promise<void> {
    try {
      const { due, practised } = await factsFor(sub.driverId);
      if (due <= 0) {
        await this.subscriptions.markChecked(sub.id, day);
        result.skippedNoDue++;
        return;
      }
      if (practised) {
        await this.subscriptions.markChecked(sub.id, day);
        result.skippedPractised++;
        return;
      }

      const outcome = await this.sender.send(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        buildReminderPayload(sub.locale, due),
      );
      if (outcome === 'ok') {
        await this.subscriptions.markChecked(sub.id, day);
        result.sent++;
      } else if (outcome === 'gone') {
        await this.subscriptions.deleteById(sub.id);
        result.removed++;
      } else {
        result.failed++;
        console.error('[push] temporary send failure', { subscriptionId: sub.id });
      }
    } catch (error) {
      result.failed++;
      // 只記訂閱 id 與錯誤訊息；絕不記錄 endpoint 金鑰。
      console.error('[push] reminder failed', {
        subscriptionId: sub.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

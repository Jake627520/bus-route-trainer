import { PrismaClient } from '@prisma/client';
import { PrismaPushSubscriptionRepository } from '@/infrastructure/push/prisma-push-subscription-repository';
import { PrismaReminderStatsQuery } from '@/infrastructure/push/prisma-reminder-stats-query';
import { WebPushSender } from '@/infrastructure/push/web-push-sender';
import { readPushConfig } from '@/infrastructure/push/push-config';
import {
  SubscribeToPushUseCase,
  UnsubscribeFromPushUseCase,
} from '@/application/push/subscribe-use-cases';
import { SendDailyReviewRemindersUseCase } from '@/application/push/send-daily-review-reminders-use-case';

/** Change 52: 推播相關服務的組裝（route 共用）。環境變數在呼叫時才讀，缺設定時回 null。 */
const prisma = new PrismaClient();
const subscriptions = new PrismaPushSubscriptionRepository(prisma);

export const subscribeToPush = new SubscribeToPushUseCase(subscriptions);
export const unsubscribeFromPush = new UnsubscribeFromPushUseCase(subscriptions);

export function createReminderRunner(): SendDailyReviewRemindersUseCase | null {
  const config = readPushConfig();
  if (!config) return null;
  return new SendDailyReviewRemindersUseCase(
    subscriptions,
    new PrismaReminderStatsQuery(prisma),
    new WebPushSender(config),
  );
}

import { z } from 'zod';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import type { PushSubscriptionRepository } from './push.port';
import { MAX_SUBSCRIPTIONS_PER_DRIVER } from './reminder-config';

export type PushSubscriptionErrorCode = 'INVALID_SUBSCRIPTION' | 'TOO_MANY_SUBSCRIPTIONS';

export class PushSubscriptionError extends Error {
  constructor(
    readonly code: PushSubscriptionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PushSubscriptionError';
  }
}

const httpsUrl = z
  .string()
  .max(2048)
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  });

const subscriptionSchema = z.object({
  endpoint: httpsUrl,
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

export interface SubscribeToPushCommand {
  driverId: string;
  endpoint: unknown;
  keys: unknown;
  locale?: unknown;
}

/** Change 52: 建立（或更新）這台裝置的推播訂閱。 */
export class SubscribeToPushUseCase {
  constructor(private readonly repo: PushSubscriptionRepository) {}

  async execute(command: SubscribeToPushCommand): Promise<void> {
    const parsed = subscriptionSchema.safeParse({ endpoint: command.endpoint, keys: command.keys });
    if (!parsed.success) {
      throw new PushSubscriptionError('INVALID_SUBSCRIPTION', 'Invalid push subscription');
    }
    const { endpoint, keys } = parsed.data;

    const already = await this.repo.existsForDriver(command.driverId, endpoint);
    if (!already && (await this.repo.countByDriver(command.driverId)) >= MAX_SUBSCRIPTIONS_PER_DRIVER) {
      throw new PushSubscriptionError('TOO_MANY_SUBSCRIPTIONS', 'Too many devices subscribed');
    }

    await this.repo.upsert({
      driverId: command.driverId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      locale: isLocale(command.locale) ? command.locale : DEFAULT_LOCALE,
    });
  }
}

/** Change 52: 取消這台裝置的訂閱（只能取消自己的）。 */
export class UnsubscribeFromPushUseCase {
  constructor(private readonly repo: PushSubscriptionRepository) {}

  async execute(command: { driverId: string; endpoint: string }): Promise<void> {
    await this.repo.deleteByEndpoint(command.driverId, command.endpoint);
  }
}

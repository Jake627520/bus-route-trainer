import { describe, it, expect } from 'vitest';
import {
  SubscribeToPushUseCase,
  UnsubscribeFromPushUseCase,
  PushSubscriptionError,
} from '@/application/push/subscribe-use-cases';
import { MAX_SUBSCRIPTIONS_PER_DRIVER } from '@/application/push/reminder-config';
import { InMemoryPushRepo } from './fakes';

const valid = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'BPublicKey', auth: 'authSecret' },
  locale: 'zh-TW',
};

describe('Change 52: subscribe / unsubscribe', () => {
  it('stores a subscription for the driver', async () => {
    const repo = new InMemoryPushRepo();
    await new SubscribeToPushUseCase(repo).execute({ driverId: 'd1', ...valid });
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ driverId: 'd1', endpoint: valid.endpoint, p256dh: 'BPublicKey', auth: 'authSecret', locale: 'zh-TW' });
  });

  it('is idempotent for the same endpoint', async () => {
    const repo = new InMemoryPushRepo();
    const uc = new SubscribeToPushUseCase(repo);
    await uc.execute({ driverId: 'd1', ...valid });
    await uc.execute({ driverId: 'd1', ...valid });
    expect(repo.rows).toHaveLength(1);
  });

  it('moves the device to the new driver when someone else logs in on it', async () => {
    const repo = new InMemoryPushRepo();
    const uc = new SubscribeToPushUseCase(repo);
    await uc.execute({ driverId: 'd1', ...valid });
    await uc.execute({ driverId: 'd2', ...valid });
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].driverId).toBe('d2');
  });

  it('falls back to English for an unknown locale', async () => {
    const repo = new InMemoryPushRepo();
    await new SubscribeToPushUseCase(repo).execute({ driverId: 'd1', ...valid, locale: 'fr' });
    expect(repo.rows[0].locale).toBe('en');
  });

  it.each([
    ['http endpoint', { ...valid, endpoint: 'http://push.example/x' }],
    ['not a URL', { ...valid, endpoint: 'nope' }],
    ['javascript URL', { ...valid, endpoint: 'javascript:alert(1)' }],
    ['missing keys', { ...valid, keys: undefined }],
    ['empty p256dh', { ...valid, keys: { p256dh: '', auth: 'a' } }],
    ['huge endpoint', { ...valid, endpoint: 'https://x.example/' + 'a'.repeat(3000) }],
    ['non-string auth', { ...valid, keys: { p256dh: 'p', auth: 5 } }],
  ])('rejects invalid input: %s', async (_name, input) => {
    const repo = new InMemoryPushRepo();
    await expect(
      new SubscribeToPushUseCase(repo).execute({ driverId: 'd1', ...(input as object) } as never),
    ).rejects.toBeInstanceOf(PushSubscriptionError);
    expect(repo.rows).toHaveLength(0);
  });

  it('caps the number of devices per driver', async () => {
    const repo = new InMemoryPushRepo();
    const uc = new SubscribeToPushUseCase(repo);
    for (let i = 0; i < MAX_SUBSCRIPTIONS_PER_DRIVER; i++) {
      await uc.execute({ driverId: 'd1', ...valid, endpoint: `https://push.example/${i}` });
    }
    await expect(
      uc.execute({ driverId: 'd1', ...valid, endpoint: 'https://push.example/extra' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_SUBSCRIPTIONS' });
    // 已存在的 endpoint 重新訂閱不算超額
    await expect(
      uc.execute({ driverId: 'd1', ...valid, endpoint: 'https://push.example/0' }),
    ).resolves.toBeUndefined();
  });

  it('unsubscribe removes only that driver\'s own subscription', async () => {
    const repo = new InMemoryPushRepo();
    await new SubscribeToPushUseCase(repo).execute({ driverId: 'd1', ...valid });
    const un = new UnsubscribeFromPushUseCase(repo);
    await un.execute({ driverId: 'd2', endpoint: valid.endpoint });
    expect(repo.rows).toHaveLength(1);
    await un.execute({ driverId: 'd1', endpoint: valid.endpoint });
    expect(repo.rows).toHaveLength(0);
  });

  it('unsubscribing something that does not exist is fine', async () => {
    const repo = new InMemoryPushRepo();
    await expect(
      new UnsubscribeFromPushUseCase(repo).execute({ driverId: 'd1', endpoint: valid.endpoint }),
    ).resolves.toBeUndefined();
  });
});

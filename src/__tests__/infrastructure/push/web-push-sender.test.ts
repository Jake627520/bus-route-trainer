import { describe, it, expect, vi, beforeEach } from 'vitest';

const wp = vi.hoisted(() => ({ sendNotification: vi.fn(), setVapidDetails: vi.fn() }));
vi.mock('web-push', () => ({ default: wp, ...wp }));

import { WebPushSender } from '@/infrastructure/push/web-push-sender';
import { readPushConfig } from '@/infrastructure/push/push-config';

const config = { publicKey: 'PUB', privateKey: 'PRIV', subject: 'mailto:a@example.com' };
const target = { endpoint: 'https://push.example/x', p256dh: 'p', auth: 'a' };

describe('Change 52: readPushConfig', () => {
  const full = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'PUB',
    VAPID_PRIVATE_KEY: 'PRIV',
    VAPID_SUBJECT: 'mailto:a@example.com',
  };
  it('returns the config when all three are set', () => {
    expect(readPushConfig(full)).toEqual(config);
  });
  it.each(['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'])('returns null when %s is missing or blank', (k) => {
    expect(readPushConfig({ ...full, [k]: undefined })).toBeNull();
    expect(readPushConfig({ ...full, [k]: '  ' })).toBeNull();
  });
  it('returns null when nothing is configured', () => {
    expect(readPushConfig({})).toBeNull();
  });
});

describe('Change 52: WebPushSender', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends the payload with the VAPID details and a TTL', async () => {
    wp.sendNotification.mockResolvedValue({ statusCode: 201 });
    const r = await new WebPushSender(config).send(target, '{"a":1}');
    expect(r).toBe('ok');
    expect(wp.setVapidDetails).toHaveBeenCalledWith('mailto:a@example.com', 'PUB', 'PRIV');
    const [sub, payload, opts] = wp.sendNotification.mock.calls[0];
    expect(sub).toEqual({ endpoint: target.endpoint, keys: { p256dh: 'p', auth: 'a' } });
    expect(payload).toBe('{"a":1}');
    expect(opts.TTL).toBeGreaterThan(0);
  });

  it.each([404, 410])('treats HTTP %s as "gone"', async (statusCode) => {
    wp.sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode }));
    expect(await new WebPushSender(config).send(target, 'x')).toBe('gone');
  });

  it.each([400, 429, 500, 503])('treats HTTP %s as a temporary error (keep the subscription)', async (statusCode) => {
    wp.sendNotification.mockRejectedValue(Object.assign(new Error('nope'), { statusCode }));
    expect(await new WebPushSender(config).send(target, 'x')).toBe('error');
  });

  it('treats a network failure (no status) as a temporary error', async () => {
    wp.sendNotification.mockRejectedValue(new Error('ECONNRESET'));
    expect(await new WebPushSender(config).send(target, 'x')).toBe('error');
  });
});

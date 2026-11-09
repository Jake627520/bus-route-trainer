import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

const wp = vi.hoisted(() => ({ sendNotification: vi.fn(), setVapidDetails: vi.fn() }));
vi.mock('web-push', () => ({ default: wp, ...wp }));

import { POST as subscribe } from '@/app/api/push/subscribe/route';
import { POST as unsubscribe } from '@/app/api/push/unsubscribe/route';
import { GET as cron } from '@/app/api/cron/review-reminders/route';
import { sessionCookie } from '@/__tests__/helpers/session';

const prisma = new PrismaClient();
const post = (path: string, body: unknown, cookie?: string) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const sub = { endpoint: 'https://push.example/dev1', keys: { p256dh: 'P', auth: 'A' }, locale: 'en' };

describe('Change 52: push routes (integration)', () => {
  let driverId: string;
  let cookie: string;
  const cleanup = async () => {
    await prisma.pushSubscription.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.driver.deleteMany({ where: { username: { startsWith: 'push-route-' } } });
  };

  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(async () => {
    await cleanup();
    const d = await prisma.driver.create({ data: { username: 'push-route-a', passwordHash: 'h', passwordSalt: 's' } });
    driverId = d.id;
    cookie = sessionCookie(driverId);
  });

  describe('POST /api/push/subscribe', () => {
    it('401 without a session', async () => {
      expect((await subscribe(post('/api/push/subscribe', sub))).status).toBe(401);
    });
    it('400 for malformed JSON', async () => {
      expect((await subscribe(post('/api/push/subscribe', '{nope', cookie))).status).toBe(400);
    });
    it('400 INVALID_SUBSCRIPTION for a non-https endpoint', async () => {
      const res = await subscribe(post('/api/push/subscribe', { ...sub, endpoint: 'http://x.example' }, cookie));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('INVALID_SUBSCRIPTION');
    });
    it('stores the subscription for the logged-in driver and is idempotent', async () => {
      expect((await subscribe(post('/api/push/subscribe', sub, cookie))).status).toBe(200);
      expect((await subscribe(post('/api/push/subscribe', sub, cookie))).status).toBe(200);
      const rows = await prisma.pushSubscription.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ driverId, endpoint: sub.endpoint, p256dh: 'P', auth: 'A', locale: 'en' });
    });
    it('409 once the per-driver device cap is reached', async () => {
      for (let i = 0; i < 10; i++) {
        await subscribe(post('/api/push/subscribe', { ...sub, endpoint: `https://push.example/${i}` }, cookie));
      }
      const res = await subscribe(post('/api/push/subscribe', { ...sub, endpoint: 'https://push.example/extra' }, cookie));
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe('TOO_MANY_SUBSCRIPTIONS');
    });
  });

  describe('POST /api/push/unsubscribe', () => {
    it('401 without a session', async () => {
      expect((await unsubscribe(post('/api/push/unsubscribe', { endpoint: sub.endpoint }))).status).toBe(401);
    });
    it('400 when endpoint is missing', async () => {
      expect((await unsubscribe(post('/api/push/unsubscribe', {}, cookie))).status).toBe(400);
    });
    it('removes the driver\'s own subscription, but not someone else\'s', async () => {
      await subscribe(post('/api/push/subscribe', sub, cookie));
      const other = await prisma.driver.create({ data: { username: 'push-route-b', passwordHash: 'h', passwordSalt: 's' } });
      expect((await unsubscribe(post('/api/push/unsubscribe', { endpoint: sub.endpoint }, sessionCookie(other.id)))).status).toBe(200);
      expect(await prisma.pushSubscription.count()).toBe(1);
      expect((await unsubscribe(post('/api/push/unsubscribe', { endpoint: sub.endpoint }, cookie))).status).toBe(200);
      expect(await prisma.pushSubscription.count()).toBe(0);
    });
  });

  describe('GET /api/cron/review-reminders', () => {
    const env = { CRON_SECRET: 'cron-secret', NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'PUB', VAPID_PRIVATE_KEY: 'PRIV', VAPID_SUBJECT: 'mailto:a@example.com' };
    const call = (authorization?: string) =>
      cron(new Request('http://localhost/api/cron/review-reminders', { headers: authorization ? { authorization } : {} }));
    const setEnv = (e: Record<string, string | undefined>) => {
      for (const [k, v] of Object.entries(e)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    };
    const saved = { ...process.env };
    afterEach(() => { vi.clearAllMocks(); for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

    const seedDue = async () => {
      await subscribe(post('/api/push/subscribe', { ...sub, locale: 'zh-TW' }, cookie));
      const p = await prisma.driverVariantProgress.create({ data: { driverId, routeId: 'R', directionId: 0, targetVariantKey: 'V' } });
      await prisma.learningCard.create({ data: { progressId: p.id, cardKey: 'NEXT_STOP::a->b', cardType: 'NEXT_STOP', nextReviewAt: new Date('2020-01-01') } });
      await prisma.learningCard.create({ data: { progressId: p.id, cardKey: 'NEXT_STOP::b->c', cardType: 'NEXT_STOP', nextReviewAt: new Date('2020-01-01') } });
    };

    it('401 without credentials — and never sends anything', async () => {
      setEnv(env);
      await seedDue();
      expect((await call()).status).toBe(401);
      expect((await call('Bearer wrong')).status).toBe(401);
      expect(wp.sendNotification).not.toHaveBeenCalled();
    });

    it('401 when the server has no CRON_SECRET, even for "Bearer undefined"', async () => {
      setEnv({ ...env, CRON_SECRET: undefined });
      expect((await call('Bearer undefined')).status).toBe(401);
      expect((await call('Bearer ')).status).toBe(401);
    });

    it('200 skipped when push keys are not configured', async () => {
      setEnv({ ...env, VAPID_PRIVATE_KEY: undefined });
      await seedDue();
      const res = await call('Bearer cron-secret');
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ skipped: true });
      expect(wp.sendNotification).not.toHaveBeenCalled();
    });

    it('sends the due-count reminder (count only) and reports counts, not subscription data', async () => {
      setEnv(env);
      wp.sendNotification.mockResolvedValue({ statusCode: 201 });
      await seedDue();
      const res = await call('Bearer cron-secret');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toMatchObject({ sent: 1, failed: 0, removed: 0 });
      expect(JSON.stringify(body)).not.toContain('push.example');
      expect(wp.sendNotification).toHaveBeenCalledTimes(1);
      const [, payload] = wp.sendNotification.mock.calls[0];
      expect(JSON.parse(payload)).toEqual({ title: '待複習提醒', body: '你有 2 張卡片待複習', url: '/' });
    });

    it('a second call the same day does not send again', async () => {
      setEnv(env);
      wp.sendNotification.mockResolvedValue({ statusCode: 201 });
      await seedDue();
      await call('Bearer cron-secret');
      await call('Bearer cron-secret');
      expect(wp.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('deletes a subscription the push service reports as gone', async () => {
      setEnv(env);
      wp.sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
      await seedDue();
      const body = await (await call('Bearer cron-secret')).json();
      expect(body.data.removed).toBe(1);
      expect(await prisma.pushSubscription.count()).toBe(0);
    });
  });
});

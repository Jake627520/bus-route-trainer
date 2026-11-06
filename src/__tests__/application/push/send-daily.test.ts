import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SendDailyReviewRemindersUseCase } from '@/application/push/send-daily-review-reminders-use-case';
import { SEND_BATCH_SIZE } from '@/application/push/reminder-config';
import { InMemoryPushRepo, FakeStats, FakeSender } from './fakes';

// 2026-10-14T19:00Z = 2026-10-15 05:00 Brisbane
const NOW = new Date('2026-10-14T19:00:00Z');
const DAY = '2026-10-15';

const sub = (driverId: string, n = 1, locale: 'en' | 'zh-TW' = 'en') => ({
  driverId, endpoint: `https://push.example/${driverId}/${n}`, p256dh: 'p', auth: 'a', locale,
});

describe('Change 52: SendDailyReviewReminders', () => {
  let repo: InMemoryPushRepo;
  let stats: FakeStats;
  let sender: FakeSender;
  let uc: SendDailyReviewRemindersUseCase;

  beforeEach(() => {
    repo = new InMemoryPushRepo();
    stats = new FakeStats();
    sender = new FakeSender();
    uc = new SendDailyReviewRemindersUseCase(repo, stats, sender);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sends one reminder with the due count, in the subscriber\'s language', async () => {
    await repo.upsert(sub('d1', 1, 'zh-TW'));
    stats.due.set('d1', 7);
    const r = await uc.execute({ now: NOW });
    expect(r.sent).toBe(1);
    expect(sender.sent).toHaveLength(1);
    expect(JSON.parse(sender.sent[0].payload).body).toBe('你有 7 張卡片待複習');
  });

  it('does not send when nothing is due', async () => {
    await repo.upsert(sub('d1'));
    const r = await uc.execute({ now: NOW });
    expect(sender.sent).toHaveLength(0);
    expect(r.skippedNoDue).toBe(1);
  });

  it('skips a driver who already practised today', async () => {
    await repo.upsert(sub('d1'));
    stats.due.set('d1', 5);
    stats.practised.add('d1');
    const r = await uc.execute({ now: NOW });
    expect(sender.sent).toHaveLength(0);
    expect(r.skippedPractised).toBe(1);
  });

  it('running twice on the same Brisbane day sends only once', async () => {
    await repo.upsert(sub('d1'));
    stats.due.set('d1', 5);
    await uc.execute({ now: NOW });
    await uc.execute({ now: new Date('2026-10-14T19:40:00Z') });
    expect(sender.sent).toHaveLength(1);
  });

  it('sends again on the next Brisbane day', async () => {
    await repo.upsert(sub('d1'));
    stats.due.set('d1', 5);
    await uc.execute({ now: NOW });
    await uc.execute({ now: new Date('2026-10-15T19:00:00Z') });
    expect(sender.sent).toHaveLength(2);
  });

  it('every device of a driver gets it, but the due count is computed once per driver', async () => {
    await repo.upsert(sub('d1', 1));
    await repo.upsert(sub('d1', 2));
    stats.due.set('d1', 4);
    await uc.execute({ now: NOW });
    expect(sender.sent).toHaveLength(2);
    expect(stats.dueCalls).toBe(1);
  });

  it('removes a subscription the push service says is gone (404/410)', async () => {
    await repo.upsert(sub('d1'));
    stats.due.set('d1', 3);
    sender.results.set(repo.rows[0].endpoint, 'gone');
    const r = await uc.execute({ now: NOW });
    expect(r.removed).toBe(1);
    expect(repo.rows).toHaveLength(0);
  });

  it('keeps a subscription on a temporary error and retries on the next run the same day', async () => {
    await repo.upsert(sub('d1'));
    stats.due.set('d1', 3);
    const ep = repo.rows[0].endpoint;
    sender.results.set(ep, 'error');
    const r = await uc.execute({ now: NOW });
    expect(r.failed).toBe(1);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].lastCheckedDay).toBeNull();
    sender.results.set(ep, 'ok');
    await uc.execute({ now: new Date('2026-10-14T20:00:00Z') });
    expect(sender.sent).toHaveLength(1);
  });

  it('one failing subscription (even a throw) does not stop the others', async () => {
    await repo.upsert(sub('d1'));
    await repo.upsert(sub('d2'));
    stats.due.set('d1', 3);
    stats.due.set('d2', 3);
    sender.results.set(repo.rows[0].endpoint, 'throw');
    const r = await uc.execute({ now: NOW });
    expect(r.failed).toBe(1);
    expect(r.sent).toBe(1);
  });

  it('a failing stats query for one driver does not stop the others', async () => {
    await repo.upsert(sub('d1'));
    await repo.upsert(sub('d2'));
    stats.due.set('d2', 2);
    const original = stats.countDueCards.bind(stats);
    stats.countDueCards = async (id: string) => {
      if (id === 'd1') throw new Error('db hiccup');
      return original(id);
    };
    const r = await uc.execute({ now: NOW });
    expect(r.failed).toBe(1);
    expect(r.sent).toBe(1);
  });

  it('never logs the keys of a subscription', async () => {
    await repo.upsert({ ...sub('d1'), p256dh: 'SECRET-P256', auth: 'SECRET-AUTH' });
    stats.due.set('d1', 1);
    sender.results.set(repo.rows[0].endpoint, 'throw');
    await uc.execute({ now: NOW });
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(logged).not.toContain('SECRET-P256');
    expect(logged).not.toContain('SECRET-AUTH');
  });

  it('processes at most the per-run limit and the rest continue on the next run', async () => {
    const small = new SendDailyReviewRemindersUseCase(repo, stats, sender, { maxPerRun: 3, batchSize: 2 });
    for (let i = 0; i < 5; i++) {
      await repo.upsert(sub(`d${i}`));
      stats.due.set(`d${i}`, 1);
    }
    await small.execute({ now: NOW });
    expect(sender.sent).toHaveLength(3);
    await small.execute({ now: NOW });
    expect(sender.sent).toHaveLength(5);
    await small.execute({ now: NOW });
    expect(sender.sent).toHaveLength(5);
  });

  it('sends in batches (default batch size is sane)', () => {
    expect(SEND_BATCH_SIZE).toBeGreaterThan(0);
  });

  it('uses the Brisbane day as the dedupe key', async () => {
    await repo.upsert(sub('d1'));
    stats.due.set('d1', 1);
    await uc.execute({ now: NOW });
    expect(repo.rows[0].lastCheckedDay).toBe(DAY);
  });
});

import type {
  NewPushSubscription,
  PushSendResult,
  PushSender,
  PushSubscriptionRecord,
  PushSubscriptionRepository,
  ReminderStatsQuery,
} from '@/application/push/push.port';

export class InMemoryPushRepo implements PushSubscriptionRepository {
  rows: PushSubscriptionRecord[] = [];
  private seq = 0;

  async upsert(s: NewPushSubscription): Promise<void> {
    const i = this.rows.findIndex((r) => r.endpoint === s.endpoint);
    if (i >= 0) {
      this.rows[i] = { ...this.rows[i], ...s };
    } else {
      this.rows.push({ id: `sub-${++this.seq}`, lastCheckedDay: null, ...s });
    }
  }
  async countByDriver(driverId: string) {
    return this.rows.filter((r) => r.driverId === driverId).length;
  }
  async existsForDriver(driverId: string, endpoint: string) {
    return this.rows.some((r) => r.driverId === driverId && r.endpoint === endpoint);
  }
  async deleteByEndpoint(driverId: string, endpoint: string) {
    this.rows = this.rows.filter((r) => !(r.driverId === driverId && r.endpoint === endpoint));
  }
  async deleteById(id: string) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  async findNotCheckedOn(day: string, limit: number) {
    return this.rows.filter((r) => r.lastCheckedDay !== day).slice(0, limit);
  }
  async markChecked(id: string, day: string) {
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, lastCheckedDay: day } : r));
  }
}

export class FakeStats implements ReminderStatsQuery {
  due = new Map<string, number>();
  practised = new Set<string>();
  dueCalls = 0;
  async countDueCards(driverId: string) {
    this.dueCalls++;
    return this.due.get(driverId) ?? 0;
  }
  async hasAttemptSince(driverId: string) {
    return this.practised.has(driverId);
  }
}

export class FakeSender implements PushSender {
  sent: Array<{ endpoint: string; payload: string }> = [];
  results = new Map<string, PushSendResult | 'throw'>();
  async send(target: { endpoint: string }, payload: string): Promise<PushSendResult> {
    const r = this.results.get(target.endpoint) ?? 'ok';
    if (r === 'throw') throw new Error('network down');
    if (r === 'ok') this.sent.push({ endpoint: target.endpoint, payload });
    return r;
  }
}

import type { PrismaClient } from '@prisma/client';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import type {
  NewPushSubscription,
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from '@/application/push/push.port';

/** Change 52: 推播訂閱的 Postgres 實作。 */
export class PrismaPushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(s: NewPushSubscription): Promise<void> {
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: s.endpoint },
      select: { driverId: true },
    });
    const keys = { p256dh: s.p256dh, auth: s.auth, locale: s.locale };
    // 同一台裝置換了帳號：轉移給新帳號，並清掉舊的「今天已處理」標記。
    const owner =
      existing && existing.driverId !== s.driverId
        ? { driverId: s.driverId, lastCheckedDay: null }
        : {};
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: s.endpoint },
      create: { driverId: s.driverId, endpoint: s.endpoint, ...keys },
      update: { ...keys, ...owner },
    });
  }

  countByDriver(driverId: string): Promise<number> {
    return this.prisma.pushSubscription.count({ where: { driverId } });
  }

  async existsForDriver(driverId: string, endpoint: string): Promise<boolean> {
    return (await this.prisma.pushSubscription.count({ where: { driverId, endpoint } })) > 0;
  }

  async deleteByEndpoint(driverId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { driverId, endpoint } });
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { id } });
  }

  async findNotCheckedOn(day: string, limit: number): Promise<PushSubscriptionRecord[]> {
    const rows = await this.prisma.pushSubscription.findMany({
      where: { OR: [{ lastCheckedDay: null }, { lastCheckedDay: { not: day } }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      driverId: r.driverId,
      endpoint: r.endpoint,
      p256dh: r.p256dh,
      auth: r.auth,
      locale: isLocale(r.locale) ? r.locale : DEFAULT_LOCALE,
      lastCheckedDay: r.lastCheckedDay,
    }));
  }

  async markChecked(id: string, day: string): Promise<void> {
    await this.prisma.pushSubscription.updateMany({ where: { id }, data: { lastCheckedDay: day } });
  }
}

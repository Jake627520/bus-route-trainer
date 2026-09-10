import { describe, it, expect } from 'vitest';

describe('Bus Route Trainer - Foundation Test Suite', () => {
  it('verifies testing environment and basic assertion capabilities', () => {
    const appName = 'Bus Route Trainer';
    const locale = 'en-AU';

    expect(appName).toBe('Bus Route Trainer');
    expect(locale).toBe('en-AU');
  });

  it('verifies Zod schema validation for route number', async () => {
    const { z } = await import('zod');
    const routeSchema = z.object({
      routeShortName: z.string().min(1),
      routeLongName: z.string().min(1),
    });

    const validRoute = {
      routeShortName: '66',
      routeLongName: 'RBWH - UQ Lakes via Cultural Centre',
    };

    const parsed = routeSchema.safeParse(validRoute);
    expect(parsed.success).toBe(true);
  });
});

describe('Database Connection via Prisma Client', () => {
  it('successfully executes a query against local PostgreSQL bus_route_trainer', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      await prisma.$connect();
      const result: Array<{ current_database: string; current_user: string }> =
        await prisma.$queryRaw`SELECT current_database(), current_user`;
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].current_database).toBe('bus_route_trainer');
    } finally {
      await prisma.$disconnect();
    }
  });
});

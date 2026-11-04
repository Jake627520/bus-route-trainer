import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Process-wide Prisma client. Route handlers and session checks share this
 * instance instead of opening another pool.
 */
export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

globalForPrisma.prisma = prisma;

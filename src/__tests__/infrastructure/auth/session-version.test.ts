import { Prisma, type PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { currentSessionVersion, revokeSessions } from '@/infrastructure/auth/session-version';

function missingColumn(column = 'driver.session_version') {
  const message = /session_version|sessionVersion/.test(column)
    ? 'The column `session_version` does not exist in the current database.'
    : `The column \`${column}\` does not exist in the current database.`;
  return new Prisma.PrismaClientKnownRequestError(message, {
    code: 'P2022',
    clientVersion: 'test',
    meta: { column },
  });
}

function fakeDb(findUnique: ReturnType<typeof vi.fn>, updateMany: ReturnType<typeof vi.fn> = vi.fn()) {
  return { driver: { findUnique, updateMany } } as unknown as PrismaClient;
}

describe('session version without a migrated preview database', () => {
  it('reads the shared prisma client instead of constructing its own', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/infrastructure/auth/session-version.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/new PrismaClient/);
    expect(source).toContain("from '@/infrastructure/db/prisma'");
  });

  it('returns the stored version when the column exists', async () => {
    const findUnique = vi.fn().mockResolvedValue({ sessionVersion: 4 });
    const db = fakeDb(findUnique);
    await expect(currentSessionVersion('drv-1', db)).resolves.toBe(4);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('returns null when the driver row does not exist', async () => {
    const db = fakeDb(vi.fn().mockResolvedValue(null));
    await expect(currentSessionVersion('missing', db)).resolves.toBeNull();
  });

  it('treats a missing session_version column as version 0 for an existing driver', async () => {
    const findUnique = vi
      .fn()
      .mockRejectedValueOnce(missingColumn())
      .mockResolvedValueOnce({ id: 'drv-1' });
    const db = fakeDb(findUnique);
    await expect(currentSessionVersion('drv-1', db)).resolves.toBe(0);
    expect(findUnique.mock.calls[1][0].select).toEqual({ id: true });
  });

  it('still rejects a deleted driver when the column is missing', async () => {
    const findUnique = vi.fn().mockRejectedValueOnce(missingColumn()).mockResolvedValueOnce(null);
    await expect(currentSessionVersion('gone', fakeDb(findUnique))).resolves.toBeNull();
  });

  it('does not hide a different missing column', async () => {
    const findUnique = vi.fn().mockRejectedValue(missingColumn('email'));
    await expect(currentSessionVersion('drv-1', fakeDb(findUnique))).rejects.toMatchObject({ code: 'P2022' });
  });

  it('does not revoke when the column is missing, and still revokes when it exists', async () => {
    const missing = vi.fn().mockRejectedValue(missingColumn());
    await expect(revokeSessions('drv-1', fakeDb(vi.fn(), missing))).resolves.toBeUndefined();

    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await revokeSessions('drv-1', fakeDb(vi.fn(), updateMany));
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'drv-1' },
      data: { sessionVersion: { increment: 1 } },
    });
  });
});

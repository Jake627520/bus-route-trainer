import { Prisma } from '@prisma/client';

/**
 * Preview can run this code before `session_version` exists. Prisma reports
 * that as P2022. Other missing columns must still fail.
 */
export function isMissingSessionVersionColumn(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2022') {
    return false;
  }
  const column = error.meta?.column;
  const haystack = `${typeof column === 'string' ? column : ''} ${error.message}`;
  return /session_version|sessionVersion/.test(haystack);
}

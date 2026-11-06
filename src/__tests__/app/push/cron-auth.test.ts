import { describe, it, expect } from 'vitest';
import { isAuthorizedCron } from '@/app/_lib/cron-auth';

const req = (authorization?: string) =>
  new Request('http://localhost/api/cron/x', { headers: authorization ? { authorization } : {} });

describe('Change 52: isAuthorizedCron', () => {
  it('accepts the exact bearer secret', () => {
    expect(isAuthorizedCron(req('Bearer s3cret'), { CRON_SECRET: 's3cret' })).toBe(true);
  });
  it.each([
    ['no header', undefined],
    ['wrong secret', 'Bearer nope'],
    ['no Bearer prefix', 's3cret'],
    ['lower-case scheme', 'bearer s3cret'],
    ['extra space inside', 'Bearer  s3cret'],
    ['trailing junk', 'Bearer s3cretX'],
    ['prefix of the secret', 'Bearer s3cre'],
  ])('rejects: %s', (_n, header) => {
    expect(isAuthorizedCron(req(header), { CRON_SECRET: 's3cret' })).toBe(false);
  });
  it.each([undefined, '', '   '])('rejects everything when CRON_SECRET is unset/blank (%j)', (secret) => {
    expect(isAuthorizedCron(req('Bearer '), { CRON_SECRET: secret })).toBe(false);
    expect(isAuthorizedCron(req('Bearer undefined'), { CRON_SECRET: secret })).toBe(false);
    expect(isAuthorizedCron(req(), { CRON_SECRET: secret })).toBe(false);
  });
});

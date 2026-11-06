import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as forgot } from '@/app/api/auth/forgot/route';

/**
 * 稽核待辦 1（password reset poisoning）：POST /api/auth/forgot 寄出的連結
 * 必須指向設定好的 APP_URL，不能跟著偽造的 Host / X-Forwarded-Host 走。
 * 測試環境沒有 RESEND_API_KEY → ConsoleEmailSender 把信印到 console.log，這裡攔下來看連結。
 */
describe('POST /api/auth/forgot: reset link ignores the request host', () => {
  const prisma = new PrismaClient();

  const req = (url: string, body: unknown) =>
    new Request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: new URL(url).host,
        'x-forwarded-host': new URL(url).host,
      },
      body: JSON.stringify(body),
    });

  let logged: string[];
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => {
    await prisma.driver.deleteMany();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await prisma.driver.deleteMany();
    await register(req('http://localhost/api/auth/register', { username: 'frank', password: 'GoodPass#9', email: 'frank@example.com' }));
    logged = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.join(' ')); });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('builds the reset link from APP_URL even when the request host is spoofed', async () => {
    vi.stubEnv('APP_URL', 'https://bus.example.com');
    const res = await forgot(req('https://evil.example/api/auth/forgot', { email: 'frank@example.com' }));
    expect(res.status).toBe(200);
    const mail = logged.join('\n');
    expect(mail).toContain('https://bus.example.com/reset');
    expect(mail).not.toContain('evil.example');
  });

  it('in production with APP_URL but no RESEND_API_KEY: answers 200 and no log carries the token or link', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://bus.example.com');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('AUTH_SECRET', 'test-only-strong-secret-value');
    for (const m of ['info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logged.push(args.join(' ')); });
    }
    // route 在 module 載入時建 sender，要在 production env 下重新載入。
    vi.resetModules();
    const { POST: prodForgot } = await import('@/app/api/auth/forgot/route');
    const res = await prodForgot(req('https://bus.example.com/api/auth/forgot', { email: 'frank@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(await prisma.passwordResetToken.count()).toBe(1);
    const all = logged.join('\n');
    expect(all).not.toContain('/reset');
    expect(all).not.toMatch(/token=/);
    expect(all).not.toContain('frank@example.com');
  });

  it('in production without APP_URL: still answers 200 but sends no email and stores no token', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('AUTH_SECRET', 'test-only-strong-secret-value');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await forgot(req('https://evil.example/api/auth/forgot', { email: 'frank@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(logged.join('\n')).not.toContain('evil.example');
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createEmailSender, ConsoleEmailSender, ResendEmailSender } from '@/infrastructure/auth/resend-email-sender';

/**
 * PR #53 驗收 High：production 沒有 RESEND_API_KEY 時，不能用會把信件內容
 * （含重設 token 的連結）印到 log 的 sender。改用 no-op，只記一行不含內容的警告。
 */
describe('createEmailSender: never logs email content in production', () => {
  const TOKEN = 'secret-reset-token-abc123';
  const message = {
    to: 'frank@example.com',
    subject: 'Reset your password',
    html: `<a href="https://bus.example.com/reset?token=${TOKEN}">reset</a>`,
    text: `https://bus.example.com/reset?token=${TOKEN}`,
  };

  const captureLogs = () => {
    const lines: string[] = [];
    const grab = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation(grab);
    return lines;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('in production without RESEND_API_KEY: sends nothing and logs neither token nor link', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const lines = captureLogs();
    const sender = createEmailSender();
    expect(sender).not.toBeInstanceOf(ConsoleEmailSender);
    await expect(sender.send(message)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    const all = lines.join('\n');
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain('/reset');
    expect(all).not.toContain(message.to);
    expect(lines.some((l) => /RESEND_API_KEY/.test(l))).toBe(true);
  });

  it('in production with RESEND_API_KEY: uses Resend', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    expect(createEmailSender()).toBeInstanceOf(ResendEmailSender);
  });

  it('outside production without a key: keeps the console sender for local dev', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(createEmailSender()).toBeInstanceOf(ConsoleEmailSender);
  });
});

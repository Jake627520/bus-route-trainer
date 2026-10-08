import { DriverAccountRepository } from '@/application/auth/driver-account-repository.port';
import { EmailSender } from '@/application/auth/email-sender.port';
import { Clock } from '@/application/common/clock';

export interface RequestPasswordResetCommand {
  email: string;
  /** 重設頁網址（token 會以 ?token= 附加）。 */
  resetUrlBase: string;
}

export type TokenFactory = () => { token: string; tokenHash: string };

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 小時

/**
 * Change 41: 請求密碼重設。找到 email 對應帳號才寄信；無論是否存在都正常結束（不洩漏帳號是否存在）。
 */
export class RequestPasswordResetUseCase {
  constructor(
    private readonly repo: DriverAccountRepository,
    private readonly emailSender: EmailSender,
    private readonly clock: Clock,
    private readonly tokenFactory: TokenFactory
  ) {}

  async execute(command: RequestPasswordResetCommand): Promise<void> {
    const email = command.email.trim().toLowerCase();
    const driver = await this.repo.findByEmail(email);
    if (!driver) return; // 不洩漏：靜默結束

    const { token, tokenHash } = this.tokenFactory();
    const expiresAt = new Date(this.clock.now().getTime() + TOKEN_TTL_MS);
    await this.repo.createResetToken(driver.id, tokenHash, expiresAt);

    const link = `${command.resetUrlBase}?token=${encodeURIComponent(token)}`;
    await this.emailSender.send({
      to: email,
      subject: 'Reset your Route Memory Trainer password',
      text: `Reset your password using this link (valid for 1 hour):\n${link}\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>Reset your password using this link (valid for 1 hour):</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });
  }
}

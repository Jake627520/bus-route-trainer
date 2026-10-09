import { EmailSender, EmailMessage } from '@/application/auth/email-sender.port';

/** Change 41: Resend REST 寄信（免 SDK，直接打 API）。 */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend send failed: ${res.status} ${body}`);
    }
  }
}

/** 開發/未設金鑰時：把信（含重設連結）印到 console，不真的寄出。 */
export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.log(`[email:dev] to=${message.to}  subject=${message.subject}\n${message.text ?? message.html}`);
  }
}

/** 依環境選擇寄信器：有 RESEND_API_KEY 用 Resend，否則 console（dev）。 */
export function createEmailSender(): EmailSender {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? 'onboarding@resend.dev';
  return key && key.length > 0 ? new ResendEmailSender(key, from) : new ConsoleEmailSender();
}

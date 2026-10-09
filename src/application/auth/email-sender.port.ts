/** Change 41: 寄信埠（實作可為 Resend 或 dev console）。 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

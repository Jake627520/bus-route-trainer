export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

type Env = Record<string, string | undefined>;

/**
 * Change 52: 讀取 VAPID 設定。三個都有才算啟用；缺任一個就回 null，
 * 讓整個推播功能安靜地關閉（不影響其他功能）。
 */
export function readPushConfig(env: Env = process.env): PushConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

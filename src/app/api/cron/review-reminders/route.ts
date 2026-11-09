import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/app/_lib/cron-auth';
import { createReminderRunner } from '@/app/_lib/push-services';
import { SystemClock } from '@/application/common/clock';

// 排程端點：不可被快取，且每次都要執行。
export const dynamic = 'force-dynamic';

/**
 * Change 52: GET /api/cron/review-reminders — 由 Vercel cron 每天呼叫一次。
 * 驗證在最前面：沒帶或錯誤的密鑰一律 401，且不碰資料庫。
 * 回應只含計數，不含任何訂閱資料。
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid cron credentials' } },
      { status: 401 },
    );
  }
  try {
    const runner = createReminderRunner();
    if (!runner) return NextResponse.json({ data: { skipped: true } }, { status: 200 });
    const result = await runner.execute({ now: new SystemClock().now() });
    return NextResponse.json({ data: result }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 },
    );
  }
}

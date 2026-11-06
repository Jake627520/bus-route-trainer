import { NextResponse } from 'next/server';
import { unsubscribeFromPush } from '@/app/_lib/push-services';
import { readSessionDriverId, unauthorizedResponse } from '@/app/_lib/session';

const badRequest = (message: string) =>
  NextResponse.json({ error: { code: 'INVALID_REQUEST', message } }, { status: 400 });

/** Change 52: POST /api/push/unsubscribe — 取消這台裝置的訂閱（只能取消自己的；不存在也回成功）。 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const driverId = readSessionDriverId(request);
    if (!driverId) return unauthorizedResponse();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest('Request body must be valid JSON');
    }
    const endpoint = (body as { endpoint?: unknown } | null)?.endpoint;
    if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 2048) {
      return badRequest('endpoint must be a non-empty string');
    }

    await unsubscribeFromPush.execute({ driverId, endpoint });
    return NextResponse.json({ data: { ok: true } }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 },
    );
  }
}

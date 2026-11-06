import { NextResponse } from 'next/server';
import { PushSubscriptionError } from '@/application/push/subscribe-use-cases';
import { subscribeToPush } from '@/app/_lib/push-services';
import { readSessionDriverId, unauthorizedResponse } from '@/app/_lib/session';

const badRequest = (message: string) =>
  NextResponse.json({ error: { code: 'INVALID_REQUEST', message } }, { status: 400 });

/** Change 52: POST /api/push/subscribe — 登入司機為這台裝置建立（或更新）推播訂閱。 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const driverId = await readSessionDriverId(request);
    if (!driverId) return unauthorizedResponse();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest('Request body must be valid JSON');
    }
    if (!body || typeof body !== 'object') return badRequest('Request body must be an object');

    const { endpoint, keys, locale } = body as { endpoint?: unknown; keys?: unknown; locale?: unknown };
    await subscribeToPush.execute({ driverId, endpoint, keys, locale });
    return NextResponse.json({ data: { ok: true } }, { status: 200 });
  } catch (error) {
    if (error instanceof PushSubscriptionError) {
      const status = error.code === 'TOO_MANY_SUBSCRIPTIONS' ? 409 : 400;
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 },
    );
  }
}

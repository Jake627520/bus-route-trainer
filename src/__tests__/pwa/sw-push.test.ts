import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SW_SOURCE = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://app.test';

type Handler = (e: unknown) => void;
type FakeClient = { url: string; focus: ReturnType<typeof vi.fn> };

function loadSw(clients: FakeClient[] = []) {
  const handlers: Record<string, Handler> = {};
  const showNotification = vi.fn(async () => {});
  const openWindow = vi.fn(async () => ({}));
  const self = {
    addEventListener: (t: string, h: Handler) => { handlers[t] = h; },
    location: { origin: ORIGIN },
    registration: { showNotification },
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => clients), openWindow },
    skipWaiting: vi.fn(),
  };
  new Function('self', 'caches', 'fetch', 'Response', 'Request', 'URL', SW_SOURCE)(
    self, {}, vi.fn(), Response, Request, URL,
  );
  return { handlers, showNotification, openWindow, self };
}

async function push(sw: ReturnType<typeof loadSw>, data: { json: () => unknown } | null) {
  const waits: Promise<unknown>[] = [];
  sw.handlers.push({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
}
async function click(sw: ReturnType<typeof loadSw>, url: unknown) {
  const close = vi.fn();
  const waits: Promise<unknown>[] = [];
  sw.handlers.notificationclick({
    notification: { close, data: url === undefined ? undefined : { url } },
    waitUntil: (p: Promise<unknown>) => waits.push(p),
  });
  await Promise.all(waits);
  return { close };
}

describe('Change 52: service worker push', () => {
  it('shows the notification from the payload', async () => {
    const sw = loadSw();
    await push(sw, { json: () => ({ title: 'Review reminder', body: 'You have 3 cards to review', url: '/' }) });
    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(title).toBe('Review reminder');
    expect(options.body).toBe('You have 3 cards to review');
    expect(options.data).toEqual({ url: '/' });
    expect(options.icon).toBe('/icon-192.png');
    expect(options.tag).toBe('daily-review');
  });

  it.each([
    ['no payload at all', null],
    ['payload that is not JSON', { json: () => { throw new SyntaxError('bad'); } }],
    ['JSON that is not an object', { json: () => 42 }],
    ['JSON null', { json: () => null }],
    ['wrong field types', { json: () => ({ title: 5, body: {}, url: [] }) }],
  ])('ALWAYS still shows a generic notification when the payload is unusable: %s', async (_n, data) => {
    const sw = loadSw();
    await push(sw, data);
    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
    expect(options.data).toEqual({ url: '/' });
  });

  it.each([
    ['https://evil.example/phish'],
    ['//evil.example/phish'],
    ['javascript:alert(1)'],
    ['\\\\evil.example'],
    ['evil'],
  ])('refuses to carry a non-local URL into the notification: %s', async (url) => {
    const sw = loadSw();
    await push(sw, { json: () => ({ title: 't', body: 'b', url }) });
    const options = sw.showNotification.mock.calls[0][1] as unknown as { data: { url: string } };
    expect(options.data.url).toBe('/');
  });

  it('keeps a local path with a query', async () => {
    const sw = loadSw();
    await push(sw, { json: () => ({ title: 't', body: 'b', url: '/practice/recall?x=1' }) });
    expect((sw.showNotification.mock.calls[0][1] as unknown as { data: { url: string } }).data.url).toBe('/practice/recall?x=1');
  });
});

describe('Change 52: notification click', () => {
  it('closes the notification and opens the app when no window is open', async () => {
    const sw = loadSw([]);
    const { close } = await click(sw, '/');
    expect(close).toHaveBeenCalled();
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });

  it('focuses an existing app window instead of opening another', async () => {
    const focus = vi.fn(async () => {});
    const sw = loadSw([{ url: `${ORIGIN}/routes/R1`, focus }]);
    await click(sw, '/');
    expect(focus).toHaveBeenCalled();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('ignores windows of other origins', async () => {
    const focus = vi.fn(async () => {});
    const sw = loadSw([{ url: 'https://other.example/', focus }]);
    await click(sw, '/');
    expect(focus).not.toHaveBeenCalled();
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });

  it.each([
    ['https://evil.example/x'],
    ['//evil.example/x'],
    ['javascript:alert(1)'],
    [123],
    [undefined],
  ])('never opens a non-local URL (falls back to home): %s', async (url) => {
    const sw = loadSw([]);
    await click(sw, url);
    expect(sw.openWindow).toHaveBeenCalledTimes(1);
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });
});

describe('Change 52: service worker version', () => {
  it('bumps the cache version so old caches are cleaned on activate', () => {
    expect(SW_SOURCE).toMatch(/var VERSION = 'v2';/);
  });
});

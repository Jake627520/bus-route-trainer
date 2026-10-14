import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SW_SOURCE = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://app.test';
const abs = (u: string) => new URL(u, ORIGIN).toString();
const keyOf = (r: Request | string) => abs(typeof r === 'string' ? r : r.url);

/** 假的 CacheStorage：name -> (url -> Response)。 */
function makeCaches() {
  const store = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name)!;
    return {
      put: async (r: Request | string, res: Response) => { m.set(keyOf(r), res); },
      match: async (r: Request | string) => m.get(keyOf(r))?.clone(),
      keys: async () => [...m.keys()].map((u) => new Request(u)),
      delete: async (r: Request | string) => m.delete(keyOf(r)),
      addAll: async (urls: string[]) => {
        for (const u of urls) {
          const res = await fakeFetchRef.current(new Request(abs(u)));
          if (!res.ok) throw new Error('addAll failed ' + u);
          m.set(abs(u), res);
        }
      },
    };
  };
  return {
    store,
    api: {
      open,
      keys: async () => [...store.keys()],
      delete: async (name: string) => store.delete(name),
      match: async (r: Request | string) => {
        for (const m of store.values()) { const hit = m.get(keyOf(r)); if (hit) return hit.clone(); }
        return undefined;
      },
    },
  };
}
const fakeFetchRef = { current: (async () => new Response('x')) as (r: Request) => Promise<Response> };

type Handler = (e: unknown) => void;
function loadSw(opts: { fetchImpl?: (r: Request) => Promise<Response>; cachesApi?: unknown } = {}) {
  const handlers: Record<string, Handler> = {};
  const caches = makeCaches();
  const fetchMock = vi.fn(opts.fetchImpl ?? (async () => new Response('net', { status: 200 })));
  fakeFetchRef.current = fetchMock as never;
  const self = {
    addEventListener: (t: string, h: Handler) => { handlers[t] = h; },
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  new Function('self', 'caches', 'fetch', 'Response', 'Request', 'URL', SW_SOURCE)(
    self, opts.cachesApi ?? caches.api, fetchMock, Response, Request, URL,
  );
  return { handlers, caches, fetchMock, self };
}

/** 模擬一個 fetch 事件，回傳 service worker 是否接手，以及它給的回應。 */
async function dispatch(sw: ReturnType<typeof loadSw>, url: string, init: { method?: string; mode?: string } = {}) {
  let handled = false;
  let responsePromise: Promise<Response> | undefined;
  const request = { url: abs(url), method: init.method ?? 'GET', mode: init.mode ?? 'cors', clone() { return this; } };
  sw.handlers.fetch({
    request,
    respondWith: (p: Promise<Response>) => { handled = true; responsePromise = Promise.resolve(p); },
  });
  return { handled, response: handled ? await responsePromise! : undefined };
}
const nav = (sw: ReturnType<typeof loadSw>, url = '/') => dispatch(sw, url, { mode: 'navigate' });

async function installAndActivate(sw: ReturnType<typeof loadSw>) {
  const waits: Promise<unknown>[] = [];
  sw.handlers.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
  const waits2: Promise<unknown>[] = [];
  sw.handlers.activate({ waitUntil: (p: Promise<unknown>) => waits2.push(p) });
  await Promise.all(waits2);
}

describe('Change 51: service worker', () => {
  let offlineBody = 'OFFLINE PAGE';
  beforeEach(() => { offlineBody = 'OFFLINE PAGE'; });
  const withOfflinePage = (rest: (r: Request) => Promise<Response>) => async (r: Request) =>
    new URL(r.url).pathname === '/offline.html' ? new Response(offlineBody) : rest(r);

  it('install precaches the offline page', async () => {
    const sw = loadSw({ fetchImpl: withOfflinePage(async () => new Response('x')) });
    await installAndActivate(sw);
    const cached = await sw.caches.api.match('/offline.html');
    expect(await cached!.text()).toBe('OFFLINE PAGE');
  });

  it('does not take over open pages immediately (updates apply on the next load)', async () => {
    const sw = loadSw({ fetchImpl: withOfflinePage(async () => new Response('x')) });
    await installAndActivate(sw);
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
    expect(sw.self.clients.claim).not.toHaveBeenCalled();
  });

  it('activate deletes caches from older versions and keeps the current ones', async () => {
    const sw = loadSw({ fetchImpl: withOfflinePage(async () => new Response('x')) });
    await sw.caches.api.open('shell-v0-old');
    await sw.caches.api.open('static-v0-old');
    await sw.caches.api.open('someone-elses-cache');
    await installAndActivate(sw);
    const names = await sw.caches.api.keys();
    expect(names).not.toContain('shell-v0-old');
    expect(names).not.toContain('static-v0-old');
    expect(names.some((n) => n.startsWith('shell-'))).toBe(true);
  });

  describe('page navigations', () => {
    it('go to the network first and are NOT cached (no logged-in HTML stored on the device)', async () => {
      const sw = loadSw({ fetchImpl: withOfflinePage(async () => new Response('<html>my private data</html>')) });
      await installAndActivate(sw);
      const r = await nav(sw, '/routes/R1');
      expect(r.handled).toBe(true);
      expect(await r.response!.text()).toContain('my private data');
      const allKeys = [...sw.caches.store.values()].flatMap((m) => [...m.keys()]);
      expect(allKeys.some((k) => k.includes('/routes/R1'))).toBe(false);
    });

    it('show the cached offline page when the network is unreachable', async () => {
      const sw = loadSw({
        fetchImpl: withOfflinePage(async () => { throw new TypeError('Failed to fetch'); }),
      });
      await installAndActivate(sw);
      const r = await nav(sw, '/practice/recall');
      expect(await r.response!.text()).toBe('OFFLINE PAGE');
    });

    it('pass a server error through untouched (the server is reachable, so this is not "offline")', async () => {
      const sw = loadSw({ fetchImpl: withOfflinePage(async () => new Response('boom', { status: 500 })) });
      await installAndActivate(sw);
      const r = await nav(sw);
      expect(r.response!.status).toBe(500);
      expect(await r.response!.text()).toBe('boom');
    });

    it('still answer (503) if the offline page was never cached', async () => {
      const sw = loadSw({ fetchImpl: async () => { throw new TypeError('offline'); } });
      const r = await nav(sw);
      expect(r.response!.status).toBe(503);
    });
  });

  describe('requests it must leave alone', () => {
    it('never touches /api/*, whatever the method', async () => {
      const sw = loadSw();
      expect((await dispatch(sw, '/api/review/summary')).handled).toBe(false);
      expect((await dispatch(sw, '/api/recall/sessions', { method: 'POST' })).handled).toBe(false);
      expect((await dispatch(sw, '/api/auth/me')).handled).toBe(false);
    });

    it('does not turn a direct visit to an API URL into the offline page', async () => {
      // 在網址列直接開 /api/...（導覽請求）：不該被當成頁面而換成離線頁或被快取。
      const sw = loadSw({ fetchImpl: async () => { throw new TypeError('offline'); } });
      const r = await dispatch(sw, '/api/auth/me', { mode: 'navigate' });
      expect(r.handled).toBe(false);
    });

    it('ignores non-GET requests', async () => {
      const sw = loadSw();
      expect((await dispatch(sw, '/', { method: 'POST', mode: 'navigate' })).handled).toBe(false);
      expect((await dispatch(sw, '/_next/static/a.js', { method: 'PUT' })).handled).toBe(false);
    });

    it('ignores other origins', async () => {
      const sw = loadSw();
      const handled = await new Promise<boolean>((resolve) => {
        let h = false;
        sw.handlers.fetch({
          request: { url: 'https://evil.example/_next/static/a.js', method: 'GET', mode: 'cors' },
          respondWith: () => { h = true; },
        });
        resolve(h);
      });
      expect(handled).toBe(false);
    });

    it('ignores ordinary non-static GETs (manifest, images, RSC data…)', async () => {
      const sw = loadSw();
      for (const u of ['/manifest.webmanifest', '/icon-192.png', '/_next/image?url=a', '/favicon.ico']) {
        expect((await dispatch(sw, u)).handled, u).toBe(false);
      }
    });

    it('does not throw on a malformed request — it just lets the browser handle it', () => {
      const sw = loadSw();
      expect(() =>
        sw.handlers.fetch({ request: { url: 'not a url', method: 'GET', mode: 'cors' }, respondWith: () => { throw new Error('should not be called'); } }),
      ).not.toThrow();
    });
  });

  describe('immutable static assets (/_next/static/*)', () => {
    it('are fetched once, then served from the cache', async () => {
      const sw = loadSw({ fetchImpl: async () => new Response('console.log(1)', { status: 200 }) });
      const a = await dispatch(sw, '/_next/static/chunks/app.abc123.js');
      expect(a.handled).toBe(true);
      expect(await a.response!.text()).toBe('console.log(1)');
      await new Promise((r) => setTimeout(r, 0)); // 讓寫入快取完成
      const b = await dispatch(sw, '/_next/static/chunks/app.abc123.js');
      expect(await b.response!.text()).toBe('console.log(1)');
      expect(sw.fetchMock).toHaveBeenCalledTimes(1);
    });

    it('are served offline once cached', async () => {
      let online = true;
      const sw = loadSw({
        fetchImpl: async () => { if (!online) throw new TypeError('offline'); return new Response('chunk'); },
      });
      await dispatch(sw, '/_next/static/css/a.css');
      await new Promise((r) => setTimeout(r, 0));
      online = false;
      const r = await dispatch(sw, '/_next/static/css/a.css');
      expect(await r.response!.text()).toBe('chunk');
    });

    it('do not cache failures', async () => {
      const sw = loadSw({ fetchImpl: async () => new Response('nope', { status: 404 }) });
      await dispatch(sw, '/_next/static/missing.js');
      await new Promise((r) => setTimeout(r, 0));
      const again = await dispatch(sw, '/_next/static/missing.js');
      expect(again.response!.status).toBe(404);
      expect(sw.fetchMock).toHaveBeenCalledTimes(2);
    });

    it('keep the cache bounded', async () => {
      const sw = loadSw();
      for (let i = 0; i < 100; i++) {
        await dispatch(sw, `/_next/static/chunks/c${i}.js`);
        await new Promise((r) => setTimeout(r, 0));
      }
      await new Promise((r) => setTimeout(r, 5));
      const staticCache = [...sw.caches.store.entries()].find(([n]) => n.startsWith('static-'))![1];
      expect(staticCache.size).toBeLessThanOrEqual(80);
      expect(staticCache.has(abs('/_next/static/chunks/c99.js'))).toBe(true); // 最新的還在
    });

    it('fall back to the network if the cache itself is broken', async () => {
      const brokenCaches = {
        open: async () => { throw new Error('quota'); },
        keys: async () => [],
        delete: async () => true,
        match: async () => { throw new Error('broken'); },
      };
      const sw = loadSw({ cachesApi: brokenCaches, fetchImpl: async () => new Response('from network') });
      const r = await dispatch(sw, '/_next/static/a.js');
      expect(await r.response!.text()).toBe('from network');
    });
  });
});

/*
 * Change 51: Service Worker —— 讓網站可安裝，並在沒訊號時不白屏。
 *
 * 設計原則（寫壞的 service worker 可能讓整站打不開，所以越保守越好）：
 *  1. 只攔截「明確列出」的請求；其餘一律放行，由瀏覽器照常處理。
 *  2. 絕不快取 /api/*，也不快取頁面 HTML——登入後的個人資料不會留在裝置快取裡
 *     （共用手機、登出後都不會殘留，也不會顯示過期資料）。
 *  3. 只快取兩種東西：離線頁，以及檔名含雜湊、內容永遠不變的 /_next/static/*。
 *  4. 任何一步出錯都退回到網路，不讓 service worker 自己成為故障來源。
 *  5. 不呼叫 skipWaiting / clients.claim：新版在「下次載入」才生效，不會在使用者
 *     練習到一半時換掉底層。
 *
 * Change 52 加入 push／notificationclick 兩個事件（每日複習提醒）：
 *  - push 一定顯示通知（瀏覽器要求；內容壞掉也顯示通用文字）。
 *  - 點通知只開同網域的路徑，其餘一律回首頁。
 *
 * 想緊急停用：部署一個只做「unregister + 清空 caches」的 sw.js（見 HANDOFF.md）。
 */
'use strict';

var VERSION = 'v2';
var SHELL_CACHE = 'shell-' + VERSION;
var STATIC_CACHE = 'static-' + VERSION;
var OFFLINE_URL = '/offline.html';
var MAX_STATIC_ENTRIES = 80;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll([OFFLINE_URL]);
    })
  );
});

self.addEventListener('activate', function (event) {
  // 刪掉舊版本的快取（只動 shell-/static- 開頭、且不是目前版本的）。
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) {
            var ours = name.indexOf('shell-') === 0 || name.indexOf('static-') === 0;
            return ours && name !== SHELL_CACHE && name !== STATIC_CACHE;
          })
          .map(function (name) {
            return caches.delete(name);
          })
      );
    })
  );
});

self.addEventListener('fetch', function (event) {
  try {
    var request = event.request;
    if (request.method !== 'GET') return;

    var url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.indexOf('/api/') === 0) return;

    if (request.mode === 'navigate') {
      event.respondWith(handleNavigation(request));
      return;
    }
    if (url.pathname.indexOf('/_next/static/') === 0) {
      event.respondWith(handleStatic(request));
    }
  } catch {
    // 出任何錯：不接手，讓瀏覽器照常處理。
  }
});

/** 頁面導覽：先連網；真的連不上（斷線）才顯示離線頁。伺服器回的 4xx/5xx 照原樣給使用者。 */
function handleNavigation(request) {
  return fetch(request).catch(function () {
    return caches
      .match(OFFLINE_URL)
      .then(function (cached) {
        return cached || offlineFallback();
      })
      .catch(offlineFallback);
  });
}

function offlineFallback() {
  return new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** 不可變的靜態資源：快取優先；成功才存；存的數量有上限。 */
function handleStatic(request) {
  return caches
    .open(STATIC_CACHE)
    .then(function (cache) {
      return cache.match(request).then(function (hit) {
        if (hit) return hit;
        return fetch(request).then(function (response) {
          if (response && response.ok && response.type !== 'opaque') {
            var copy = response.clone();
            cache
              .put(request, copy)
              .then(function () {
                return trim(cache);
              })
              .catch(function () {});
          }
          return response;
        });
      });
    })
    .catch(function () {
      // 快取本身壞掉（容量、權限…）：退回網路，不讓它擋住頁面。
      return fetch(request);
    });
}

/** 只留最新的 MAX_STATIC_ENTRIES 筆（keys() 依寫入順序，前面的最舊）。 */
function trim(cache) {
  return cache.keys().then(function (keys) {
    var extra = keys.length - MAX_STATIC_ENTRIES;
    var deletions = [];
    for (var i = 0; i < extra; i++) deletions.push(cache.delete(keys[i]));
    return Promise.all(deletions);
  });
}

/* ---------- Change 52: 每日複習提醒 ---------- */

var NOTIFICATION_TAG = 'daily-review';
var FALLBACK_TITLE = 'Route Memory Trainer';
var FALLBACK_BODY = 'Time to review / 該複習了';

/** 只接受同網域的路徑（含查詢字串）；其他一律回首頁。 */
function safePath(value) {
  try {
    if (typeof value !== 'string' || value.charAt(0) !== '/' || value.charAt(1) === '/' || value.indexOf('\\') !== -1) {
      return '/';
    }
    var u = new URL(value, self.location.origin);
    if (u.origin !== self.location.origin) return '/';
    return u.pathname + u.search;
  } catch {
    return '/';
  }
}

self.addEventListener('push', function (event) {
  var data = {};
  try {
    var parsed = event.data ? event.data.json() : null;
    if (parsed && typeof parsed === 'object') data = parsed;
  } catch {
    // 內容無法解析：仍然顯示通用通知。
  }
  var title = typeof data.title === 'string' && data.title ? data.title : FALLBACK_TITLE;
  var body = typeof data.body === 'string' && data.body ? data.body : FALLBACK_BODY;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      tag: NOTIFICATION_TAG,
      data: { url: safePath(data.url) },
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var stored = event.notification.data;
  var target = self.location.origin + safePath(stored && stored.url);
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (windows) {
        for (var i = 0; i < windows.length; i++) {
          var w = windows[i];
          if (w.url.indexOf(self.location.origin) === 0 && w.focus) return w.focus();
        }
        return self.clients.openWindow(target);
      })
  );
});

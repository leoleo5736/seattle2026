/**
 * 西雅圖 × 波特蘭 — Service Worker
 * ------------------------------------------------------------
 * 做兩件事：
 *   1. 把網站外殼存進手機，飛機上、山區沒訊號時也打得開
 *   2. 絕不快取 Apps Script 的回應，行程資料寧可拿不到，
 *      也不要拿到過期的舊資料
 *
 * 改版時把 VERSION 加一，舊快取會自動清掉。
 */

var VERSION = 'v13';
var CACHE = 'sea-pdx-' + VERSION;

/* 網站外殼：這幾個檔案存下來，離線就能開 */
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 一個一個存，其中一個失敗不會拖垮整次安裝
      return Promise.all(SHELL.map(function (url) {
        return c.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf('sea-pdx-') === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Apps Script 一律直連，永遠不快取
  if (url.hostname.indexOf('script.google') > -1 ||
      url.hostname.indexOf('googleusercontent') > -1) {
    return;
  }

  // 其他網域的資源不管
  if (url.origin !== self.location.origin) return;

  // 開網頁：先試網路，失敗才拿快取
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (hit) {
          return hit || new Response('離線中，而且還沒存過這個網站。', {
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
          });
        });
      })
    );
    return;
  }

  // 其他檔案：先拿快取，背景順便更新
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

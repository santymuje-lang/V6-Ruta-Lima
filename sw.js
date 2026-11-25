/* eslint-disable no-restricted-globals */
// Service Worker de RUTA LIMA para carga instantánea y funcionamiento sin conexión

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `ruta-lima-shell-${CACHE_VERSION}`;
const ASSETS_CACHE = `ruta-lima-assets-${CACHE_VERSION}`;
const MAP_STYLES_CACHE = `ruta-lima-map-styles-${CACHE_VERSION}`;
const MAP_TILES_CACHE = `ruta-lima-map-tiles-${CACHE_VERSION}`;
const PMTILES_CACHE = `ruta-lima-pmtiles-${CACHE_VERSION}`;

const VALID_CACHES = new Set([
  SHELL_CACHE,
  ASSETS_CACHE,
  MAP_STYLES_CACHE,
  MAP_TILES_CACHE,
  PMTILES_CACHE,
]);

const MAX_MAP_TILES_ENTRIES = 4000;
const MAX_PMTILES_CHUNK_ENTRIES = 1500;
const MAX_ASSETS_ENTRIES = 250;

// Recursos base del shell siempre precacheados (funciona tanto en desarrollo como en producción)
const CORE_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/icon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
];

// En producción, VitePWA inyecta aquí la lista completa de assets compilados (HTML, JS, CSS, imágenes)
const INJECTED_MANIFEST = self.__WB_MANIFEST;
const PRECACHE_URLS = Array.from(
  new Set([
    ...CORE_SHELL_ASSETS,
    ...(Array.isArray(INJECTED_MANIFEST)
      ? INJECTED_MANIFEST.map((entry) => {
          const rawUrl = typeof entry === 'string' ? entry : entry && entry.url;
          if (!rawUrl) return null;
          return rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
        }).filter(Boolean)
      : []),
  ])
);

function isMapStyleOrFontRequest(url) {
  if (url.hostname === 'tiles.openfreemap.org') {
    return /^\/(styles|sprites|fonts)\//i.test(url.pathname);
  }
  return (
    /\/(styles|sprites|fonts|glyphs)\//i.test(url.pathname) ||
    /\/style\.json$/i.test(url.pathname)
  );
}

function isMapTileRequest(url) {
  if (url.hostname === 'tiles.openfreemap.org') {
    return !/^\/(styles|sprites|fonts)\//i.test(url.pathname);
  }
  if (url.hostname === 'tile.openstreetmap.org' || /\.tile\.openstreetmap\.org$/i.test(url.hostname)) {
    return true;
  }
  if (url.hostname === 'services.arcgisonline.com') {
    return true;
  }
  return /\/\d+\/\d+\/\d+(?:@\dx)?\.(?:png|jpg|jpeg|webp|pbf|mvt)$/i.test(url.pathname);
}

function isPmtilesProxyRequest(url) {
  return url.origin === self.location.origin && url.pathname === '/api/pmtiles';
}

function isStaticAppAsset(url, request) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/@vite') || url.pathname.startsWith('/@react-refresh')) return false;

  const dest = request.destination;
  if (
    dest === 'script' ||
    dest === 'style' ||
    dest === 'worker' ||
    dest === 'font' ||
    dest === 'image' ||
    dest === 'manifest'
  ) {
    return true;
  }

  return /\.(?:js|mjs|css|html|svg|png|jpg|jpeg|webp|ico|woff|woff2|wasm|webmanifest|json)$/i.test(
    url.pathname
  );
}

function isHashedProductionAsset(url) {
  return (
    url.origin === self.location.origin &&
    /^\/assets\/.+-[a-zA-Z0-9_-]{6,}\.(?:js|mjs|css|woff2?|png|svg|webp)$/i.test(url.pathname)
  );
}

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    const excess = keys.length - maxEntries;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  } catch {
    // Ignorar errores puntuales de cuota o limpieza
  }
}

function isCacheableResponse(response) {
  return Boolean(response && (response.status === 200 || response.type === 'opaque'));
}

// Estrategia Cache-First: responde al instante desde caché y guarda nuevas respuestas en caché
async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const networkResponse = await fetch(request);
  if (isCacheableResponse(networkResponse)) {
    cache.put(request, networkResponse.clone()).then(() => {
      if (maxEntries) trimCache(cacheName, maxEntries);
    }).catch(() => {});
  }
  return networkResponse;
}

// Estrategia Stale-While-Revalidate: sirve al instante desde caché y actualiza en segundo plano
async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((networkResponse) => {
      if (isCacheableResponse(networkResponse)) {
        cache.put(request, networkResponse.clone()).then(() => {
          if (maxEntries) trimCache(cacheName, maxEntries);
        }).catch(() => {});
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const fresh = await networkPromise;
  if (fresh) return fresh;
  throw new Error('Recurso no disponible sin conexión');
}

// Estrategia Network-First con tiempo límite breve para index.html / navegación SPA
async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);

  const networkWithTimeout = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('navigation-timeout')), 2500);
    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        if (response && response.ok) {
          cache.put('/index.html', response.clone()).catch(() => {});
          cache.put('/', response.clone()).catch(() => {});
        }
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });

  try {
    return await networkWithTimeout;
  } catch {
    const cachedIndex =
      (await cache.match(request)) ||
      (await cache.match('/index.html')) ||
      (await cache.match('/'));
    if (cachedIndex) {
      return cachedIndex;
    }
    return new Response(
      '<!doctype html><html lang="es"><body style="background:#0b0f19;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>RUTA LIMA sin conexión</h2><p>Conéctate una vez a internet para guardar el mapa en caché.</p></div></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// Caché especializado para fragmentos HTTP Range (206 Partial Content) de PMTiles de Perú
async function handlePmtilesRangeRequest(request, url) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) {
    return cacheFirst(request, PMTILES_CACHE, MAX_PMTILES_CHUNK_ENTRIES);
  }

  const cache = await caches.open(PMTILES_CACHE);
  const syntheticKey = new Request(
    `${url.origin}${url.pathname}${url.search}&__sw_range=${encodeURIComponent(rangeHeader)}`,
    { method: 'GET' }
  );

  const cached = await cache.match(syntheticKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    return new Response(cached.body, {
      status: 206,
      statusText: 'Partial Content',
      headers,
    });
  }

  const networkResponse = await fetch(request);
  if (networkResponse.status === 200 || networkResponse.status === 206) {
    try {
      const cloned = networkResponse.clone();
      const buffer = await cloned.arrayBuffer();
      const headers = new Headers();
      for (const h of [
        'content-type',
        'content-range',
        'content-length',
        'accept-ranges',
        'etag',
        'cache-control',
        'expires',
        'last-modified',
      ]) {
        const val = networkResponse.headers.get(h);
        if (val) headers.set(h, val);
      }
      // Cache API no admite status 206 directamente; se almacena como 200 y se reconstruye como 206 al leer
      const storableResponse = new Response(buffer, {
        status: 200,
        statusText: 'OK',
        headers,
      });
      cache.put(syntheticKey, storableResponse).then(() => {
        trimCache(PMTILES_CACHE, MAX_PMTILES_CHUNK_ENTRIES);
      }).catch(() => {});
    } catch {
      // Si falla el almacenamiento del chunk, devolver igual la respuesta de red
    }
  }

  return networkResponse;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((assetUrl) =>
            cache.add(new Request(assetUrl, { cache: 'reload' })).catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (!VALID_CACHES.has(key)) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1. Navegación principal (index.html)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // 2. Fragmentos vectoriales de PMTiles de Perú (HTTP Range 206)
  if (isPmtilesProxyRequest(url)) {
    event.respondWith(handlePmtilesRangeRequest(request, url));
    return;
  }

  // No interceptar otras rutas dinámicas de API (rutas OSRM, salud, Overpass)
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return;
  }

  // 3. Estilos, sprites y fuentes/glifos del mapa vectorial
  if (isMapStyleOrFontRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, MAP_STYLES_CACHE, 250));
    return;
  }

  // 4. Mosaicos vectoriales, raster OSM y satelitales
  if (isMapTileRequest(url)) {
    event.respondWith(cacheFirst(request, MAP_TILES_CACHE, MAX_MAP_TILES_ENTRIES));
    return;
  }

  // 5. Recursos principales de la app (JS, CSS, workers, íconos, fuentes locales)
  if (isHashedProductionAsset(url)) {
    event.respondWith(cacheFirst(request, ASSETS_CACHE, MAX_ASSETS_ENTRIES));
    return;
  }

  if (isStaticAppAsset(url, request)) {
    event.respondWith(staleWhileRevalidate(request, ASSETS_CACHE, MAX_ASSETS_ENTRIES));
  }
});

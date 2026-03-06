/* =============================================
   TimeLiveAHP — Service Worker
   Stratégie : Cache First pour assets statiques
               Network First pour Firebase/API
   ============================================= */

const CACHE_NAME    = 'timeliveahp-v1';
const CACHE_STATIC  = 'timeliveahp-static-v1';

// Fichiers à mettre en cache immédiatement à l'installation
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/concert.html',
  '/style.css',
  '/app.js',
  '/favicon.svg',
  '/manifest.json',
];

// ---- Installation : mise en cache des assets statiques ----
self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ---- Activation : nettoyage des anciens caches ----
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_STATIC)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ---- Fetch : stratégie selon le type de requête ----
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorer les requêtes Firebase, Google Fonts, CDN — toujours réseau
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('unpkg.com') ||
    event.request.method !== 'GET'
  ) {
    return; // laisser passer sans interception
  }

  // Pour les assets locaux : Cache First, puis réseau en fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then(response => {
          // Mettre en cache la nouvelle ressource
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then(cache => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Hors-ligne et pas en cache : afficher la page principale
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
    })
  );
});

// ---- Message : forcer la mise à jour du cache ----
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

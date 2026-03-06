/* =============================================
   TimeLiveAHP — Service Worker
   Stratégie : Cache uniquement les assets locaux
               Tout le reste passe par le réseau
   ============================================= */

const CACHE_NAME = 'timeliveahp-static-v3';

// Uniquement les fichiers locaux du projet
const STATIC_ASSETS = [
  '/index.html',
  '/concert.html',
  '/style.css',
  '/app.js',
  '/favicon.svg',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ---- Installation ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ---- Activation : supprime les anciens caches ----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---- Fetch : UNIQUEMENT les fichiers locaux sont mis en cache ----
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Laisser passer SANS interception tout ce qui n'est pas local
  // Firebase Auth, Firestore, Google APIs, CDN, fonts → réseau direct
  if (url.origin !== self.location.origin) {
    return;
  }

  // Laisser passer les requêtes non-GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Pour les fichiers locaux : réseau d'abord, cache en fallback (hors-ligne)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Mettre à jour le cache avec la version fraîche
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Hors-ligne → retourner depuis le cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback ultime : page principale
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

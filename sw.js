/* ════════════════════════════════════════════════════════════════
   Visão e Funcionamento — sw.js
   Service worker mínimo (DEC-018): cacheia SOMENTE o shell estático.
   Dados (Supabase) NUNCA são cacheados — seção 5, item 9 do blueprint.
   ════════════════════════════════════════════════════════════════ */

/* DEC-025 (parte 1, Fase 3): cache versionado a cada entrega — v3.
   A troca de cache-first para network-first acontece em B10 (Fase 4). */
const CACHE = 'vf-shell-v3';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Só intercepta GET do próprio shell (mesma origem). Qualquer chamada
  // de dados (Supabase, outra origem) passa direto pela rede.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cacheado) => cacheado || fetch(event.request))
  );
});

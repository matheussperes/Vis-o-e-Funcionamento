/* ════════════════════════════════════════════════════════════════
   Visão e Funcionamento — sw.js
   Service worker mínimo (DEC-018): cacheia SOMENTE o shell estático.
   Dados (Supabase) NUNCA são cacheados — seção 5, item 9 do blueprint.
   ════════════════════════════════════════════════════════════════ */

/* DEC-025 (Fase 4 — B10): network-first com fallback ao cache e nome
   de cache versionado a cada deploy (v4 nesta entrega). Corrige o bug
   de produção em que o PWA servia o shell antigo após deploys. */
const CACHE = 'vf-shell-v7';

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
  if (url.pathname.startsWith('/api/')) return;   // DEC-027: Copiloto nunca passa pelo cache

  // Network-first (DEC-025): busca na rede e atualiza o cache; o cache
  // só é servido quando a rede falha (offline).
  event.respondWith(
    fetch(event.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copia));
        return resposta;
      })
      .catch(() => caches.match(event.request))
  );
});

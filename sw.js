// Service Worker: cacheia a casca do app (HTML/CSS/JS) e as respostas GET da API
// (catálogo, listas), para que o app funcione mesmo sem internet. Requisições POST
// (escritas) nunca são interceptadas aqui — se falharem, quem trata é o api.js,
// enfileirando em idb-queue.js.
const CACHE_NAME = 'vendas-cache-v1';
const APP_SHELL = [
  './painel.html',
  './catalogo.html',
  './styles.css',
  './config.js',
  './api.js',
  './idb-queue.js',
  './painel.js',
  './catalogo.js',
  './manifest.json',
  './icons/logo-header.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST segue direto pra rede, sem passar pelo cache

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
        return res;
      })
      .catch(() => caches.match(req))
  );
});

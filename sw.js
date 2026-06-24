const CACHE = 'aceitabilidade-v17';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './registro.js',
  './inteligencia.js',
  './graficos.js',
  './relatorios.js',
  './supabase.js',
  './gestao.js',
  './lib/xlsx.full.min.js',
  './lib/chart.umd.js',
  './lib/supabase.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/maskable-512.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // SÓ intercepta assets do próprio app (mesma origem). Requisições a OUTRA origem —
  // em especial a API REST do Supabase (leitura do BI e da área do gestor) — passam
  // direto pela rede. Sem isto, o SW guardava as respostas da API cache-first e servia
  // dados VELHOS para sempre (BI/gestor não viam testes novos nem exclusões), furando o
  // cache:'no-store' do supabase-js. Ver tasks/lessons.md (2026-06-24).
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return resp;
      }).catch(() => cached);
    })
  );
});

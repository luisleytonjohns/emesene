// Service worker de eMeSeNe: permite instalar la app y abrirla aunque la conexión sea mala.
// Siempre intenta traer la versión nueva desde internet; usa la copia guardada solo si no hay conexión.
const CACHE = 'emesene-1.0.0';
const ARCHIVOS = [
  './',
  'index.html',
  'css/estilos.css',
  'js/app.js',
  'js/config.js',
  'manifest.json',
  'iconos/icono.svg',
  'iconos/icono-192.png',
  'iconos/icono-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  // Solo maneja los archivos propios de la app; Firebase va directo a internet
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin) return;
  ev.respondWith(
    fetch(ev.request)
      .then((resp) => {
        const copia = resp.clone();
        if (resp.ok) caches.open(CACHE).then((c) => c.put(ev.request, copia));
        return resp;
      })
      .catch(() => caches.match(ev.request).then((r) => r || caches.match('index.html')))
  );
});

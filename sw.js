// La app se abre siempre desde lo guardado en el dispositivo (funciona sin internet)
// y, si hay conexión, revisa en segundo plano si GitHub tiene archivos más nuevos.
// No hace falta cambiar ningún número de versión al subir una actualización.
const CACHE = 'remitos';
const ARCHIVOS = ['./', 'app.js', 'lib/xlsx.full.min.js', 'lib/jspdf.umd.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const marca = r => r && (r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length'));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(ARCHIVOS.map(u => fetch(u, { cache: 'reload' }).then(r => { if (!r.ok) throw new Error(u); return c.put(u, r); }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function avisar() {
  (await self.clients.matchAll({ includeUncontrolled: true })).forEach(c => c.postMessage({ t: 'actualizado' }));
}
// Trae un archivo de la red, lo guarda y avisa a la app si cambió respecto del guardado.
async function refrescar(clave) {
  const c = await caches.open(CACHE), viejo = await c.match(clave, { ignoreSearch: true });
  const r = await fetch(clave, { cache: 'no-cache' });
  if (!r.ok) return r;
  await c.put(clave, r.clone());
  if (viejo && marca(viejo) !== marca(r)) avisar();
  return r;
}
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const clave = u.pathname.endsWith('/index.html') ? u.pathname.slice(0, -10) : u.pathname;
  const red = refrescar(clave);
  e.waitUntil(red.catch(() => {}));
  e.respondWith(caches.match(clave, { ignoreSearch: true }).then(r => r || red));
});
// La app pide revisar cuando vuelve a primer plano (en el celular puede quedar abierta días).
self.addEventListener('message', e => {
  if (e.data && e.data.t === 'revisar') e.waitUntil(Promise.all(ARCHIVOS.map(u => refrescar(new URL(u, self.registration.scope).pathname).catch(() => {}))));
});

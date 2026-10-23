/* Service worker : le jeu fonctionne hors ligne ; l'API multijoueur n'est jamais mise en cache. */
const V = 'proviseur-v8', SHELL = ['./', 'index.html', 'net.js', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  if (u.origin === location.origin && u.pathname.includes('/assets/') && !u.pathname.endsWith('manifest.json')) { // ressources 3D : cache d'abord
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; })));
    return;
  }
  e.respondWith(fetch(r).then(res => { if (res.ok && (u.origin === location.origin || /fonts\.(googleapis|gstatic)\.com/.test(u.host))) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; })
    .catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
});

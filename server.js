/* Proviseur · serveur multijoueur (Node 18+, aucune dépendance).
   Sert le jeu (dossier public/) et l'API temps réel : ligue, défis, salle des proviseurs, présence, applaudissements. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUB = path.join(__dirname, 'public');
const FILE = path.join(DATA_DIR, 'proviseur-data.json');
const CRIT = ['t', 'bac', 'bepc', 'rep', 'eff'];
const LIM = { ligue: 2000, defis: 3000, mur: 500 };

/* ---------- Données (persistées dans un fichier JSON) ---------- */
let DB = { tokens: {}, ligue: {}, defis: {}, mur: {} };
try { DB = Object.assign(DB, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) {}
fs.mkdirSync(DATA_DIR, { recursive: true });
let saveT = null;
function persist() {
  if (saveT) return;
  saveT = setTimeout(() => { saveT = null; const tmp = FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(DB), err => { if (!err) fs.rename(tmp, FILE, () => {}); }); }, 800);
}
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const str = (x, n) => String(x == null ? '' : x).replace(/[\u0000-\u001f<>]/g, ' ').slice(0, n);
function trim(coll, key) {
  const ids = Object.keys(DB[coll]); if (ids.length <= LIM[coll]) return;
  ids.sort((a, b) => (DB[coll][a][key] || 0) - (DB[coll][b][key] || 0));
  for (const id of ids.slice(0, ids.length - LIM[coll])) { delete DB[coll][id]; push('del', { c: coll, id }); }
}

/* ---------- Connexions temps réel (SSE) ---------- */
const conns = new Set(); // {res, uid}
const presence = {};     // uid -> données de présence
function send(c, ev, data) { try { c.res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) {} }
function visible(c, coll, doc) { return coll !== 'defis' || doc.de === c.uid || doc.a === c.uid; }
function push(ev, d) {
  for (const c of conns) {
    if (ev === 'doc' && !visible(c, d.c, d.data)) continue;
    send(c, ev, d);
  }
}
let peersT = null;
function pushPeers() {
  if (peersT) return;
  peersT = setTimeout(() => { peersT = null;
    const uids = [...new Set([...conns].map(c => c.uid))];
    push('peers', { peers: uids.map(u => ({ kind: 'viewer', by: u, presence: presence[u] || null })) }); }, 300);
}
function snapshot(c) {
  const L = Object.entries(DB.ligue).sort((a, b) => (b[1].maj || 0) - (a[1].maj || 0)).slice(0, 200);
  send(c, 'snap', { c: 'ligue', docs: L.map(([id, data]) => ({ id, data })) });
  const D = Object.entries(DB.defis).filter(([, d]) => visible(c, 'defis', d)).sort((a, b) => b[1].cree - a[1].cree).slice(0, 200);
  send(c, 'snap', { c: 'defis', docs: D.map(([id, data]) => ({ id, data })) });
  const M = Object.entries(DB.mur).sort((a, b) => b[1].t - a[1].t).slice(0, 60);
  send(c, 'snap', { c: 'mur', docs: M.map(([id, data]) => ({ id, data })) });
}

/* ---------- Identité anonyme : un jeton secret par navigateur ---------- */
function auth(uid, token) {
  if (!/^[a-z0-9]{6,40}$/.test(uid || '') || !/^[a-f0-9]{32,128}$/.test(token || '')) return false;
  const h = sha(token);
  if (!DB.tokens[uid]) { DB.tokens[uid] = h; persist(); return true; }
  return DB.tokens[uid] === h;
}
const buckets = {};
function limite(key, max, ms) {
  const now = Date.now(), b = buckets[key] = (buckets[key] || []).filter(t => now - t < ms);
  if (b.length >= max) return false; b.push(now); return true;
}
setInterval(() => { for (const k in buckets) if (!buckets[k].length) delete buckets[k]; }, 60000).unref();

/* ---------- Opérations ---------- */
function op(uid, b) {
  const now = Date.now();
  switch (b.op) {
    case 'set': { // ligue/<uid>
      if (b.path !== 'ligue/' + uid) throw [403, 'Écriture refusée'];
      const d = b.data; if (!d || typeof d !== 'object' || d.v !== 1 || typeof d.nom !== 'string') throw [400, 'Fiche invalide'];
      d.uid = uid; d.maj = now; DB.ligue[uid] = d; push('doc', { c: 'ligue', id: uid, data: d }); trim('ligue', 'maj'); break; }
    case 'add': {
      const d = b.data || {};
      if (b.coll === 'mur') {
        if (!limite('mur' + uid, 1, 3000)) throw [429, 'Trop rapide'];
        const txt = str(d.txt, 240).trim(); if (!txt) throw [400, 'Message vide'];
        const id = 'm' + now.toString(36) + crypto.randomBytes(3).toString('hex');
        const doc = { by: uid, ecole: str(d.ecole, 60) || 'Visiteur', txt, t: now };
        DB.mur[id] = doc; push('doc', { c: 'mur', id, data: doc }); trim('mur', 't');
      } else if (b.coll === 'defis') {
        if (d.de !== uid || !d.a || d.a === uid || !DB.ligue[d.a]) throw [400, 'Défi invalide'];
        if (!CRIT.includes(d.critere) || !Number.isFinite(+d.saison)) throw [400, 'Défi invalide'];
        if (!limite('defi' + uid, 10, 3600000)) throw [429, 'Trop de défis'];
        const id = 'd' + now.toString(36) + crypto.randomBytes(3).toString('hex');
        const doc = { de: uid, a: str(d.a, 64), deNom: str(d.deNom, 60), aNom: str(d.aNom, 60), critere: d.critere, saison: Math.trunc(+d.saison), statut: 'lance', mot: str(d.mot, 140), cree: now };
        DB.defis[id] = doc; push('doc', { c: 'defis', id, data: doc }); trim('defis', 'cree');
      } else throw [400, 'Collection inconnue'];
      break; }
    case 'update': { // defis/<id> : seul le destinataire répond
      const m = /^defis\/([\w-]+)$/.exec(b.path || ''); const doc = m && DB.defis[m[1]];
      if (!doc || doc.a !== uid || doc.statut !== 'lance' || !['accepte', 'refuse'].includes((b.data || {}).statut)) throw [403, 'Réponse refusée'];
      doc.statut = b.data.statut; push('doc', { c: 'defis', id: m[1], data: doc }); break; }
    case 'presence': {
      const d = b.data || {}; presence[uid] = { ecole: str(d.ecole, 60), annee: Math.trunc(+d.annee) || 0, uid }; pushPeers(); break; }
    case 'emit': {
      if (b.name !== 'bravo' || !limite('bravo' + uid, 5, 10000)) throw [429, 'Trop rapide'];
      const d = b.data || {}; const to = str(d.a, 64);
      for (const c of conns) if (c.uid === to) send(c, 'bravo', { data: { a: to, ecole: str(d.ecole, 60) } });
      break; }
    default: throw [400, 'Opération inconnue'];
  }
  persist();
}


/* ---------- Accès restreint (phase de test) ----------
   ACCESS_CODES="code-anna,code-paul,code-marc" : seuls les porteurs d'un code peuvent ouvrir le jeu et l'API.
   Retirez un code de la liste pour couper l'accès à un testeur. Variable absente = accès libre. */
const CODES = (process.env.ACCESS_CODES || '').split(',').map(x => x.trim()).filter(Boolean);
const passOf = c => sha('pv-access:' + c);
const PASSES = new Set(CODES.map(passOf));
const cookie = (req, n) => { const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? m[1] : ''; };
const LOGIN = err => `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proviseur · accès test</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1e3832;color:#eaf0eb;font:16px system-ui,sans-serif"><form method="post" action="/login" style="width:min(340px,90vw);display:grid;gap:12px">
<h1 style="margin:0;font:700 2rem Georgia,serif">Proviseur</h1><p style="margin:0;color:#a3b8ae">Version de test privée. Entrez le code d’accès reçu.</p>
<input name="code" type="password" autocomplete="current-password" autofocus required style="padding:.7rem;border-radius:6px;border:0;font:inherit">
${err ? '<p style="margin:0;color:#ff8f84">Code incorrect.</p>' : ''}<button style="padding:.7rem;border:0;border-radius:6px;background:#d4951a;font:600 1rem system-ui;cursor:pointer">Entrer</button></form></body></html>`;
function autorise(req) { return !PASSES.size || PASSES.has(cookie(req, 'pv_access')); }
const PUBLIC_PATHS = /^\/(manifest\.webmanifest|icons\/[\w.-]+|sw\.js|config\.js)$/;

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
function cors(res) { res.setHeader('access-control-allow-origin', process.env.CORS_ORIGIN || (process.env.ACCESS_CODES ? 'null' : '*')); res.setHeader('access-control-allow-headers', 'content-type'); res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS'); }

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (PASSES.size && u.pathname === '/login') {
    if (req.method === 'POST') {
      let b = ''; req.on('data', ch => { if (b.length < 500) b += ch; });
      return req.on('end', () => {
        const code = (new URLSearchParams(b).get('code') || '').trim();
        if (!limite('login' + req.socket.remoteAddress, 10, 60000) || !PASSES.has(passOf(code))) { res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }); return res.end(LOGIN(true)); }
        res.writeHead(303, { location: '/', 'set-cookie': `pv_access=${passOf(code)}; Max-Age=7776000; Path=/; HttpOnly; SameSite=Lax${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}` }); res.end();
      });
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(LOGIN(false));
  }
  if (!autorise(req) && !PUBLIC_PATHS.test(u.pathname)) {
    if (u.pathname.startsWith('/api/')) return json(res, 401, { error: 'accès réservé' });
    res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }); return res.end(LOGIN(false));
  }
  if (u.pathname === '/api/health') return json(res, 200, { ok: true, joueurs: new Set([...conns].map(c => c.uid)).size });
  if (u.pathname === '/api/stream') {
    const uid = u.searchParams.get('uid'), tok = u.searchParams.get('token');
    if (!auth(uid, tok)) return json(res, 403, { error: 'identité' });
    if (conns.size > 1500) return json(res, 503, { error: 'serveur plein' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const c = { res, uid }; conns.add(c); res.write('retry: 3000\n\n'); snapshot(c); pushPeers();
    const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(ka); conns.delete(c); if (![...conns].some(x => x.uid === uid)) delete presence[uid]; pushPeers(); });
    return;
  }
  if (u.pathname === '/api/call' && req.method === 'POST') {
    let body = '', big = false;
    req.on('data', ch => { body += ch; if (body.length > 24000) { big = true; req.destroy(); } });
    req.on('end', () => {
      if (big) return;
      try {
        const b = JSON.parse(body);
        if (!auth(b.uid, b.token)) return json(res, 403, { error: 'identité' });
        if (!limite('ip' + req.socket.remoteAddress + b.uid, 60, 60000)) return json(res, 429, { error: 'trop de requêtes' });
        op(b.uid, b); json(res, 200, { ok: true });
      } catch (e) { if (Array.isArray(e)) json(res, e[0], { error: e[1] }); else json(res, 400, { error: 'requête invalide' }); }
    });
    return;
  }
  /* fichiers statiques */
  let p = path.normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  const f = path.join(PUB, p);
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Introuvable'); }
    const h = { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' };
    if (/sw\.js$|index\.html$/.test(f)) h['cache-control'] = 'no-cache';
    res.writeHead(200, h); res.end(buf);
  });
}).listen(PORT, () => console.log(`Proviseur : http://localhost:${PORT}  (données : ${FILE}) · accès ${PASSES.size ? PASSES.size + ' code(s)' : 'LIBRE'}`));

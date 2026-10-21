/* Couche réseau : fournit au jeu l'API claude.use('db'|'user'|'room') en s'appuyant sur le serveur Proviseur. */
(function () {
  if (window.claude) return; // sur claude.ai, le runtime natif prend le relais
  var BASE = (new URLSearchParams(location.search).get('server') || window.PROVISEUR_SERVER || '').replace(/\/$/, '');
  var LS = 'proviseur-net-id';
  var hex = function (n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return [].map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); };
  var ID = (function () {
    try { var o = JSON.parse(localStorage.getItem(LS)); if (o && o.uid && o.token) return o; } catch (e) {}
    var o = { uid: 'u' + hex(8), token: hex(24) };
    try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {}
    return o;
  })();

  function call(body) {
    body.uid = ID.uid; body.token = ID.token;
    return fetch(BASE + '/api/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        if (r.ok) return r.json();
        var e = new Error('HTTP ' + r.status); e.code = r.status === 429 ? 'quota_exceeded' : 'invalid_argument'; throw e;
      });
  }

  /* --- Flux temps réel (SSE) --- */
  var maps = { ligue: new Map(), defis: new Map(), mur: new Map() }, loaded = {};
  var subs = [], peersCbs = [], busCbs = [], lastPeers = null, lastPresence = null, es = null;
  function notify(c) {
    subs.forEach(function (s) {
      if (s.c !== c) return;
      var docs = Array.from(maps[c].entries()).map(function (kv) { return { id: kv[0], _d: kv[1], data: function () { return kv[1]; } }; });
      if (s.order) docs.sort(function (a, b) { var x = a._d[s.order], y = b._d[s.order]; return (x > y ? 1 : x < y ? -1 : 0) * (s.dir === 'desc' ? -1 : 1); });
      if (s.max) docs = docs.slice(0, s.max);
      try { s.cb({ docs: docs }); } catch (e) { console.warn(e); }
    });
  }
  function open() {
    if (es) return; es = new EventSource(BASE + '/api/stream?uid=' + ID.uid + '&token=' + ID.token);
    es.addEventListener('open', function () { if (lastPresence) call({ op: 'presence', data: lastPresence }).catch(function () {}); });
    es.addEventListener('snap', function (e) { var d = JSON.parse(e.data); maps[d.c] = new Map(d.docs.map(function (x) { return [x.id, x.data]; })); loaded[d.c] = 1; notify(d.c); });
    es.addEventListener('doc', function (e) { var d = JSON.parse(e.data); maps[d.c].set(d.id, d.data); notify(d.c); });
    es.addEventListener('del', function (e) { var d = JSON.parse(e.data); maps[d.c].delete(d.id); notify(d.c); });
    es.addEventListener('peers', function (e) { lastPeers = JSON.parse(e.data).peers; peersCbs.forEach(function (f) { emitPeers(f); }); });
    es.addEventListener('bravo', function (e) { var d = JSON.parse(e.data); busCbs.forEach(function (b) { if (b.n === 'bravo') b.f({ data: d.data, sameTab: false }); }); });
  }
  function emitPeers(f) { f({ peers: (lastPeers || []).map(function (p) { return { kind: 'viewer', by: p.by, presence: p.presence, isMe: p.by === ID.uid }; }) }); }

  function query(c, o) {
    return {
      limit: function (n) { return query(c, { order: o.order, dir: o.dir, max: n }); },
      orderBy: function (f, d) { return query(c, { order: f, dir: d || 'asc', max: o.max }); },
      onSnapshot: function (cb) {
        open(); var s = { c: c, cb: cb, order: o.order, dir: o.dir, max: o.max }; subs.push(s);
        if (loaded[c]) notify(c);
        return function () { subs = subs.filter(function (x) { return x !== s; }); };
      },
      add: function (data) { return call({ op: 'add', coll: c, data: data }); }
    };
  }
  var db = {
    collection: function (c) { return query(c, {}); },
    doc: function (p) { return { set: function (data) { return call({ op: 'set', path: p, data: data }); }, update: function (data) { return call({ op: 'update', path: p, data: data }); } }; }
  };
  var user = {
    id: function () { return Promise.resolve(ID.uid); },
    can: function () { return Promise.resolve(true); },
    profiles: function (ids) { var o = {}; ids.forEach(function (i) { o[i] = { name: '' }; }); return Promise.resolve(o); }
  };
  var room = {
    onPeers: function (cb) { open(); peersCbs.push(cb); if (lastPeers) emitPeers(cb); },
    on: function (n, f) { open(); busCbs.push({ n: n, f: f }); },
    emit: function (n, d) { return call({ op: 'emit', name: n, data: d }); },
    presence: function (d) { lastPresence = d; open(); return call({ op: 'presence', data: d }).catch(function () {}); }
  };

  function joignable() {
    var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 6000);
    return fetch(BASE + '/api/health', { signal: ac.signal, cache: 'no-store' }).then(function (r) { clearTimeout(t); return r.ok; }, function () { clearTimeout(t); return false; });
  }
  window.claude = {
    use: function (name) {
      if (name === 'permissions') return Promise.resolve(null);
      return joignable().then(function (ok) { return !ok ? null : name === 'db' ? db : name === 'user' ? user : name === 'room' ? room : null; });
    }
  };
})();

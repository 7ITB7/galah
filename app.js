'use strict';
/* GALAH — the Bible map turned over onto North America */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = { get(k, d) { try { const v = localStorage.getItem('galah.' + k); return v == null ? d : JSON.parse(v) } catch (e) { return d } }, set(k, v) { try { localStorage.setItem('galah.' + k, JSON.stringify(v)) } catch (e) { } } };
const J = p => fetch('data/' + p).then(r => { if (!r.ok) throw new Error(p); return r.json() });
const BOOKS = META.books, IDS = BOOKS.map(b => b[0]);
const unpack = p => ({ bi: Math.floor(p / 1e6), c: Math.floor(p % 1e6 / 1e3), v: p % 1e3 });
const refStr = p => { const u = unpack(p); return `${BOOKS[u.bi] ? BOOKS[u.bi][1] : '?'} ${u.c}:${u.v}` };
const KEYS = ['zion', 'gulf', 'echo'];
const MI = 0.621371, WALK = 17, SAIL = 70;
const S = { key: LS.get('key', 'zion'), ghost: LS.get('ghost', true), echo: false, sel: -1, mode: 'browse', j: null, jk: 0, tilt: false, tab: 'map', ptype: 'all', q: '', shown: 120, ckey: null };
if (!KEYS.includes(S.key)) S.key = 'zion';
let P = [], K = {}, E = {}, SP = {}, GH = {}, map = null, marks = [], extra = [];

function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('on'), 2600) }
const hav = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)) };
const miles = km => km * MI;
const fmtMi = m => m < 10 ? m.toFixed(1) : Math.round(m).toLocaleString();
const days = (mi, mode) => { const d = mi / (mode === 'sail' ? SAIL : WALK); return d < 1 ? 'under a day' : d < 1.5 ? 'about a day' : Math.round(d) + ' days' };
const group = t => /body of water|river|spring|pool|well|ford/.test(t) ? 'water' : /mountain|hill|cliff|rock|promontory/.test(t) ? 'mount' : t === 'island' ? 'island' : /region|people group|natural area|valley|field|district/.test(t) ? 'region' : 'town';
const GCOL = { town: '#4fd1c5', water: '#6fb4e8', mount: '#e8bd72', island: '#7fe3a8', region: '#b9a6ff' };
const conf = c => c >= 900 ? 'site fairly certain' : c >= 600 ? 'site likely' : c >= 300 ? 'site uncertain' : 'site a guess';
const key = () => K.keys[S.key];
const spot = (i, k) => SP[k || S.key][i];
const isPin = (i, k) => (K.keys[k || S.key].anchors || []).some(a => a.i === i);
const pinOf = (i, k) => (K.keys[k || S.key].anchors || []).find(a => a.i === i) || (K.keys[k || S.key].overrides || []).find(a => a.i === i);

/* ---------- sheet ---------- */
const Sheet = {
  open(o) { $('#sheet-head').innerHTML = `<h2>${esc(o.title)}</h2><button data-act="sheetclose" aria-label="Close">✕</button>`; const b = $('#sheet-body'); b.scrollTop = 0; o.render(b); $('#sheet').classList.add('on'); $('#sheet-bg').classList.add('on') },
  close() { $('#sheet').classList.remove('on'); $('#sheet-bg').classList.remove('on') }
};

/* ---------- boot ---------- */
async function boot() {
  try {
    [P, K, E, SP.zion, SP.gulf, SP.echo] = await Promise.all([J('places.json'), J('keys.json'), J('echo.json'), J('spots-zion.json'), J('spots-gulf.json'), J('spots-echo.json')]);
  } catch (e) { $('#map-card').innerHTML = '<div class="t">Could not load the data.</div><div class="d">Check your connection and reload.</div>'; return }
  rankPlaces();
  document.addEventListener('click', onClick);
  $('#kname').textContent = key().short;
  initMap();
  renderTop();
  cardIdle();
  if (!LS.get('seen', false)) setTimeout(intro, 600);
}

/* importance: verse count, one entry per name */
let RANK = [], MAJOR = new Set();
function rankPlaces() {
  const best = {};
  P.forEach((p, i) => { if (!best[p[0]] || p[6].length > P[best[p[0]]][6].length) best[p[0]] = i });
  RANK = Object.values(best).sort((a, b) => P[b][6].length - P[a][6].length);
  RANK.slice(0, 140).forEach(i => MAJOR.add(i));
}

/* ---------- map ---------- */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRIL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const DEMT = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const VIEW = { zion: [[-126, 16], [-68, 52]], gulf: [[-118, 16], [-68, 47]], echo: [[-95, 33], [-60, 52]] };
const CORE = { zion: [[-113.2, 39.4], [-110.6, 42.1]], gulf: [[-98.2, 27.4], [-93.6, 31.6]], echo: [[-74.6, 40.9], [-71.8, 42.0]] };
function initMap() {
  try {
    map = new maplibregl.Map({ container: 'map', bounds: VIEW[S.key], fitBoundsOptions: { padding: { top: 60, bottom: 150, left: 10, right: 10 } }, maxPitch: 80, attributionControl: { compact: true },
      style: { version: 8, sources: {
        sat: { type: 'raster', tiles: [ESRI], tileSize: 256, maxzoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics · Terrain: Mapzen/AWS · Bible places: OpenBible.info (CC BY)' },
        lab: { type: 'raster', tiles: [ESRIL], tileSize: 256, maxzoom: 18 },
        dem: { type: 'raster-dem', tiles: [DEMT], encoding: 'terrarium', tileSize: 256, maxzoom: 13 } },
        layers: [{ id: 'sat', type: 'raster', source: 'sat' }, { id: 'lab', type: 'raster', source: 'lab', paint: { 'raster-opacity': .7 } }] } });
  } catch (e) { $('#map-card').innerHTML = '<div class="t">This browser can’t draw the 3D map.</div><div class="d">Everything else still works: try Places, Clues and Test.</div>'; return }
  map.on('load', () => {
    try { map.setTerrain({ source: 'dem', exaggeration: 1.4 }) } catch (e) { }
    const fc = () => ({ type: 'FeatureCollection', features: [] });
    ['ghost', 'pts', 'echoall', 'esel', 'route', 'sel', 'riv'].forEach(s => map.addSource(s, { type: 'geojson', data: fc() }));
    map.addLayer({ id: 'ghost-coast', type: 'line', source: 'ghost', filter: ['==', ['get', 'k'], 'coast'], paint: { 'line-color': '#e0ad4c', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, .8, 8, 1.6], 'line-opacity': .7, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'ghost-water', type: 'line', source: 'ghost', filter: ['!=', ['get', 'k'], 'coast'], paint: { 'line-color': '#8fd0ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 8, 2.4], 'line-opacity': .8 } });
    map.addLayer({ id: 'route-case', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#05090b', 'line-width': 7, 'line-opacity': .75 } });
    map.addLayer({ id: 'route-walk', type: 'line', source: 'route', filter: ['==', ['get', 'sail'], 0], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'done'], 1], '#4fd1c5', '#ffffff'], 'line-width': 3.4 } });
    map.addLayer({ id: 'route-sail', type: 'line', source: 'route', filter: ['==', ['get', 'sail'], 1], paint: { 'line-color': ['case', ['==', ['get', 'done'], 1], '#4fd1c5', '#ffffff'], 'line-width': 3.4, 'line-dasharray': [1.2, 1.2] } });
    map.addLayer({ id: 'pts-region', type: 'circle', source: 'pts', filter: ['==', ['get', 'g'], 'region'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 8, 12], 'circle-color': GCOL.region, 'circle-opacity': .18, 'circle-stroke-color': GCOL.region, 'circle-stroke-width': 1.2, 'circle-stroke-opacity': .7 } });
    map.addLayer({ id: 'echo-all', type: 'circle', source: 'echoall', layout: { visibility: 'none' }, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 9, 5], 'circle-color': '#ee7fb0', 'circle-stroke-color': '#2a0715', 'circle-stroke-width': .8 } });
    map.addLayer({ id: 'pts', type: 'circle', source: 'pts', filter: ['!=', ['get', 'g'], 'region'], paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['==', ['get', 'pin'], 1], 4.5, 2.4], 8, ['case', ['==', ['get', 'pin'], 1], 8, 5], 13, ['case', ['==', ['get', 'pin'], 1], 11, 8]],
      'circle-color': ['match', ['get', 'g'], 'water', GCOL.water, 'mount', GCOL.mount, 'island', GCOL.island, GCOL.town],
      'circle-stroke-color': ['case', ['==', ['get', 'pin'], 1], '#f2c55c', '#071214'], 'circle-stroke-width': ['case', ['==', ['get', 'pin'], 1], 2.4, .8] } });
    map.addLayer({ id: 'esel-line', type: 'line', source: 'esel', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#ee7fb0', 'line-width': 1.4, 'line-opacity': .8, 'line-dasharray': [2, 2] } });
    map.addLayer({ id: 'esel-pt', type: 'circle', source: 'esel', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5.5, 'circle-color': '#ee7fb0', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } });
    map.addLayer({ id: 'riv', type: 'circle', source: 'riv', paint: { 'circle-radius': 7, 'circle-color': '#fff', 'circle-opacity': .25, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'sel', type: 'circle', source: 'sel', paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } });
    setEchoAll(); drawKey(false);
    map.on('moveend', placeLabels);
  });
  map.on('click', e => {
    if (S.mode === 'journey') return;
    const b = [[e.point.x - 16, e.point.y - 16], [e.point.x + 16, e.point.y + 16]];
    const fs = map.queryRenderedFeatures(b, { layers: ['pts', 'pts-region'].concat(S.echo ? ['echo-all'] : []) });
    if (!fs.length) { if (S.sel >= 0) { deselect() } return }
    const d = f => { const c = f.geometry.coordinates, p = map.project(c); return Math.hypot(p.x - e.point.x, p.y - e.point.y) + (f.layer.id === 'pts-region' ? 14 : 0) + (f.layer.id === 'echo-all' ? 6 : 0) };
    fs.sort((a, b) => d(a) - d(b));
    const f = fs[0];
    if (f.layer.id === 'echo-all') { echoTownCard(f.properties); return }
    select(+f.properties.i, false);
  });
}
function ready() { return map && map.getSource && map.getSource('pts') }

function setEchoAll() {
  const seen = {}; const feats = [];
  for (const [n, list] of Object.entries(E)) for (const h of list) {
    const k = h[0] + '|' + h[1]; if (!seen[k]) { seen[k] = { t: h[0] + ', ' + h[1], la: h[2], lo: h[3], n: [] }; } if (!seen[k].n.includes(n)) seen[k].n.push(n)
  }
  for (const v of Object.values(seen)) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [v.lo, v.la] }, properties: { t: v.t, n: v.n.join('|') } });
  map.getSource('echoall').setData({ type: 'FeatureCollection', features: feats });
}

function drawKey(fly) {
  if (!ready()) return;
  const k = S.key, sp = SP[k];
  const feats = P.map((p, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [sp[i][1], sp[i][0]] }, properties: { i, g: group(p[1]), pin: isPin(i) ? 1 : 0 } }));
  map.getSource('pts').setData({ type: 'FeatureCollection', features: feats });
  loadGhost();
  if (S.mode === 'journey') drawJourney(false);
  else if (S.sel >= 0) { drawSel(); if (fly) { const s = spot(S.sel); map.flyTo({ center: [s[1], s[0]], zoom: Math.max(map.getZoom(), 6.5), duration: 1600 }) } }
  else if (fly) map.fitBounds(VIEW[k], { padding: pad(), duration: 1400 });
  placeLabels();
}
const pad = () => ({ top: 60, bottom: Math.min(230, ($('#map-card').offsetHeight || 120) + 24), left: 16, right: 16 });
async function loadGhost() {
  if (!ready()) return;
  const k = S.key;
  if (!GH[k]) { try { GH[k] = await J('ghost-' + k + '.json') } catch (e) { GH[k] = [] } }
  if (k !== S.key) return;
  const feats = S.ghost ? GH[k].map(g => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: g.c }, properties: { k: g.k, n: g.n } })) : [];
  map.getSource('ghost').setData({ type: 'FeatureCollection', features: feats });
}

/* labels as html markers with simple collision hiding */
function clearMarks(list) { list.forEach(m => m.remove()); list.length = 0 }
function mk(lnglat, text, cls, onclick, prio) {
  const el = document.createElement('div'); el.className = 'ptip ' + (cls || ''); el.textContent = text;
  if (onclick) el.addEventListener('click', e => { e.stopPropagation(); onclick() });
  const m = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -8] }).setLngLat(lnglat).addTo(map); m._prio = prio || 0; return m;
}
function placeLabels() {
  if (!ready()) return;
  clearMarks(marks);
  const z = map.getZoom(), b = map.getBounds(), k = S.key;
  const want = [];
  if (S.mode !== 'journey') {
    const n = z < 4 ? 14 : z < 5 ? 26 : z < 6.5 ? 50 : z < 8 ? 90 : 140;
    const pinset = new Set((key().anchors || []).map(a => a.i));
    const cand = new Set([...RANK.slice(0, n), ...pinset]);
    cand.forEach(i => { const s = spot(i); if (b.contains([s[1], s[0]])) want.push([i, s, (pinset.has(i) ? 1000 : 0) + P[i][6].length]) });
  }
  want.sort((a, b) => b[2] - a[2]);
  const boxes = [];
  const fits = (x, y, w) => { const r = [x - w / 2, y - 26, x + w / 2, y - 6]; for (const q of boxes) if (r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]) return false; boxes.push(r); return true };
  if (S.mode === 'journey' && S.j) {
    const st = jStops(S.j), seen = new Set(), order = st.map((s, k) => k).sort((a, b) => (b === S.jk) - (a === S.jk) || (b === 0 || b === st.length - 1) - (a === 0 || a === st.length - 1) || a - b);
    for (const k of order) { const s = st[k]; if (seen.has(s.i)) continue; const p = map.project([s.sp[1], s.sp[0]]), txt = (k + 1) + '. ' + P[s.i][0]; if (k !== S.jk && !fits(p.x, p.y, txt.length * 7.2 + 14)) continue; if (k === S.jk) fits(p.x, p.y, txt.length * 7.2 + 14); seen.add(s.i); marks.push(mk([s.sp[1], s.sp[0]], txt, 'stop' + (k === S.jk ? ' cur' : ''), () => { S.jk = k; drawJourney(false); flyStop() })) }
  }
  // selected + extra (echo labels, rivals) first so they always show
  extra.forEach(m => { const p = map.project(m.getLngLat()); boxes.push([p.x - m.getElement().textContent.length * 3.6 - 8, p.y - 26, p.x + m.getElement().textContent.length * 3.6 + 8, p.y - 6]) });
  if (S.sel >= 0 && S.mode !== 'journey') { const s = spot(S.sel); const p = map.project([s[1], s[0]]); fits(p.x, p.y, P[S.sel][0].length * 7.4 + 14); marks.push(mk([s[1], s[0]], P[S.sel][0], 'sel big', null, 9e9)) }
  for (const [i, s, pr] of want) {
    if (i === S.sel) continue;
    const p = map.project([s[1], s[0]]), w = P[i][0].length * 7 + 14;
    if (!fits(p.x, p.y, w)) continue;
    marks.push(mk([s[1], s[0]], P[i][0], (pr >= 1000 ? 'pin ' : '') + (P[i][6].length > 120 ? 'big' : ''), () => select(i, false), pr));
    if (marks.length > 70) break;
  }
}

/* ---------- top chips ---------- */
function renderTop() {
  $('#map-top').innerHTML = KEYS.map(k => `<button class="chip ${k === S.key ? 'on' : ''}" data-act="key" data-k="${k}">${esc(K.keys[k].short)}</button>`).join('') +
    `<span class="chip sep"></span><button class="chip tog ${S.ghost ? 'on' : ''}" data-act="ghost">Old world</button><button class="chip tog ${S.echo ? 'on' : ''}" data-act="echo">Same names</button>` +
    `<button class="chip" data-act="core">Canaan</button><button class="chip tog ${S.tilt ? 'on' : ''}" data-act="tilt">3D</button>`;
}

/* ---------- selection ---------- */
function select(i, fly) {
  if (S.mode === 'journey') endJourney(true);
  S.sel = i; drawSel(); cardPlace();
  const s = spot(i);
  if (fly !== false) map.flyTo({ center: [s[1], s[0]], zoom: Math.max(map.getZoom(), 7.5), duration: 1500, padding: pad() });
  else map.easeTo({ center: [s[1], s[0]], duration: 600, padding: pad() });
  placeLabels();
}
function deselect() { S.sel = -1; if (ready()) { ['sel', 'esel', 'riv'].forEach(x => map.getSource(x).setData({ type: 'FeatureCollection', features: [] })) } clearMarks(extra); cardIdle(); placeLabels() }
function drawSel() {
  if (!ready() || S.sel < 0) return;
  const s = spot(S.sel);
  map.getSource('sel').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [s[1], s[0]] }, properties: {} }] });
  const ech = E[P[S.sel][0]] || [], feats = [];
  clearMarks(extra);
  ech.forEach(h => {
    feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [h[3], h[2]] }, properties: {} });
    feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[s[1], s[0]], [h[3], h[2]]] }, properties: {} });
  });
  map.getSource('esel').setData({ type: 'FeatureCollection', features: feats });
  // label the nearest few namesakes
  ech.map(h => [h, hav(s[0], s[1], h[2], h[3])]).sort((a, b) => a[1] - b[1]).slice(0, 4).forEach(([h]) => extra.push(mk([h[3], h[2]], h[0] + ', ' + h[1], 'ech')));
}

/* ---------- cards ---------- */
function cardIdle() {
  const k = key();
  $('#map-card').innerHTML = `<div class="t">${esc(k.name)} <small>${P.length.toLocaleString()} Bible places</small></div><div class="d">${esc(k.pitch)}<br><span class="dim">Tap any dot. Gold rings are the pins that set the key.</span></div>
  <div class="ctl"><button class="go" data-act="howkey">How this key works</button><button data-act="tab" data-t="journeys">Journeys</button><button data-act="tab" data-t="test">Test it</button><button data-act="find">Find a place</button></div>`;
}
function cardPlace() {
  const i = S.sel, p = P[i], s = spot(i), pin = pinOf(i);
  const flag = s[3] === 'ashore' ? '<br><span class="old">This key drops it in the sea; it’s shown on the nearest shore.</span>' : s[3] === 'island on land' ? '<br><span class="old">This key puts this island on dry land.</span>' : '';
  const others = KEYS.filter(k => k !== S.key).map(k => `${esc(K.keys[k].short)}: ${esc(SP[k][i][2])}`).join(' · ');
  $('#map-card').innerHTML = `<div class="t">${esc(p[0])} <small>${esc(p[1])}${pin ? ' · pinned' : ''}</small></div>
  <div class="d"><b class="am">${esc(s[2])}</b>${flag}<br>${pin && pin.why ? esc(pin.why) + '<br>' : ''}<span class="dim">Other keys — ${others}</span></div>
  <div class="ctl"><button class="go" data-act="details">Details</button><button data-act="fly3d">✈ 3D</button><button data-act="nextkey">⟳ Next key</button><button data-act="desel" aria-label="Close">✕</button></div>`;
}
function echoTownCard(pr) {
  const names = pr.n.split('|');
  $('#map-card').innerHTML = `<div class="t">${esc(pr.t)} <small>same name</small></div><div class="d">Shares its name with ${names.map(n => '<b>' + esc(n) + '</b>').join(', ')} in the Bible.</div>
  <div class="ctl">${names.slice(0, 4).map(n => { const i = RANK.find(j => P[j][0] === n) ?? P.findIndex(p => p[0] === n); return `<button data-act="pick" data-i="${i}">Show ${esc(n)}</button>` }).join('')}<button data-act="desel">✕</button></div>`;
}

/* ---------- details sheet ---------- */
async function details(i) {
  const p = P[i];
  Sheet.open({ title: p[0], render(el) {
    const rows = KEYS.map(k => { const s = SP[k][i], pin = pinOf(i, k); return `<div class="keyrow"><div class="k ${k === S.key ? 'on' : ''}">${esc(K.keys[k].short)}</div><div class="v">${esc(s[2])}${pin && 'at' in pin && pin.s ? ' <span class="tag pin">pin</span>' : ''}${s[3] ? ' <span class="dim">(' + (s[3] === 'ashore' ? 'moved ashore' : s[3]) + ')</span>' : ''}</div><button class="btn sm" data-act="showin" data-k="${k}" data-i="${i}">Show</button></div>` }).join('');
    const pin = pinOf(i);
    const s = spot(i);
    const ech = (E[p[0]] || []).map(h => [h, miles(hav(s[0], s[1], h[2], h[3]))]).sort((a, b) => a[1] - b[1]);
    el.innerHTML = `<div class="lbl" style="margin-top:10px">${esc(p[1])} · ${p[6].length} mention${p[6].length === 1 ? '' : 's'} in the Bible</div>
      <div class="sec lbl">Where each key puts it</div>${rows}
      ${pin && pin.why ? `<div class="sec lbl">The case on the ${esc(key().name)}</div><p class="def">${esc(pin.why)}</p>` : ''}
      <div class="sec lbl">The Bible site</div><p class="sub" style="margin-top:6px">${p[3] && !/^another name/.test(p[3]) ? 'Usually identified with <b style="color:var(--ink)">' + esc(p[3]) + '</b>. ' : p[3] ? esc(p[3][0].toUpperCase() + p[3].slice(1)) + '. ' : ''}${(c => c[0].toUpperCase() + c.slice(1))(conf(p[2]))}. ${p[4].toFixed(3)}°, ${p[5].toFixed(3)}°.</p>
      <div class="row"><button class="btn sm go" data-act="fly3d">✈ Fly to the American spot</button><a class="btn sm" href="https://www.google.com/maps/@${s[0]},${s[1]},4000m/data=!3m1!1e3" target="_blank" rel="noopener">American spot in Google Maps</a><a class="btn sm" href="https://www.google.com/maps/@${p[4]},${p[5]},4000m/data=!3m1!1e3" target="_blank" rel="noopener">Bible site in Google Maps</a></div>
      ${ech.length ? `<div class="sec lbl">American towns with this name · ${ech.length}</div><p class="sub" style="margin-top:6px">Miles from where the ${esc(key().name)} puts ${esc(p[0])}.</p>` + ech.slice(0, 40).map(([h, d]) => `<button class="li" data-act="echofly" data-la="${h[2]}" data-lo="${h[3]}"><h3 style="font-size:16px">${esc(h[0])}, ${esc(h[1])}</h3><p>${fmtMi(d)} mi away${h[4] ? '' : ' · close variant of the name'}</p></button>`).join('') : ''}
      <div class="sec lbl">In the Bible (KJV)</div><div id="vv"></div>`;
    verses(p[6], $('#vv'), 12);
  } });
}
const BK = {};
async function book(bi) { const id = IDS[bi]; if (!BK[id]) BK[id] = J('kjv/' + id + '.json').catch(() => null); return BK[id] }
async function verses(list, el, n) {
  const show = list.slice(0, n);
  el.innerHTML = show.map((v, k) => `<div class="ref"><b>${esc(refStr(v))}</b><span id="vt${k}">…</span></div>`).join('') + (list.length > n ? `<button class="btn" style="width:100%;margin-top:12px" data-act="morev">Show ${Math.min(list.length - n, 40)} more</button>` : '');
  el._list = list; el._n = n;
  for (let k = 0; k < show.length; k++) {
    const u = unpack(show[k]); const b = await book(u.bi); const t = b && b[u.c - 1] && b[u.c - 1][u.v - 1];
    const x = document.getElementById('vt' + k); if (x) x.textContent = t || '(text not available)';
  }
}

/* ---------- journeys ---------- */
function jStops(j, k) { return j.s.map(s => ({ ...s, sp: SP[k || S.key][s.i] })) }
function jLegs(j, k) {
  const st = jStops(j, k); const out = [];
  for (let a = 1; a < st.length; a++) {
    const A = st[a - 1], B = st[a];
    out.push({ here: miles(hav(A.sp[0], A.sp[1], B.sp[0], B.sp[1])), bible: miles(hav(P[A.i][4], P[A.i][5], P[B.i][4], P[B.i][5])), mode: B.m });
  }
  return out;
}
function startJourney(id) {
  const j = K.journeys.find(x => x.id === id); if (!j) return;
  S.mode = 'journey'; S.j = j; S.jk = 0; S.sel = -1;
  if (ready()) { map.getSource('sel').setData({ type: 'FeatureCollection', features: [] }); map.getSource('esel').setData({ type: 'FeatureCollection', features: [] }) }
  tab('map'); drawJourney(true);
}
function drawJourney(fit) {
  if (!ready() || !S.j) return;
  const st = jStops(S.j), feats = [];
  for (let a = 1; a < st.length; a++) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[st[a - 1].sp[1], st[a - 1].sp[0]], [st[a].sp[1], st[a].sp[0]]] }, properties: { done: a <= S.jk ? 1 : 0, sail: st[a].m === 'sail' ? 1 : 0 } });
  map.getSource('route').setData({ type: 'FeatureCollection', features: feats });
  clearMarks(extra);
  if (fit) { const b = new maplibregl.LngLatBounds(); st.forEach(s => b.extend([s.sp[1], s.sp[0]])); map.fitBounds(b, { padding: pad(), maxZoom: 9, duration: 1200 }) }
  cardJourney(); placeLabels();
}
function cardJourney() {
  const j = S.j, st = jStops(j), k = S.jk, legs = jLegs(j), s = st[k];
  const tot = legs.slice(0, k).reduce((a, l) => a + l.here, 0), totB = legs.slice(0, k).reduce((a, l) => a + l.bible, 0);
  const leg = k > 0 ? legs[k - 1] : null;
  const legTxt = leg ? `<b class="am">${fmtMi(leg.here)} mi</b> from ${esc(P[st[k - 1].i][0])} on this key, ${days(leg.here, leg.mode)} ${leg.mode === 'sail' ? 'under sail' : 'on foot'}. On the Bible map the same leg is ${fmtMi(leg.bible)} mi (${days(leg.bible, leg.mode)}).<br>So far: ${Math.round(tot).toLocaleString()} mi here, ${Math.round(totB).toLocaleString()} mi in the Bible.` : `${esc(j.x)}`;
  $('#map-card').innerHTML = `<div class="t">${k + 1}. ${esc(P[s.i][0])} <small>${esc(j.t)} · ${esc(s.r.replace(/\./g, ' ').replace(/ (\d+) (\d+)$/, ' $1:$2'))}</small></div><div class="d"><b>${esc(s.sp[2])}</b><br>${legTxt}</div>
  <div class="ctl"><button data-act="js" data-d="-1" ${k ? '' : 'disabled'}>‹</button><button class="go" data-act="jplay">${S.playing ? '❚❚' : '▶'}</button><button data-act="js" data-d="1" ${k < st.length - 1 ? '' : 'disabled'}>›</button><span class="cnt">${k + 1}/${st.length}</span><span class="grow"></span><button data-act="pick" data-i="${s.i}">Place</button><button data-act="jend">Done</button></div>`;
}
function flyStop() { const s = jStops(S.j)[S.jk]; map.flyTo({ center: [s.sp[1], s.sp[0]], zoom: Math.max(Math.min(map.getZoom(), 9), 6), duration: 1400, padding: pad() }) }
function jstep(d) { const n = S.j.s.length; S.jk = Math.max(0, Math.min(n - 1, S.jk + d)); drawJourney(false); flyStop() }
function jplay() {
  if (S.playing) { clearInterval(S.playing); S.playing = null; cardJourney(); return }
  if (S.jk >= S.j.s.length - 1) S.jk = 0;
  S.playing = setInterval(() => { if (!S.j || S.jk >= S.j.s.length - 1) { clearInterval(S.playing); S.playing = null; if (S.j) cardJourney(); return } jstep(1) }, 2600);
  jstep(S.jk === 0 ? 0 : 1);
}
function endJourney(quiet) {
  if (S.playing) { clearInterval(S.playing); S.playing = null }
  S.mode = 'browse'; S.j = null; clearMarks(extra);
  if (ready()) map.getSource('route').setData({ type: 'FeatureCollection', features: [] });
  if (!quiet) { cardIdle(); placeLabels() }
}

/* ---------- other views ---------- */
function tab(t) {
  S.tab = t; $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + t));
  if (t === 'map' && map) map.resize();
  ({ places: renderPlaces, journeys: renderJourneys, clues: renderClues, test: renderTest })[t]?.();
}
const PT = [['all', 'All'], ['pin', 'Pinned'], ['town', 'Towns'], ['region', 'Lands'], ['mount', 'Mountains'], ['water', 'Waters'], ['island', 'Islands']];
function renderPlaces() {
  const el = $('#places');
  if (!el.dataset.built) {
    el.innerHTML = `<input class="inp" id="pq" placeholder="Search ${P.length.toLocaleString()} Bible places or American towns" autocomplete="off"><div class="seg" id="pseg" style="margin-top:10px"></div><div id="plist"></div>`;
    $('#pq').addEventListener('input', e => { S.q = e.target.value; S.shown = 120; listPlaces() });
    el.dataset.built = 1;
  }
  $('#pseg').innerHTML = PT.map(([k, l]) => `<button class="${S.ptype === k ? 'on' : ''}" data-act="ptype" data-k="${k}">${l}</button>`).join('');
  listPlaces();
}
function listPlaces() {
  const q = S.q.trim().toLowerCase();
  let ids = RANK.concat(P.map((_, i) => i).filter(i => !RANK.includes(i)));
  ids = ids.filter(i => { const p = P[i]; if (S.ptype === 'pin') { if (!pinOf(i)) return false } else if (S.ptype !== 'all' && group(p[1]) !== S.ptype) return false; if (!q) return true; return p[0].toLowerCase().includes(q) || spot(i)[2].toLowerCase().includes(q) || (p[3] || '').toLowerCase().includes(q) });
  const dup = {}; ids = ids.filter(i => { const k = P[i][0] + '|' + spot(i)[2]; if (dup[k]) return false; return dup[k] = 1 });
  if (q) { const sc = i => { const n = P[i][0].toLowerCase(); return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : spot(i)[2].toLowerCase().includes(q) ? 3 : 4 }; const pos = new Map(ids.map((i, k) => [i, k])); ids.sort((a, b) => sc(a) - sc(b) || pos.get(a) - pos.get(b)) }
  $('#plist').innerHTML = `<p class="sub" style="margin:4px 0 0">${ids.length.toLocaleString()} place${ids.length === 1 ? '' : 's'} · ${esc(key().name)}</p>` + ids.slice(0, S.shown).map(i => { const p = P[i], s = spot(i); return `<button class="li" data-act="pick" data-i="${i}"><h3>${esc(p[0])} ${pinOf(i) ? '<span class="tag pin">pin</span>' : ''}<span class="tag">${esc(p[1])}</span></h3><p class="to">${esc(s[2])}</p><p>${p[6].length} mention${p[6].length === 1 ? '' : 's'}${p[3] && !/^another name/.test(p[3]) ? ' · ' + esc(p[3]) : ''}</p></button>` }).join('') + (ids.length > S.shown ? `<button class="btn" style="width:100%;margin-top:12px" data-act="pmore">Show more</button>` : '');
}
function renderJourneys() {
  $('#journeys').innerHTML = `<h2 class="h">Journeys</h2><p class="sub">Walk the Bible’s routes on American ground. Each leg shows the distance on the ${esc(key().name)} next to the distance on the Bible map, at ${WALK} miles a day on foot and ${SAIL} under sail.</p>` + keySeg() +
    K.journeys.map(j => { const L = jLegs(j), h = L.reduce((a, l) => a + l.here, 0), b = L.reduce((a, l) => a + l.bible, 0); return `<button class="li" data-act="journey" data-id="${j.id}"><h3>${esc(j.t)}</h3><p>${esc(j.ref)} · ${j.s.length} stops</p><p>${esc(j.x)}</p><p class="to">${Math.round(h).toLocaleString()} mi on this key · ${Math.round(b).toLocaleString()} mi on the Bible map · ×${(h / b).toFixed(1)}</p></button>` }).join('');
}
function keySeg() { return `<div class="seg">${KEYS.map(k => `<button class="${k === S.key ? 'on' : ''}" data-act="keyhere" data-k="${k}">${esc(K.keys[k].name)}</button>`).join('')}</div>` }
function stars(s) { return '<span class="stars">' + '●'.repeat(s) + '<span style="opacity:.25">' + '●'.repeat(3 - s) + '</span></span>' }
function renderClues() {
  const k = key();
  const pins = (k.anchors || []).slice().sort((a, b) => b.s - a.s);
  $('#clues').innerHTML = `<h2 class="h">The case for the ${esc(k.name)}</h2>` + keySeg() +
    `<div class="card hl"><p class="def" style="margin-top:0">${esc(k.pitch)}</p><div class="good">${esc(k.strong)}</div><div class="bad">${esc(k.weak)}</div></div>` +
    `<div class="sec lbl">The pins · ${pins.length}</div><p class="sub" style="margin-top:6px">${S.key === 'echo' ? 'This key has no hand-placed pins. These are the Bible places it lands near a town of the same name.' : 'Each pin fixes one Bible place to one American spot. Every other place is carried along with its neighbours. Dots show how strong each match is: name, landscape, or placement alone.'}</p>` +
    pins.map(a => `<div class="li"><h3>${esc(P[a.i][0])} <span class="dim">→</span> <span class="am">${esc(a.at)}</span> ${stars(a.s)}</h3><p style="color:var(--ink);font-family:var(--serif);font-size:15.5px;line-height:1.5">${esc(a.why)}</p><div class="row" style="margin-top:8px"><button class="btn sm" data-act="pick" data-i="${a.i}">Show on map</button><button class="btn sm" data-act="det" data-i="${a.i}">Details</button></div></div>`).join('') +
    (k.rivals && k.rivals.length ? `<div class="sec lbl">Rival sites and side clues</div>` + k.rivals.map((r, n) => `<div class="li"><h3>${esc(r.n)}</h3><p style="color:var(--ink);font-family:var(--serif);font-size:15.5px;line-height:1.5">${esc(r.why)}</p><div class="row" style="margin-top:8px"><button class="btn sm" data-act="rival" data-n="${n}">Show on map</button></div></div>`).join('') : '') +
    (k.overrides && k.overrides.length ? `<div class="sec lbl">Seas and rivers placed by hand</div><p class="sub" style="margin-top:6px">These don’t bend the map; they just mark the matching water.</p>` + k.overrides.map(o => `<button class="li" data-act="pick" data-i="${o.i}"><h3>${esc(P[o.i][0])} <span class="dim">→</span> <span class="am">${esc(o.at)}</span></h3><p>${esc(o.why)}</p></button>`).join('') : '') +
    `<div class="sec lbl">The idea behind all three keys</div><p class="def">${esc(K.premise)}</p>`;
}
function verdict(r) { return r == null ? '' : r <= 1.6 && r >= 0.6 ? `<span class="pill ok">×${r}</span>` : r <= 3 && r >= 0.35 ? `<span class="pill mid">×${r}</span>` : `<span class="pill no">×${r}</span>` }
function renderTest() {
  const k = key(), kk = S.key;
  const dan = kk2 => K.keys[kk2].tests.find(t => /Dan to Beersheba/.test(t.t));
  const worst = kk2 => K.keys[kk2].tests.filter(t => t.ratio).sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)))[0];
  const fitN = kk2 => K.keys[kk2].tests.filter(t => t.ratio && t.ratio <= 1.6 && t.ratio >= 0.6).length;
  const col = (f) => KEYS.map(x => `<div class="${x === kk ? 'am' : ''}">${f(x)}</div>`).join('');
  let h = `<h2 class="h">Test the keys</h2><p class="sub">The Bible gives its own distances and travel times. A real fit should keep them. ×1 means the key keeps the Bible’s distance exactly; ×2 means it doubles it.</p>
  <div class="score"><div class="hd"></div>${KEYS.map(x => `<div class="hd ${x === kk ? 'on' : ''}">${esc(K.keys[x].short)}</div>`).join('')}
  <div>Distance checks kept within ×1.6</div>${col(x => fitN(x) + ' of ' + K.keys[x].tests.length)}
  <div>Length of the land, Dan to Beersheba</div>${col(x => '×' + dan(x).ratio)}
  <div>Worst stretch</div>${col(x => { const w = worst(x); return '×' + w.ratio + '<br><span class="dim" style="font-size:11px">' + esc(P[w.a][0]) + '–' + esc(P[w.b][0]) + '</span>' })}
  <div>Bible places dropped in the sea</div>${col(x => K.keys[x].stats.moved_ashore || 0)}
  <div>Islands left on dry land</div>${col(x => K.keys[x].stats.island_on_mainland || 0)}
  <div>Same-name towns hit, not counting pins</div>${col(x => x === 'echo' ? '<span class="dim">picked by names</span>' : K.keys[x].echo.hits.length + '<br><span class="dim" style="font-size:11px">chance ≈ ' + K.keys[x].echo.chance + '</span>')}
  </div>` + keySeg();
  h += `<div class="card hl"><div class="good">${esc(k.strong)}</div><div class="bad">${esc(k.weak)}</div></div>`;
  if (kk === 'echo' && k.search) {
    const nulls = k.search.nulls, mx = Math.max(k.search.score, ...nulls), hist = {};
    nulls.forEach(n => hist[n] = (hist[n] || 0) + 1);
    const lo = Math.min(...nulls), bars = []; for (let v = lo; v <= mx; v++) bars.push(v);
    const top = Math.max(...Object.values(hist), 1);
    h += `<div class="sec lbl">Does the name key beat chance?</div><p class="def">The search tried every flip, turn, size and position and found a fit that lands <b class="am">${k.search.score}</b> Bible places within 25 miles of a same-name town. To check whether that means anything, the names were shuffled among the places 30 times and the same search was run each time.</p>
    <div class="dots">${bars.map(v => `<i class="${v === k.search.score ? 'me' : ''}" style="height:${v === k.search.score ? 100 : Math.max(4, (hist[v] || 0) / top * 100)}%"><span>${v}</span></i>`).join('')}</div>
    <p class="sub" style="margin-top:24px">Grey: best score with shuffled names (${nulls.length} runs). Turquoise: the real names. The real fit beats every shuffle, but only by one place, so it’s a weak signal. New England settlers named many towns from the Bible, close together, which is most of what the search is finding.</p>`;
  }
  h += `<div class="sec lbl">Distance checks on the ${esc(k.name)}</div>` + k.tests.map(t => {
    const r = t.ratio, w = Math.min(100, (r || 0) / 4 * 100), c = r >= 0.6 && r <= 1.6 ? 'var(--am)' : r >= 0.35 && r <= 3 ? 'var(--old)' : 'var(--red)';
    return `<div class="trow"><div class="q">${esc(t.t)} <span class="dim" style="font-family:var(--sans);font-size:12px">${esc(t.ref)}</span></div><div class="r">${verdict(r)}<span>Bible map ${fmtMi(t.bible)} mi</span><span>·</span><span class="am">this key ${fmtMi(t.key)} mi</span><button class="btn sm" style="margin-left:auto" data-act="pair" data-a="${t.a}" data-b="${t.b}">Map</button></div><div class="bar"><i style="width:${w}%;background:${c}"></i><i style="left:25%;width:1px;background:#fff;opacity:.5"></i></div></div>`;
  }).join('') + `<p class="sub" style="margin-top:12px">The white tick on each bar marks ×1. Seas, ports and rivers are part of the test too: the counts above show how many Bible towns this key drops into open water and how many islands it leaves on land.</p>`;
  $('#test').innerHTML = h;
}

/* ---------- intro / about ---------- */
function flipSVG() {
  return `<svg class="flipdemo" viewBox="0 0 320 120" aria-hidden="true"><defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#4fd1c5"/></marker></defs>
  <g font-family="system-ui" font-size="9" fill="#97a3a8"><text x="30" y="14">Bible map</text><text x="222" y="14">turned over</text></g>
  <g stroke="#6fb4e8" stroke-width="3" fill="none"><ellipse cx="62" cy="34" rx="7" ry="10" fill="#6fb4e8" fill-opacity=".35"/><path d="M62 44 C58 58 66 66 62 80"/><ellipse cx="62" cy="92" rx="8" ry="14" fill="#d8a84a" fill-opacity=".45" stroke="#d8a84a"/></g>
  <circle cx="44" cy="84" r="4" fill="#e2604a"/><text x="4" y="106" font-family="system-ui" font-size="9" fill="#ebe5d6">Jerusalem</text><text x="76" y="37" font-family="system-ui" font-size="9" fill="#ebe5d6">Galilee</text><text x="76" y="96" font-family="system-ui" font-size="9" fill="#ebe5d6">Dead Sea</text>
  <path d="M120 60 H190" stroke="#4fd1c5" stroke-width="2" marker-end="url(#ar)"/><text x="132" y="52" font-family="system-ui" font-size="9" fill="#4fd1c5">rotate 180°</text>
  <g stroke="#6fb4e8" stroke-width="3" fill="none"><ellipse cx="252" cy="92" rx="7" ry="10" fill="#6fb4e8" fill-opacity=".35"/><path d="M252 82 C256 68 248 60 252 46"/><ellipse cx="252" cy="34" rx="8" ry="14" fill="#d8a84a" fill-opacity=".45" stroke="#d8a84a"/></g>
  <circle cx="270" cy="42" r="4" fill="#e2604a"/><text x="276" y="45" font-family="system-ui" font-size="9" fill="#ebe5d6">Salt Lake</text><text x="198" y="96" font-family="system-ui" font-size="9" fill="#ebe5d6">Utah Lake</text><text x="186" y="30" font-family="system-ui" font-size="9" fill="#ebe5d6">Great Salt L.</text></svg>`;
}
function intro() {
  Sheet.open({ title: 'Turn the map over', render(el) {
    el.innerHTML = flipSVG() + `<p class="def">${esc(K.premise)}</p><p class="sub">Three keys come out of it. Pick one; you can switch any time from the chips on the map.</p>` +
      KEYS.map(k => `<button class="li" data-act="keygo" data-k="${k}"><h3 class="am">${esc(K.keys[k].name)}</h3><p style="color:var(--ink)">${esc(K.keys[k].pitch)}</p></button>`).join('') +
      `<p class="note">This is a what-if. Archaeology places these sites in the Middle East, and nothing here is evidence otherwise. What the app does show, honestly, is how far America has to be bent to make the Bible fit, key by key.</p>`;
  } });
  LS.set('seen', true);
}
function about() {
  Sheet.open({ title: 'About Galah', render(el) {
    el.innerHTML = `<p class="def"><b>Galah</b> (גלה) is Hebrew for “uncover” and also “go into exile”: a land carried off somewhere else.</p>${flipSVG()}<p class="def">${esc(K.premise)}</p>
    <div class="sec lbl">How a key is built</div><p class="def">Each key pins a handful of Bible places to American spots chosen for a reason: a matching river, lake, mountain or name. Every other Bible place is then moved by a smooth warp that keeps it as close as possible to the same distance and direction from the pinned places around it. Places the warp drops in open water are set on the nearest shore and flagged. The name key is different: no pins, no warp, just one flip, turn and resize, chosen by computer to land the most Bible places on same-name towns.</p>
    <div class="sec lbl">What to make of it</div><p class="def">This is a what-if. Archaeology places these sites in the Middle East, and nothing here is evidence otherwise. The Test tab shows where each key strains: which of the Bible’s own travel times it keeps and which it breaks.</p>
    <div class="sec lbl">Sources</div><p class="sub" style="margin-top:6px">Bible places and verses: OpenBible.info geocoding data (CC BY 4.0) · KJV text · Coastlines: Natural Earth · Towns: US zip-code gazetteer and GeoNames · Satellite imagery: Esri, Maxar, Earthstar Geographics · Terrain: Mapzen / AWS Terrain Tiles.</p>
    <div class="row" style="margin-top:12px"><button class="btn" data-act="intro">Show the intro again</button></div>`;
  } });
}

/* ---------- actions ---------- */
function setKey(k, fly) {
  if (!K.keys[k]) return; S.key = k; LS.set('key', k); $('#kname').textContent = key().short; renderTop();
  drawKey(fly !== false);
  if (S.mode === 'journey') cardJourney(); else if (S.sel >= 0) cardPlace(); else cardIdle();
  if (S.tab !== 'map') tab(S.tab);
}
const ACT = {
  tab: el => tab(el.dataset.t), sheetclose: () => Sheet.close(), about, intro: () => intro(),
  find: () => { tab('places'); setTimeout(() => $('#pq') && $('#pq').focus(), 50) },
  key: el => setKey(el.dataset.k), keyhere: el => setKey(el.dataset.k, false),
  keygo: el => { Sheet.close(); setKey(el.dataset.k); tab('map') },
  ghost: () => { S.ghost = !S.ghost; LS.set('ghost', S.ghost); renderTop(); loadGhost(); toast(S.ghost ? 'The old world’s coasts and rivers, drawn where this key puts them' : 'Old-world outline hidden') },
  echo: () => { S.echo = !S.echo; renderTop(); if (ready()) map.setLayoutProperty('echo-all', 'visibility', S.echo ? 'visible' : 'none'); toast(S.echo ? 'Pink: every American town that shares a Bible place’s name' : 'Same-name towns hidden') },
  core: () => { if (S.mode === 'journey') endJourney(); map.fitBounds(CORE[S.key], { padding: pad(), duration: 1400 }) },
  tilt: () => { S.tilt = !S.tilt; renderTop(); map.easeTo({ pitch: S.tilt ? 60 : 0, bearing: S.tilt ? -15 : 0, duration: 900 }) },
  howkey: () => tab('clues'),
  pick: el => { Sheet.close(); tab('map'); select(+el.dataset.i, true) },
  det: el => details(+el.dataset.i), details: () => details(S.sel),
  desel: () => deselect(),
  fly3d: () => { Sheet.close(); tab('map'); const i = S.sel >= 0 ? S.sel : null; if (i == null) return; const s = spot(i); S.tilt = true; renderTop(); map.flyTo({ center: [s[1], s[0]], zoom: 12, pitch: 62, bearing: -20, duration: 2600 }) },
  nextkey: () => setKey(KEYS[(KEYS.indexOf(S.key) + 1) % KEYS.length]),
  showin: el => { Sheet.close(); tab('map'); if (S.mode === 'journey') endJourney(true); S.sel = +el.dataset.i; setKey(el.dataset.k); placeLabels() },
  echofly: el => { Sheet.close(); tab('map'); map.flyTo({ center: [+el.dataset.lo, +el.dataset.la], zoom: 10, duration: 1600 }) },
  morev: el => { const box = el.parentElement; verses(box._list, box, box._n + 40) },
  ptype: el => { S.ptype = el.dataset.k; S.shown = 120; renderPlaces() },
  pmore: () => { S.shown += 200; listPlaces() },
  journey: el => startJourney(el.dataset.id),
  js: el => jstep(+el.dataset.d), jplay, jend: () => endJourney(),
  rival: el => { const r = key().rivals[+el.dataset.n]; tab('map'); if (ready()) map.getSource('riv').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lo, r.la] }, properties: {} }] }); clearMarks(extra); extra.push(mk([r.lo, r.la], r.n, 'riv')); map.flyTo({ center: [r.lo, r.la], zoom: 9, duration: 1600 }); $('#map-card').innerHTML = `<div class="t">${esc(r.n)}</div><div class="d">${esc(r.why)}</div><div class="ctl"><button data-act="desel">✕</button></div>` },
  pair: el => { const a = +el.dataset.a, b = +el.dataset.b; tab('map'); if (S.mode === 'journey') endJourney(true); S.sel = a; drawSel(); const A = spot(a), B = spot(b); clearMarks(extra); extra.push(mk([B[1], B[0]], P[b][0], 'stop')); map.getSource('route').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[A[1], A[0]], [B[1], B[0]]] }, properties: { done: 1, sail: 0 } }] }); const bb = new maplibregl.LngLatBounds([A[1], A[0]], [A[1], A[0]]).extend([B[1], B[0]]); map.fitBounds(bb, { padding: pad(), maxZoom: 11, duration: 1300 }); const d = miles(hav(A[0], A[1], B[0], B[1])), d0 = miles(hav(P[a][4], P[a][5], P[b][4], P[b][5])); $('#map-card').innerHTML = `<div class="t">${esc(P[a][0])} → ${esc(P[b][0])}</div><div class="d">On this key: <b class="am">${fmtMi(d)} mi</b>. On the Bible map: ${fmtMi(d0)} mi.</div><div class="ctl"><button data-act="pairx">✕</button></div>` },
  pairx: () => { if (ready()) map.getSource('route').setData({ type: 'FeatureCollection', features: [] }); deselect() },
};
function onClick(e) { const el = e.target.closest('[data-act]'); if (!el) return; const f = ACT[el.dataset.act]; if (f) { e.preventDefault(); f(el) } }
boot();

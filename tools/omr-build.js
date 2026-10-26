// Builds the "Riktiga set" data from the LDraw Official Model Repository (OMR): CAD models of real LEGO sets with their
// build steps, made by LDraw fans and redistributable under CC BY 2.0.
// Usage: node tools/omr-build.js   (downloads into tests/.cache/omr the first time; about 120 MB)
// Writes into app/:
//   sets-index.json  every set: number, name, theme, year, author, sizes, chunk, and the catalog pieces it needs
//   sets-N.json      the steps of the sets in chunk N: parts with their app color and placement
//   set-parts-common.json  the raw LDraw shape of the parts many sets use (same packing as parts.json, low-detail circles)
//   set-parts-N.json       the other parts the sets in chunk N use
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { find, load } = require('../tests/ldraw-lib.js');
const { walk, pack, PRIMS, COLORS: LDCOLORS, packMesh } = require('./ldraw-pack.js');
const { keyOf } = require('./library-keys.js');
const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'tests', '.cache', 'omr');
const APP = path.join(ROOT, 'app');
const BASE = 'https://library.ldraw.org';
const CHUNK = 25;
const COMMON = 10; // parts used by at least this many sets go in set-parts-common.json, downloaded once
// Themes left out: not System bricks, or huge display models.
const SKIP = /Technic|Brickheadz|Star Wars|Architecture|Mixels|Super Heroes|Harry Potter|Bionicle|Duplo|Znap|DOTS|Mindstorms|Model Team/;

const curl = (url, file) => { try { execFileSync('curl', ['-sSf', '--max-time', '60', '-o', file, url], { stdio: 'ignore' }); return true; } catch { return false; } };
const cached = (name, url) => { const f = path.join(CACHE, name); if (!fs.existsSync(f) || !fs.statSync(f).size) { fs.mkdirSync(path.dirname(f), { recursive: true }); curl(url, f); } return fs.existsSync(f) ? fs.readFileSync(f, 'latin1') : null; };

/* ---------------------------------------------------------- the set list */
function setList() {
  const f = path.join(CACHE, 'sets.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const rows = [];
  for (let i = 1; ; i++) {
    const t = cached(`list/p${i}.html`, `${BASE}/omr/sets?page=${i}`);
    const ids = [...new Set((t.match(/omr\/sets\/(\d+)"/g) || []).map((m) => m.match(/\d+/)[0]))];
    const txt = t.replace(/<svg[\s\S]*?<\/svg>|<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '|').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/[ \t\n]+/g, ' ').replace(/\|\s*(\|\s*)+/g, '|');
    const cells = txt.slice(txt.indexOf('|Models |') + 9, txt.indexOf('Showing')).split('|').map((c) => c.trim()).filter(Boolean);
    for (let k = 0; k * 5 < cells.length && k < ids.length; k++) { const [num, name, theme, year] = cells.slice(k * 5, k * 5 + 5); rows.push({ num, name, theme, year: Number(year) || null, id: ids[k] }); }
    if (!ids.length || !/Next/.test(t)) break;
  }
  fs.writeFileSync(f, JSON.stringify(rows));
  return rows;
}

/* ------------------------------------------------- colors: LDraw -> app */
const appColors = [...fs.readFileSync(path.join(APP, 'byggboken.html'), 'utf8').matchAll(/^\s+(\w+):\s+\{ hex: 0x([0-9a-f]{6}),.*?(alpha: ([0-9.]+))?\s*\},?$/gm)]
  .map((m) => ({ name: m[1], rgb: [0, 2, 4].map((i) => parseInt(m[2].slice(i, i + 2), 16)), trans: !!m[3] }));
const colorCache = {};
/** The app color nearest an LDraw color code (transparent ones to transparent ones). */
function appColor(code) {
  if (colorCache[code]) return colorCache[code];
  const c = LDCOLORS[code]; if (!c) return (colorCache[code] = 'lightgray');
  const rgb = [0, 2, 4].map((i) => parseInt(c[0].slice(i, i + 2), 16)), trans = c[1] < 1;
  let best = null, bd = Infinity;
  for (const a of appColors) { if (a.trans !== trans) continue; const d = a.rgb.reduce((s, v, i) => s + (v - rgb[i]) ** 2, 0); if (d < bd) { bd = d; best = a.name; } }
  return (colorCache[code] = best || 'lightgray');
}

/* --------------------------------------------------------- parts lookup */
const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'ldraw-ref.json'), 'utf8'));
const norm = (f) => f.toLowerCase().replace(/\.dat$/, '').replace(/(p[0-9a-z]{2,}|pat[0-9]+)$/, '').replace(/([0-9])[a-d]$/, '$1');
const CATALOG = {}; // normalized LDraw name -> catalog id
const appHtml = fs.readFileSync(path.join(APP, 'byggboken.html'), 'utf8');
const childIds = new Set([...appHtml.matchAll(/def\("([^"]+)",[^\n]*child: true/g)].map((m) => m[1]));
for (const [id, r] of Object.entries(ref)) if (!childIds.has(id)) { CATALOG[norm(id)] = id; CATALOG[norm(r.file)] = id; }
// Newer molds of catalog pieces count as that piece.
for (const [a, id] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'part-aliases.json'), 'utf8')))) if (ref[id]) CATALOG[norm(a)] = id;
// Pieces that come with another piece in the app (wheels and tires with their plate, glass with its window, doors, flowers):
// the sets list them on their own, but they never count as a piece to find.
const COMES_WITH = new Set(['4624', '3641', '6014', '6015', '4862', '3742', '3855', '4133', '4131', '60616', '60623', '60797', '60601', '60602', '60603', '73312', '4181', '4182', '4183', '73194']);
const resolved = {};
/** The LDraw file to draw for a model's part reference (printed parts as the plain part), or null. */
function resolve(name) {
  if (name in resolved) return resolved[name];
  const base = name.replace(/\.dat$/, '');
  let out = null;
  const plain = base.replace(/(p[0-9a-z]{2,}|pat[0-9]+)$/, '');
  for (const c of plain !== base ? [plain, base] : [base]) {
    if (load(c + '.dat', ['parts/'])) { out = c; break; }
    const f = find(c); if (f) { out = f.file; break; }
  }
  return (resolved[name] = out);
}

/* -------------------------------------------------------------- models */
const mul = (A, B) => {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 4 + j] = A[i * 4] * B[j] + A[i * 4 + 1] * B[4 + j] + A[i * 4 + 2] * B[8 + j];
    r[i * 4 + 3] = A[i * 4] * B[3] + A[i * 4 + 1] * B[7] + A[i * 4 + 2] * B[11] + A[i * 4 + 3];
  }
  return r;
};
/** Steps of placed parts {file, code, M (LDraw 3x4)} from an MPD/LDR text, sub-models built in place. */
function steps(text) {
  const files = {}; let cur = null, first = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^0\s+FILE\s+(.+)$/i);
    if (m) { cur = m[1].trim().toLowerCase(); files[cur] = []; first ??= cur; continue; }
    if (/^0\s+NOFILE/i.test(line)) { cur = null; continue; }
    if (!cur) { if (first) continue; cur = first = '__main'; files[cur] = []; }
    files[cur].push(line);
  }
  const out = [[]], author = (text.match(/^0\s+Author:\s*(.+)$/m) || [])[1]?.replace(/\s*\[.*\]\s*$/, '').trim();
  const missing = new Set();
  (function go(name, M, color, depth) {
    if (depth > 30) return;
    for (const line of files[name] || []) {
      const a = line.trim().split(/\s+/);
      if (a[0] === '0' && /^(STEP|ROTSTEP)$/i.test(a[1])) { if (out.at(-1).length) out.push([]); continue; }
      if (a[0] !== '1') continue;
      const n = a.slice(2, 14).map(Number), r = a.slice(14).join(' ').toLowerCase().replace(/\\/g, '/');
      const M2 = mul(M, [n[3], n[4], n[5], n[0], n[6], n[7], n[8], n[1], n[9], n[10], n[11], n[2]]);
      const code = a[1] === '16' ? color : a[1];
      if (files[r]) { go(r, M2, code, depth + 1); continue; }
      const file = resolve(r);
      if (file) out.at(-1).push({ file, code, M: M2 }); else missing.add(r);
    }
  })(first, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], '16', 0);
  return { steps: out.filter((s) => s.length), author, missing: [...missing] };
}
/** Steps a child can follow: at most 8 new parts each; a model without steps is built in layers from the bottom up. */
function kidSteps(st) {
  const layered = (parts) => {
    const sorted = parts.slice().sort((a, b) => b.M[7] - a.M[7] || a.M[11] - b.M[11] || a.M[3] - b.M[3]); // LDraw y points down
    const out = [];
    for (const p of sorted) { const last = out.at(-1); if (last && last.length < 8 && Math.abs(last[0].M[7] - p.M[7]) < 12) last.push(p); else out.push([p]); }
    return out;
  };
  const all = st.flat();
  if (st.length < 3) return layered(all);
  return st.flatMap((s) => (s.length > 8 ? layered(s) : [s]));
}

/* ----------------------------------------------------------------- main */
fs.mkdirSync(CACHE, { recursive: true });
const sets = setList().filter((s) => !SKIP.test(s.theme));
const models = [];
for (const S of sets) {
  const page = cached(`pages/${S.id}.html`, `${BASE}/omr/sets/${S.id}`);
  for (const u of new Set(page?.match(/media\/omr_models\/[^"?]+\.(mpd|ldr)/g) || [])) {
    const text = cached(`mpd/${u.replace(/.*omr_models\//, '').replace('/', '_')}`, `${BASE}/${u}`);
    if (!text) continue;
    const st = steps(text), parts = st.steps.flat();
    if (parts.length < 10 || parts.length > 400 || st.missing.length) continue;
    models.push({ S, file: path.basename(u), st, parts });
  }
}
console.log(`${models.length} models from ${sets.length} sets`);

// Part names (minifig parts are drawn but never count as pieces to find).
const titles = {};
const title = (f) => (titles[f] ??= (load(f + '.dat', ['parts/'])?.split('\n')[0] || '').replace(/^0\s*~?/, '').replace(/\s+/g, ' ').trim());

const index = [], chunks = [];
models.sort((a, b) => a.S.theme.localeCompare(b.S.theme) || (a.S.year || 0) - (b.S.year || 0) || a.S.num.localeCompare(b.S.num));
const used = new Set(), usedIn = [];
models.forEach((m, i) => {
  const k = Math.floor(i / CHUNK);
  const key = m.file.replace(/\.(mpd|ldr)$/, '');
  const fileIdx = new Map(), files = [];
  const r4 = (v) => Math.round(v * 1e4) / 1e4, r3 = (v) => Math.round(v * 1e3) / 1e3;
  // Placement in app axes (x, -y, -z) and studs: rotation D*R, translation D*t/20.
  const place = (p) => {
    if (!fileIdx.has(p.file)) { fileIdx.set(p.file, files.length); files.push(p.file); used.add(p.file); (usedIn[k] ||= new Set()).add(p.file); }
    const M = p.M, D = [1, -1, -1];
    return [fileIdx.get(p.file), appColor(p.code), ...[0, 1, 2].flatMap((row) => [r4(D[row] * M[row * 4]), r4(D[row] * M[row * 4 + 1]), r4(D[row] * M[row * 4 + 2])]), ...[0, 1, 2].map((row) => r3(D[row] * M[row * 4 + 3] / 20))];
  };
  const st = kidSteps(m.st.steps).map((s) => s.map(place));
  (chunks[k] ||= {})[key] = { files, steps: st };
  // What the set needs from "Mina bitar": library pieces by color; pieces the library lacks counted apart.
  const need = new Map(); let other = 0, figs = 0;
  for (const p of m.parts) {
    const n = norm(p.file), cat = CATALOG[n] || keyOf(p.file);
    if (COMES_WITH.has(n)) continue;
    if (/^Minifig/i.test(title(p.file))) { figs++; continue; }
    if (cat) { const kk = cat + ':' + appColor(p.code); need.set(kk, (need.get(kk) || 0) + 1); } else other++;
  }
  index.push({ key, num: m.S.num, name: m.S.name, theme: m.S.theme, year: m.S.year, author: m.st.author || '', parts: m.parts.length, steps: st.length, chunk: k,
    need: [...need].map(([kk, n]) => [...kk.split(':'), n]), other, figs });
});
// Catalog ids of the files, so the viewer can use Swedish names and the finder.
const catOf = {};
for (const f of used) { const c = CATALOG[norm(f)]; if (c) catOf[f] = c; }

// Shapes of every used part, raw (LDraw axes, not placed on the grid), with low-detail circles; one file per chunk.
const shapes = {}, t0 = Date.now();
for (const f of used) shapes[f] = pack(null, walk(load(f + '.dat', ['parts/', 'p/']), PRIMS, true), { at: (p) => p, r: 0 });
const prims = {};
for (const [name, W] of Object.entries(PRIMS)) prims[name] = packMesh(W, (p) => p);
for (const f of fs.readdirSync(APP)) if (/^(sets|set-parts)-(\d+|common)\.json$/.test(f) || f === 'set-parts.json') fs.unlinkSync(path.join(APP, f));
const uses = {};
for (const c of chunks) for (const d of Object.values(c)) for (const f of d.files) uses[f] = (uses[f] || 0) + 1;
const shapeFile = (own, withPrims) => {
  const pick = (o) => Object.fromEntries(own.filter((f) => o[f] != null).map((f) => [f, o[f]]));
  return JSON.stringify({ names: pick(Object.fromEntries(own.map((f) => [f, title(f)]))), cat: pick(catOf), parts: pick(shapes), _prims: withPrims ? prims : {} });
};
fs.writeFileSync(path.join(APP, 'set-parts-common.json'), shapeFile([...used].filter((f) => uses[f] >= COMMON), true));
chunks.forEach((c, k) => {
  fs.writeFileSync(path.join(APP, `sets-${k}.json`), JSON.stringify(c));
  fs.writeFileSync(path.join(APP, `set-parts-${k}.json`), shapeFile([...usedIn[k]].filter((f) => uses[f] < COMMON), false));
});
fs.writeFileSync(path.join(APP, 'sets-index.json'), JSON.stringify(index));
const size = (f) => (fs.statSync(path.join(APP, f)).size / 1024 / 1024).toFixed(1) + ' MB';
console.log(`${index.length} sets in ${chunks.length} chunks; ${used.size} different parts packed in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const mb = (pre) => chunks.map((_, k) => fs.statSync(path.join(APP, `${pre}-${k}.json`)).size / 1024 / 1024);
console.log(`sets-index.json ${size('sets-index.json')}; steps ${mb('sets').reduce((a, b) => a + b, 0).toFixed(1)} MB in all; common shapes ${size('set-parts-common.json')}; rare shapes per chunk ${mb('set-parts').map((v) => v.toFixed(1)).join(', ')} MB`);

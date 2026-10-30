// Builds the "Riktiga set" data from the LDraw Official Model Repository (OMR): CAD models of real LEGO sets with their
// build steps, made by LDraw fans and redistributable under CC BY 2.0.
// Usage: node tools/omr-build.js   (downloads into tests/.cache/omr the first time; about 120 MB)
// Writes into app/:
//   sets-index.json  every set: number, name, theme, year, author, sizes, chunk, and the catalog pieces it needs
//   sets-N.json      the steps of the sets in chunk N: parts with their app color and placement
//   set-parts-common.json  the raw LDraw shape of the parts many sets use (same packing as parts.json, low-detail circles)
//   set-parts-N.json       the other parts the sets in chunk N use
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { find, load, measure } = require('../tests/ldraw-lib.js');
const { walk, pack, PRIMS, COLORS: LDCOLORS, packMesh } = require('./ldraw-pack.js');
const { keyOf } = require('./library-keys.js');
const { orderSteps, floating, bases, place: placeParts, links } = require('./set-order.js');
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
  let subs = 0;
  // sub: which sub-model of the main model a part comes from (0: the main model itself); nested ones count as their parent.
  (function go(name, M, color, depth, sub) {
    if (depth > 30) return;
    for (const line of files[name] || []) {
      const a = line.trim().split(/\s+/);
      if (a[0] === '0' && /^(STEP|ROTSTEP)$/i.test(a[1])) { if (out.at(-1).length) out.push([]); continue; }
      if (a[0] !== '1') continue;
      const n = a.slice(2, 14).map(Number), r = a.slice(14).join(' ').toLowerCase().replace(/\\/g, '/');
      const M2 = mul(M, [n[3], n[4], n[5], n[0], n[6], n[7], n[8], n[1], n[9], n[10], n[11], n[2]]);
      const code = a[1] === '16' ? color : a[1];
      if (files[r]) { go(r, M2, code, depth + 1, depth === 0 ? ++subs : sub); continue; }
      const file = resolve(r);
      if (file) out.at(-1).push({ file, code, M: M2, sub }); else missing.add(r);
    }
  })(first, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], '16', 0, 0);
  return { steps: out.filter((s) => s.length), author, missing: [...missing] };
}
/**
 * Rims placed the way LDraw drew them before it turned the part (30027a was turned 90° in 2012; older models still place
 * it the old way, so its hub faces sideways). A rim sits inside its tire, and the tire's axle is right: where a rim's
 * axle doesn't match the tire around it, turn the rim a quarter turn about its own up axis, facing out the way the same
 * rim faces in the models that place it right.
 */
const titles = {};
const title = (f) => (titles[f] ??= (load(f + '.dat', ['parts/'])?.split('\n')[0] || '').replace(/^0\s*~?/, '').replace(/\s+/g, ' ').trim());
const shapeBox = {};
function axleOf(file) {
  if (!(file in shapeBox)) {
    const text = load(file + '.dat', ['parts/']), m = text && measure(text);
    // The axle: the direction most of the part's round primitives (cylinders, rings, discs) are turned along.
    const votes = [0, 0, 0];
    (function go(t, M, depth) {
      if (depth > 6) return;
      for (const line of t.split(/\r?\n/)) {
        const a = line.trim().split(/\s+/);
        if (a[0] !== '1') continue;
        const n = a.slice(2, 14).map(Number), name = a.slice(14).join(' ').toLowerCase().replace(/\\/g, '/');
        const M2 = mul(M, [n[3], n[4], n[5], n[0], n[6], n[7], n[8], n[1], n[9], n[10], n[11], n[2]]);
        if (/^(48\/|8\/)?\d+-\d+(cyl|ring|disc|ndis|edge|con|chrd)/.test(name)) {
          const y = [M2[1], M2[5], M2[9]], L = Math.hypot(...y) || 1;
          y.forEach((v, k) => (votes[k] += Math.abs(v) / L > 0.9 ? 1 : 0));
        } else if (/^s\/|^\d+[a-z0-9]*\.dat$/.test(name)) { const st = load(name); if (st) go(st, M2, depth + 1); }
      }
    })(text || '', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], 0);
    const axle = votes.indexOf(Math.max(...votes));
    // measure() is in app axes; back to LDraw for the centre.
    shapeBox[file] = m && Math.max(...votes) ? { axle, c: [(m.min[0] + m.max[0]) / 2, -(m.min[1] + m.max[1]) / 2, -(m.min[2] + m.max[2]) / 2] } : null;
  }
  return shapeBox[file];
}
const at = (M, p) => [0, 1, 2].map((r) => M[r * 4] * p[0] + M[r * 4 + 1] * p[1] + M[r * 4 + 2] * p[2] + M[r * 4 + 3]);
const axis = (M, k) => [M[k], M[4 + k], M[8 + k]];
function fixRims(parts, facing, fix) {
  // Which way a rim's own axle points from the model's centre: + or - along the axle, outward.
  const cx = parts.reduce((s, p) => s + p.M[3], 0) / parts.length, cz = parts.reduce((s, p) => s + p.M[11], 0) / parts.length;
  const outward = (M, a, c) => Math.sign(axis(M, a)[0] * (c[0] - cx) + axis(M, a)[2] * (c[2] - cz));
  // A part LDraw moved keeps a stub named "Moved to <new>": go by the new part's name.
  const named = (f) => { const t = title(f), m = t.match(/^Moved to (\S+)/); return m ? title(m[1]) : t; };
  const tires = parts.filter((p) => /^(Tyre|Tire)/i.test(named(p.file)) && axleOf(p.file));
  let n = 0;
  for (const p of parts) {
    if (!/^Wheel Rim/i.test(named(p.file))) continue;
    const R = axleOf(p.file); if (!R) continue;
    const c = at(p.M, R.c);
    const t = tires.map((q) => ({ q, d: Math.hypot(...at(q.M, axleOf(q.file).c).map((v, k) => v - c[k])) })).sort((a, b) => a.d - b.d)[0];
    if (!t || t.d > 25) continue;
    const ta = axis(t.q.M, axleOf(t.q.file).axle), ra = axis(p.M, R.axle);
    if (Math.abs(ta[0] * ra[0] + ta[1] * ra[1] + ta[2] * ra[2]) > 0.9) {
      // Sitting right: count which way this rim faces.
      if (!fix) { const f = (facing[p.file] ||= [0, 0]); f[outward(p.M, R.axle, c) > 0 ? 0 : 1]++; }
      continue;
    }
    if (!fix) continue;
    const want = facing[p.file] && facing[p.file][0] !== facing[p.file][1] ? (facing[p.file][0] > facing[p.file][1] ? 1 : -1) : 0;
    const tc = at(t.q.M, axleOf(t.q.file).c);
    let best = null;
    for (const sgn of [1, -1]) {
      // M * Ry(±90): local x -> -/+z.
      const Ry = [0, 0, sgn, 0, 0, 1, 0, 0, -sgn, 0, 0, 0], M = mul(p.M, Ry);
      if (Math.abs([0, 1, 2].reduce((s, k) => s + axis(M, R.axle)[k] * ta[k], 0)) < 0.9) continue;
      // Keep the rim's centre where the model had it: move the part so its own centre lands back on c.
      const c2 = at(M, R.c); M[3] += c[0] - c2[0]; M[7] += c[1] - c2[1]; M[11] += c[2] - c2[2];
      // The turn that faces the way this rim faces in the other models; else the one that stays centred in the tire.
      const d = (want && outward(M, R.axle, c) !== want ? 1000 : 0) + Math.hypot(...at(M, R.c).map((v, k) => v - tc[k]));
      if (!best || d < best.d) best = { M, d };
    }
    if (best) { p.M = best.M; n++; }
  }
  return n;
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
let rimsFixed = 0;
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
// Rims first learn which way they face where they sit right, then the ones placed the old way are turned to match.
const facing = {};
for (const m of models) rimsFixed += fixRims(m.parts, facing, false);
for (const m of models) rimsFixed += fixRims(m.parts, facing, true);
console.log(`${models.length} models from ${sets.length} sets; ${rimsFixed} rims turned to match their tire`);

// Part names (minifig parts are drawn but never count as pieces to find).

const index = [], chunks = [], stats = [];
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
    // Last, when not 0: the side the part goes on from (tools/set-order.js).
    return [fileIdx.get(p.file), appColor(p.code), ...[0, 1, 2].flatMap((row) => [r4(D[row] * M[row * 4]), r4(D[row] * M[row * 4 + 1]), r4(D[row] * M[row * 4 + 2])]), ...[0, 1, 2].map((row) => r3(D[row] * M[row * 4 + 3] / 20)), ...(p.dir ? [p.dir] : [])];
  };
  // The model's own steps, reordered so no part comes before what holds it (see tools/set-order.js).
  const before = kidSteps(m.st.steps);
  // Floating parts before and after, measured against the same bases (the model's first step and each separate model's start).
  const flat0 = m.st.steps.flat(), P0 = placeParts(flat0), B0 = bases(m.st.steps, P0, links(P0));
  // A sub-assembly's parts count from the step that puts it on, not while it is built apart.
  const asBuilt = (st) => st.filter((s) => !s.sub).map((s) => (s.attach ? st.filter((t) => t.sub === s.attach).flat() : s)).filter((s) => s.length);
  const fl = (st) => { st = asBuilt(st); const f = st.flat(), Q = placeParts(f); return floating(st, Q, links(Q), new Set(f.map((p, i) => (B0.has(flat0.indexOf(p)) ? i : -1)))).length; };
  // Sub-assemblies built apart where that leaves nothing more hanging in the air than building everything in place.
  const inPlace = orderSteps(m.st.steps, { subs: false }), withSubs = orderSteps(m.st.steps);
  const ordered = fl(withSubs) <= fl(inPlace) ? withSubs : inPlace;
  stats.push([key, fl(before), fl(ordered)]);
  const st = ordered.map((s) => s.map(place));
  // meta, per step: 0, or S while building sub-assembly S apart, or [-S, side] where it goes on (left out when all 0).
  const meta = ordered.map((s) => (s.sub ? s.sub : s.attach ? [-s.attach, s.dir || 0] : 0));
  (chunks[k] ||= {})[key] = { files, steps: st, ...(meta.some(Boolean) ? { meta } : {}) };
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
const sum = (k) => stats.reduce((a, s) => a + s[k], 0);
console.log(`floating parts: ${sum(1)} in ${stats.filter((s) => s[1]).length} sets with the model's own order, ${sum(2)} in ${stats.filter((s) => s[2]).length} sets after reordering`);
if (process.env.FLOATING) console.log(stats.filter((s) => s[2]).sort((a, b) => b[2] - a[2]).slice(0, 12).map((s) => s.join(' ')).join('\n'));
const size = (f) => (fs.statSync(path.join(APP, f)).size / 1024 / 1024).toFixed(1) + ' MB';
console.log(`${index.length} sets in ${chunks.length} chunks; ${used.size} different parts packed in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const mb = (pre) => chunks.map((_, k) => fs.statSync(path.join(APP, `${pre}-${k}.json`)).size / 1024 / 1024);
console.log(`sets-index.json ${size('sets-index.json')}; steps ${mb('sets').reduce((a, b) => a + b, 0).toFixed(1)} MB in all; common shapes ${size('set-parts-common.json')}; rare shapes per chunk ${mb('set-parts').map((v) => v.toFixed(1)).join(', ')} MB`);

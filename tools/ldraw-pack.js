// Converts LDraw CAD models of the catalog parts into app/parts.json, the shapes the app draws.
// Usage: node tools/ldraw-pack.js [id ...]   (no ids: every catalog part). Needs internet the first time (LDraw files are cached).
// For each part it reads the model with its colors and edge lines, turns it to the app's facing (studs, footprint and the
// old hand-made drawing decide), places it on the stud grid, and packs it: positions as 16-bit integers (1/4 LDU),
// studs as a list of positions instead of full geometry.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { find, load, TOPSTUD } = require('../tests/ldraw-lib.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'app', 'parts.json');

// LDraw files whose name differs from the design ID.
const FILE = { '60797': '60797c01' };
// Facing chosen by hand where the automatic choice is wrong (degrees, added to the automatic turn).
// Facing chosen by hand (degrees) where the automatic choice can't tell (symmetric studs and footprint).
const TURN = {
  '4070': 0, // the side stud faces +z; the square hole is at the back
  '4600': 0, '6157': 0, '122c01': 0, // wheel pins point left and right (x) at r=0
};
// Wheels, packed on their own: axle along x, centered at the origin. 3641 is the bare tire for the red hubs of 122c01.
const WHEELS = ['4624c01', '6014ac01', '3641'];
// The facing of every part, as reviewed against pictures of the real part. New parts get an automatic facing; check it.
const TURNS_FILE = path.join(__dirname, 'ldraw-turns.json');
const TURNS = fs.existsSync(TURNS_FILE) ? JSON.parse(fs.readFileSync(TURNS_FILE, 'utf8')) : {};

/* LDraw colors: code -> [hex, alpha]. */
const COLORS = {};
for (const l of fs.readFileSync(path.join(ROOT, 'tests', '.cache', 'ldraw', 'LDConfig.ldr'), 'utf8').split('\n')) {
  const m = l.match(/!COLOUR\s+\S+\s+CODE\s+(\d+)\s+VALUE\s+#([0-9A-Fa-f]{6}).*?(?:ALPHA\s+(\d+))?\s*$/);
  if (m) COLORS[m[1]] = [m[2].toLowerCase(), m[3] ? Number(m[3]) / 255 : 1];
}

const mul = (A, B) => {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 4 + j] = A[i * 4] * B[j] + A[i * 4 + 1] * B[4 + j] + A[i * 4 + 2] * B[8 + j];
    r[i * 4 + 3] = A[i * 4] * B[3] + A[i * 4 + 1] * B[7] + A[i * 4 + 2] * B[11] + A[i * 4 + 3];
  }
  return r;
};
const ap = (M, x, y, z) => [M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11]];
// Studs and the tubes and pins underneath repeat many times: they are stored once in "_prims" and placed by a matrix.
const PRIM = /^stud[0-9a-z]*\.dat$/;

/** Triangles by color and edge lines of an LDraw file, in LDraw axes. With prims, studs and tubes become instances. */
function walk(text, prims) {
  const tris = {}, lines = [], inst = [], studs = [];
  (function go(t, M, color, depth) {
    if (depth > 30) return;
    for (const raw of t.split(/\r?\n/)) {
      const a = raw.trim().split(/\s+/);
      const c = a[1] === '16' ? color : a[1] === '24' ? 'edge' : a[1];
      if (a[0] === '1') {
        const n = a.slice(2, 14).map(Number), name = a.slice(14).join(' ').toLowerCase().replace(/\\/g, '/');
        const M2 = mul(M, [n[3], n[4], n[5], n[0], n[6], n[7], n[8], n[1], n[9], n[10], n[11], n[2]]);
        const base = path.basename(name);
        // Upward studs on the top (for placing the part on the grid).
        if (TOPSTUD.test(base)) { const o = ap(M2, 0, 0, 0), u = ap(M2, 0, -1, 0); studs.push({ o, d: [u[0] - o[0], u[1] - o[1], u[2] - o[2]].map((v) => Math.round(v * 1000) / 1000) }); }
        if (prims && PRIM.test(base) && c === color) {
          if (!prims[base]) { const st = load(name); if (st) prims[base] = walk(st, null); }
          if (prims[base]) { inst.push({ name: base, M: M2 }); continue; }
        }
        const st = load(name); if (st) go(st, M2, c, depth + 1);
      } else if (a[0] === '3' || a[0] === '4') {
        const n = a.slice(2).map(Number), pts = [];
        for (let i = 0; i < Number(a[0]); i++) pts.push(ap(M, n[i * 3], n[i * 3 + 1], n[i * 3 + 2]));
        (tris[c] ||= []).push(...(pts.length === 4 ? [pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]] : pts));
      } else if (a[0] === '2') {
        const n = a.slice(2, 8).map(Number);
        lines.push(ap(M, n[0], n[1], n[2]), ap(M, n[3], n[4], n[5]));
      }
    }
  })(text, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], 'main', 0);
  return { tris, lines, inst, studs };
}

/** Every point of a part, its studs and tubes included, in LDraw axes. */
function points(W, studs = true) {
  const out = Object.values(W.tris).flat();
  for (const { name, M } of W.inst) if (studs || !TOPSTUD.test(name)) for (const p of Object.values(PRIMS[name]?.tris || {}).flat()) out.push(ap(M, ...p));
  return out;
}
/** The app's catalog, and points on each part's current drawing (to tell which way a part faces). */
async function appCatalog() {
  const html = path.join(ROOT, 'tests', 'pack-harness.html');
  fs.writeFileSync(html, `<!doctype html><html><head><meta charset=utf8></head><body>${fs.readFileSync(path.join(ROOT, 'app', 'byggboken.html'), 'utf8')}</body></html>`);
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route('**/three.min.js', (r) => r.fulfill({ path: path.join(ROOT, 'tests', '.cache', 'three.min.js'), contentType: 'application/javascript' }));
  await p.route('**/parts.json', (r) => r.fulfill({ body: '{}', contentType: 'application/json' }));
  await p.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const cat = await p.evaluate(() => Object.values(CAT).map((C) => {
    const pts = [];
    // The hand-made drawing, if the app still has one: sample its surface.
    try {
      const L = handLayers(C, { c: 'red' }, true);
      for (const l of L) for (const g0 of l.geos) {
        const g = g0.index ? g0.toNonIndexed() : g0, a = g.attributes.position.array;
        for (let i = 0; i < a.length; i += 9) for (const [u, v] of [[1 / 3, 1 / 3], [0.8, 0.1], [0.1, 0.8], [0.1, 0.1]]) {
          const w = 1 - u - v; pts.push([a[i] * u + a[i + 3] * v + a[i + 6] * w, a[i + 1] * u + a[i + 4] * v + a[i + 7] * w, a[i + 2] * u + a[i + 5] * v + a[i + 8] * w].map((x) => x * 20));
        }
      }
    } catch {}
    return { id: C.id, w: C.w, d: C.d, h: C.h, child: !!C.child, wheels: !!C.wheels, studs: ruleCells(C, C.studs), pts };
  }));
  await b.close();
  return cat;
}

const rotY = ([x, y, z], r) => (r === 0 ? [x, y, z] : r === 90 ? [-z, y, x] : r === 180 ? [-x, y, -z] : [z, y, -x]);
const toApp = (p) => [p[0], -p[1], -p[2]];
/** Min and max corner of many points (a loop: spreading big arrays into Math.min overflows the stack). */
function extent(pts) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
  return [mn, mx];
}

/** Turns and moves a part so it sits on the app's grid like the catalog says: returns the transform and how well it fits. */
function place(C, W, r) {
  const T = (p) => rotY(toApp(p), r);
  const body = points(W).map(T);
  const [mn, mx] = extent(body);
  const ups = W.studs.filter((s) => s.d[1] === -1).map((s) => T(s.o)); // studs pointing up (LDraw -y)
  const topY = ups.length ? Math.max(...ups.map((p) => p[1])) : null;
  // x/z: center the body on the footprint; if something sticks out (a handle), snap the studs onto cell centers instead.
  let tx = C.w * 10 - (mn[0] + mx[0]) / 2, tz = C.d * 10 - (mn[2] + mx[2]) / 2;
  const fits = Math.abs((mx[0] - mn[0]) / 20 - C.w) < 0.3 && Math.abs((mx[2] - mn[2]) / 20 - C.d) < 0.3;
  if (ups.length && !fits) {
    const s = ups[0];
    const snap = (v) => v - (Math.round((v - 10) / 20) * 20 + 10);
    tx -= snap(s[0] + tx); tz -= snap(s[2] + tz);
  }
  // y: if the studs sit on the very top of the part, that top surface is at the part's height (pins and baseplates
  // don't change where it connects); otherwise the bottom sits on 0.
  const [, top] = extent(points(W, false).map(T));
  const ty = topY != null && Math.abs(topY - top[1]) < 0.5 ? C.h * 8 - topY : -mn[1];
  const at = (p) => { const q = T(p); return [q[0] + tx, q[1] + ty, q[2] + tz]; };
  // Fit: footprint, stud cells, and overlap with the old drawing.
  const fw = Math.abs((mx[0] - mn[0]) / 20 - C.w) < 0.3 && Math.abs((mx[2] - mn[2]) / 20 - C.d) < 0.3;
  const cells = W.studs.filter((s) => s.d[1] === -1 && Math.abs(T(s.o)[1] - topY) < 0.5).map((s) => { const q = at(s.o); return `${Math.round((q[0] - 10) / 20)},${Math.round((q[2] - 10) / 20)}`; }).sort().join(' ');
  const want = C.studs.map(([x, z]) => `${x},${z}`).sort().join(' ');
  let overlap = 0;
  if (C.pts.length) {
    const vox = new Set(), key = (p) => p.map((v) => Math.round(v / 4)).join(',');
    for (const t of Object.values(W.tris)) for (const p of t) vox.add(key(at(p)));
    let hit = 0; for (const p of C.pts) { const k = p.map((v) => Math.round(v / 4)); let ok = false;
      for (let dx = -1; dx <= 1 && !ok; dx++) for (let dy = -1; dy <= 1 && !ok; dy++) for (let dz = -1; dz <= 1 && !ok; dz++) ok = vox.has([k[0] + dx, k[1] + dy, k[2] + dz].join(','));
      if (ok) hit++; }
    overlap = hit / C.pts.length;
  }
  return { r, at, score: (fw ? 2 : 0) + (cells === want ? 1 : 0) + overlap, fw, studsOK: cells === want, overlap };
}

const PRIMS = {};
const b64 = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
const Q = 4; // 1/4 LDU

/** Packs triangles (by color) and edge lines through a transform `at`: positions as Int16 in 1/4 LDU, indexed. */
function packMesh(W, at) {
  const verts = new Map(), pos = [];
  const vi = (p) => { const q = at(p).map((v) => Math.round(v * Q)); const k = q.join(','); let i = verts.get(k); if (i == null) { i = pos.length / 3; verts.set(k, i); pos.push(...q); } return i; };
  const groups = [];
  for (const [c, pts] of Object.entries(W.tris)) {
    const idx = pts.map(vi), out = [];
    // Drop triangles that collapsed when rounded.
    for (let i = 0; i < idx.length; i += 3) if (idx[i] !== idx[i + 1] && idx[i + 1] !== idx[i + 2] && idx[i] !== idx[i + 2]) out.push(idx[i], idx[i + 1], idx[i + 2]);
    const col = c === 'main' || c === 'edge' || !COLORS[c] ? 'm' : COLORS[c][0] + (COLORS[c][1] < 1 ? ':' + COLORS[c][1].toFixed(2) : '');
    const g = groups.find((x) => x.c === col); if (g) g.i.push(...out); else groups.push({ c: col, i: out });
  }
  const big = pos.length / 3 > 65535;
  return {
    v: b64(new Int16Array(pos)),
    g: groups.filter((g) => g.i.length).map((g) => ({ c: g.c, i: b64(big ? new Uint32Array(g.i) : new Uint16Array(g.i)) })),
    l: b64(new Int16Array(W.lines.flatMap((p) => at(p).map((v) => Math.round(v * Q))))), ...(big ? { big: 1 } : {}),
  };
}
/** A part: its own mesh placed on the grid, plus where each stud/tube goes (prim name and a 3x4 matrix in LDU). */
function pack(C, W, P) {
  const inst = W.inst.map(({ name, M }) => {
    const f = (x, y, z) => P.at(ap(M, x, y, z)), o = f(0, 0, 0);
    const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => f(...e).map((v, k) => v - o[k]));
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    return [name, ...[0, 1, 2].flatMap((row) => [r4(cols[0][row]), r4(cols[1][row]), r4(cols[2][row]), Math.round(o[row] * Q) / Q])];
  });
  return { ...packMesh(W, P.at), s: inst };
}

const all = (W, at) => Object.values(W.tris).flat().map(at);
/** Wheel pins of a wheel plate, at r=0 along x: [tip x, center y, center z, x where the pin leaves the holder] in 1/4 LDU, left then right. */
function pins(W, P) {
  const pts = all(W, P.at), [[lo], [hi]] = extent(pts);
  return [[lo, 1], [hi, -1]].map(([x, inward]) => {
    const end = pts.filter((p) => Math.abs(p[0] - x) < 0.5);
    const mid = (k) => (Math.min(...end.map((p) => p[k])) + Math.max(...end.map((p) => p[k]))) / 2;
    const cy = mid(1), cz = mid(2);
    // Walk inward from the tip until something is wider than the pin (more than 5 LDU from its axis): the holder's face.
    const along = pts.filter((p) => (p[0] - x) * inward > 0.5).sort((a, b) => (a[0] - b[0]) * inward);
    const face = along.find((p) => Math.hypot(p[1] - cy, p[2] - cz) > 5);
    return [x, cy, cz, face ? face[0] : x].map((v) => Math.round(v * Q));
  });
}
/** The top ends of the flower stems: the highest point, then the highest point away from the ones found, 3 times. */
function tips(W, P) {
  const pts = all(W, P.at).sort((a, b) => b[1] - a[1]), out = [];
  for (const p of pts) if (out.length < 3 && out.every((q) => Math.hypot(p[0] - q[0], p[2] - q[2]) > 12)) out.push(p);
  return out.map((p) => p.map((v) => Math.round(v * Q)));
}
/** A wheel turned so its axle runs along x, centered at the origin; its radius and width in studs. */
function wheel(f, prims) {
  const W = walk(f.text, prims), pts = Object.values(W.tris).flat().map(toApp);
  const [mn, mx] = extent(pts);
  const size = mx.map((v, k) => v - mn[k]), axle = size.indexOf(Math.min(...size)), c = mn.map((v, k) => (v + mx[k]) / 2);
  // Swap the axle axis with x.
  const at = (p) => { const q = toApp(p).map((v, k) => v - c[k]); return axle === 0 ? q : axle === 1 ? [q[1], -q[0], q[2]] : [q[2], q[1], -q[0]]; };
  const P = { at, r: 0 };
  return { ...pack(null, W, P), r: Math.round(Math.max(...size.filter((_, k) => k !== axle)) / 2 / 20 * 100) / 100, width: Math.round(size[axle] / 20 * 100) / 100 };
}

(async () => {
  const ids = process.argv.slice(2);
  const cat = (await appCatalog()).filter((C) => !ids.length || ids.includes(C.id));
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const report = [], prims = PRIMS;
  for (const C of cat) {
    const f = find(FILE[C.id] || C.id);
    if (!f) { report.push(`${C.id}: not in LDraw`); continue; }
    const W = walk(f.text, prims);
    const tries = [0, 90, 180, 270].map((r) => place(C, W, r)).sort((a, b) => b.score - a.score);
    let P = tries[0];
    const fixed = TURN[C.id] ?? TURNS[C.id];
    if (fixed != null) P = place(C, W, fixed);
    TURNS[C.id] = P.r;
    out[C.id] = pack(C, W, P);
    if (C.wheels) out[C.id].pins = pins(W, P);
    if (C.id === '3741') out[C.id].tips = tips(W, P);
    const close = fixed == null && tries[1] && tries[0].score - tries[1].score < 0.1;
    report.push(`${C.id.padEnd(9)} ${f.file.padEnd(10)} r${P.r} foot ${P.fw ? 'ok' : 'NO'} studs ${P.studsOK ? 'ok' : 'NO'} overlap ${P.overlap.toFixed(2)}${close ? ' (CLOSE: check facing)' : ''}`);
  }
  out._wheels = { ...(out._wheels || {}) };
  if (!ids.length) for (const id of WHEELS) out._wheels[id] = wheel(find(id), prims);
  out._prims = { ...(out._prims || {}) };
  for (const [name, W] of Object.entries(prims)) out._prims[name] = packMesh(W, (p) => p);
  fs.writeFileSync(OUT, JSON.stringify(out));
  fs.writeFileSync(TURNS_FILE, JSON.stringify(Object.fromEntries(Object.entries(TURNS).sort()), null, 0).replace(/,"/g, ',\n"') + '\n');
  console.log(report.join('\n'));
  console.log(`wrote ${OUT}: ${Object.keys(out).filter((k) => k[0] !== '_').length} parts, ${Object.keys(out._prims).length} shared stud shapes, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
})();

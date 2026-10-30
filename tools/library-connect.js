// Works out how every library piece connects on the stud grid, from its LDraw CAD model, so the builder can use any
// piece. For each piece, at r=0 and in grid units (x, z in studs, y in plates):
//   cells   [cx, cz, lo, hi]  the space it fills: in column (cx, cz), plate levels lo..hi
//   studs   [cx, cz, y]       an upward stud on the grid, its base y plates above the bottom
//   holds   [cx, cz, y]       a spot underneath that grips a stud coming from below, y plates above the bottom
//   o       [x, y, z]         where grid cell (0, 0, 0) starts, in the part's own LDraw units (app axes)
// A piece fits when its studs sit on the grid or half a stud off it (jumpers: a stud at x + 0.5); pieces that can't
// connect at all are left out. Writes app/library-connect.json, and the shapes, raw in LDraw axes like the set parts:
// lib-shapes-core.json for the common pieces, lib-shapes-N.json for the rest (k in each entry says which file), and t,
// the turn (degrees) that makes a common piece face the way the app describes it.
// Usage: node tools/library-connect.js [part ...]   (with parts: print their data only)
const fs = require('fs'), path = require('path');
const { load, TOPSTUD } = require('../tests/ldraw-lib.js');
const ROOT = path.join(__dirname, '..'), APP = path.join(ROOT, 'app');

const mul = (A, B) => {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 4 + j] = A[i * 4] * B[j] + A[i * 4 + 1] * B[4 + j] + A[i * 4 + 2] * B[8 + j];
    r[i * 4 + 3] = A[i * 4] * B[3] + A[i * 4 + 1] * B[7] + A[i * 4 + 2] * B[11] + A[i * 4 + 3];
  }
  return r;
};
const ap = (M, x, y, z) => [M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11]];
// LDraw -> app axes (y up, z toward the viewer), then turned (degrees, seen from above) to the facing the app uses.
const rotY = ([x, y, z], r) => (r === 0 ? [x, y, z] : r === 90 ? [-z, y, x] : r === 180 ? [-x, y, -z] : [z, y, -x]);
// Catalog pieces face the way the app's descriptions say ("slopes down toward +z"): the turn tools/ldraw-pack.js chose.
const TURNS = JSON.parse(fs.readFileSync(path.join(__dirname, 'ldraw-turns.json'), 'utf8'));

/** Triangles of the body (studs on top left out) and the studs, both in app axes and LDraw units, turned by turn. */
function geometry(text, turn = 0) {
  const T = (p) => rotY([p[0], -p[1], -p[2]], turn);
  const tris = [], studs = [];
  (function go(t, M, depth) {
    if (depth > 30) return;
    for (const raw of t.split(/\r?\n/)) {
      const a = raw.trim().split(/\s+/);
      if (a[0] === '1') {
        const n = a.slice(2, 14).map(Number), name = a.slice(14).join(' ').toLowerCase().replace(/\\/g, '/');
        const M2 = mul(M, [n[3], n[4], n[5], n[0], n[6], n[7], n[8], n[1], n[9], n[10], n[11], n[2]]);
        if (TOPSTUD.test(path.basename(name))) {
          // A stud is 4 units tall; some are drawn stretched from lower down. Its base is where its tip is, less 4.
          const o = T(ap(M2, 0, 0, 0)), u = T(ap(M2, 0, -1, 0)), up = [u[0] - o[0], u[1] - o[1], u[2] - o[2]];
          studs.push({ o: [o[0], o[1] + 4 * up[1] - 4, o[2]], up });
          continue;
        }
        const st = (!name.includes('/') && load('8/' + name, ['p/'])) || load(name);
        if (st) go(st, M2, depth + 1);
      } else if (a[0] === '3' || a[0] === '4') {
        const n = a.slice(2).map(Number), p = [];
        for (let i = 0; i < Number(a[0]); i++) p.push(T(ap(M, n[i * 3], n[i * 3 + 1], n[i * 3 + 2])));
        tris.push([p[0], p[1], p[2]]); if (p.length === 4) tris.push([p[0], p[2], p[3]]);
      }
    }
  })(text, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], 0);
  return { tris, studs };
}

/* Triangle against box (separating axis test, Akenine-Möller). */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function triBox(tri, c, h) {
  const v = tri.map((p) => sub(p, c));
  const e = [sub(v[1], v[0]), sub(v[2], v[1]), sub(v[0], v[2])];
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const sep = (ax) => {
    const p = v.map((q) => dot(q, ax)), r = h[0] * Math.abs(ax[0]) + h[1] * Math.abs(ax[1]) + h[2] * Math.abs(ax[2]);
    return Math.min(...p) > r || Math.max(...p) < -r;
  };
  for (const a of axes) for (const ed of e) { const ax = cross(a, ed); if (dot(ax, ax) > 1e-12 && sep(ax)) return false; }
  for (const a of axes) if (sep(a)) return false;
  const n = cross(e[0], e[1]);
  return !(dot(n, n) > 1e-12 && sep(n));
}

/** The part of a triangle between two heights, as a polygon (Sutherland-Hodgman on two planes). */
function slab(tri, y0, y1) {
  let poly = tri;
  for (const [lim, keep] of [[y0, (y) => y >= y0], [y1, (y) => y <= y1]]) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ia = keep(a[1]), ib = keep(b[1]);
      if (ia) out.push(a);
      if (ia !== ib) { const t = (lim - a[1]) / (b[1] - a[1]); out.push([a[0] + t * (b[0] - a[0]), lim, a[2] + t * (b[2] - a[2])]); }
    }
    poly = out; if (!poly.length) return poly;
  }
  return poly;
}
/** Smallest distance, seen from above, from the vertical line through (x, z) to a polygon, and the direction to it. */
function axisNear(poly, x, z) {
  let inside = false, best = Infinity, dir = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, , az] = poly[j], [bx, , bz] = poly[i];
    if ((bz > z) !== (az > z) && x < ((ax - bx) * (z - bz)) / (az - bz) + bx) inside = !inside;
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    const px = ax + t * dx - x, pz = az + t * dz - z, d = Math.hypot(px, pz);
    if (d < best) { best = d; dir = Math.atan2(pz, px); }
  }
  // A flat polygon seen edge-on (a vertical wall) has no inside; one lying down does.
  return inside && poly.length > 2 ? [0, 0] : [best, dir];
}
const axisDist = (poly, x, z) => axisNear(poly, x, z)[0];

const near = (v, step, tol) => Math.abs(v / step - Math.round(v / step)) * step <= tol;
const mod = (v, m) => ((v % m) + m) % m;

/** Connection data of one LDraw part, or a reason it doesn't fit the grid. */
function connect(file, name = '', turn = 0) {
  const text = load(file + '.dat', ['parts/']);
  if (!text) return { why: 'no model' };
  const { tris, studs } = geometry(text, turn);
  if (!tris.length) return { why: 'no geometry' };
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const t of tris) for (const p of t) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  // Top studs point up and have nothing above them (studs inside the part are details, like tubes drawn with stud shapes).
  const clearAbove = (s) => !tris.some((t) => { const p = slab(t, s.o[1] + 0.5, s.o[1] + 3.5); return p.length && axisDist(p, s.o[0], s.o[2]) < 4.5; });
  const up = studs.filter((s) => s.up[1] > 0.9 && Math.hypot(s.up[0], s.up[2]) < 0.1 && clearAbove(s));
  if (up.length < studs.length && !up.length) return { why: 'side studs only' };
  // The grid: studs sit at cell centers (10 + 20n) and on whole plates (8n) above the bottom.
  let ox, oz, oy;
  if (up.length) {
    ox = mod(up[0].o[0] - 10, 20); oz = mod(up[0].o[2] - 10, 20);
    // Studs that don't all share one grid (some half a stud off): the body and its grips set the grid.
    if (up.some((s) => !near(s.o[0] - 10 - ox, 20, 0.6) || !near(s.o[2] - 10 - oz, 20, 0.6))) {
      if (up.some((s) => !near(s.o[0] - ox, 10, 0.6) || !near(s.o[2] - oz, 10, 0.6))) return { why: 'studs off the grid' };
      const s0 = up[0].o[1];
      return bestGrid(tris, up, mn, mx, s0 - 8 * Math.ceil((s0 - mn[1] - 1) / 8));
    }
    // Grid lines at or just inside the body's edges.
    ox += 20 * Math.floor((mn[0] + 2 - ox) / 20); oz += 20 * Math.floor((mn[2] + 2 - oz) / 20);
    const s0 = up[0].o[1];
    for (const s of up) if (!near(s.o[1] - s0, 8, 0.6)) return { why: 'studs between plate heights' };
    // The lowest plate level at or below the body's bottom, so nothing hangs below level 0.
    oy = s0 - 8 * Math.ceil((s0 - mn[1] - 1) / 8);
    // Studs half a stud off the body (a jumper, a seat): neither edge of the body is on the studs' grid in some
    // direction. Then the body and its grips set the grid, and those studs sit at half positions.
    const onGrid = (k, o) => near(mn[k] - o, 20, 1.5) || near(mx[k] - o, 20, 1.5);
    if (onGrid(0, ox) && onGrid(2, oz)) return layout(tris, up, mn, mx, ox, oy, oz);
    return bestGrid(tris, up, mn, mx, oy);
  }
  return bestGrid(tris, up, mn, mx, mn[1]);
}
/** Of the two ways LDraw can line a part up in each direction, the one with the most grips (then studs) on the grid. */
function bestGrid(tris, up, mn, mx, oy) {
  let best = null;
  const score = (r) => (r.holds ? r.holds.length * 100 + r.studs.length : -1);
  for (const px of [0, 10]) for (const pz of [0, 10]) {
    const r = layout(tris, up, mn, mx, px + 20 * Math.floor((mn[0] + 2 - px) / 20), oy, pz + 20 * Math.floor((mn[2] + 2 - pz) / 20));
    if (!best || score(r) > score(best)) best = r;
  }
  return best;
}

/** Connection data with grid cell (0, 0, 0) starting at (ox, oy, oz). */
function layout(tris, up, mn, mx, ox, oy, oz) {
  const W = Math.ceil((mx[0] - ox - 2) / 20), D = Math.ceil((mx[2] - oz - 2) / 20), H = Math.ceil((mx[1] - oy - 1) / 8);
  if (W < 1 || D < 1 || H < 1 || W > 32 || D > 32 || H > 72) return { why: 'too big or too small' };
  // Triangles by column, so each cell only tests its own.
  const col = new Map();
  for (const t of tris) {
    const x0 = Math.floor((Math.min(t[0][0], t[1][0], t[2][0]) - ox) / 20), x1 = Math.floor((Math.max(t[0][0], t[1][0], t[2][0]) - ox) / 20);
    const z0 = Math.floor((Math.min(t[0][2], t[1][2], t[2][2]) - oz) / 20), z1 = Math.floor((Math.max(t[0][2], t[1][2], t[2][2]) - oz) / 20);
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) for (let z = Math.max(0, z0); z <= Math.min(D - 1, z1); z++) (col.get(x + ',' + z) || col.set(x + ',' + z, []).get(x + ',' + z)).push(t);
  }
  // Filled space: a column is filled from its lowest to its highest plate level that holds material more than 1 unit in.
  const cells = [];
  for (let cx = 0; cx < W; cx++) for (let cz = 0; cz < D; cz++) {
    const ts = col.get(cx + ',' + cz) || [];
    let lo = -1, hi = -1;
    for (let y = 0; y < H; y++) {
      const c = [ox + 20 * cx + 10, oy + 8 * y + 4, oz + 20 * cz + 10];
      if (ts.some((t) => triBox(t, c, [9, 3, 9]))) { if (lo < 0) lo = y; hi = y; }
    }
    if (lo >= 0) cells.push([cx, cz, lo, hi]);
  }
  if (!cells.length) return { why: 'no space filled' };
  // Studs on the grid.
  // Studs on cell centres, or half a stud off (x.5): a jumper's stud, where a piece on it sits half a stud over.
  const half = (v) => Math.round(v * 2) / 2;
  const st = up.filter((s) => near(s.o[0] - ox - 10, 10, 0.6) && near(s.o[2] - oz - 10, 10, 0.6))
    .map((s) => [half((s.o[0] - ox - 10) / 20), half((s.o[2] - oz - 10) / 20), Math.round((s.o[1] - oy) / 8)]);
  // Underneath: at the bottom of each column, a stud fits (nothing within 5 units of the center for the stud's height)
  // and something grips it: material 5 to 9 units out (the walls of a brick, the tubes, the thin pins of 1-wide parts).
  const holds = [];
  for (const [cx, cz, lo] of cells) {
    const x = ox + 20 * cx + 10, z = oz + 20 * cz + 10, y0 = oy + 8 * lo;
    const ts = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) ts.push(...(col.get(cx + dx + ',' + (cz + dz)) || []));
    let free = true;
    const dirs = [];
    for (const t of ts) {
      const p = slab(t, y0 + 0.5, y0 + 3.5);
      if (!p.length) continue;
      const [d, a] = axisNear(p, x, z);
      if (d < 5) { free = false; break; }
      if (d <= 9) dirs.push(a);
    }
    // Gripped from two sides at least 80 degrees apart, as in a corner (one slanted surface on one side holds nothing).
    const apart = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };
    if (free && dirs.some((a) => dirs.some((b) => apart(a, b) > (80 * Math.PI) / 180))) holds.push([cx, cz, lo]);
  }
  if (!st.length && !holds.length) return { why: 'nothing connects' };
  return { w: W, d: D, h: H, cells, studs: st, holds, o: [ox, oy, oz].map((v) => Math.round(v * 100) / 100) };
}

module.exports = { connect, layout };
if (require.main === module) {
  const lib = JSON.parse(fs.readFileSync(path.join(APP, 'library.json'), 'utf8'));
  const only = process.argv.slice(2);
  const out = {}, why = {};
  const t0 = Date.now();
  for (const [key, e] of Object.entries(lib.parts)) {
    if (only.length && !only.includes(key)) continue;
    if ((e[8] & 1) && !(e[8] & 2)) { why['minifigure part'] = (why['minifigure part'] || 0) + 1; continue; }
    const turn = TURNS[key] || 0, r = connect(e[0], e[2], turn);
    if (r.why) { why[r.why] = (why[r.why] || 0) + 1; continue; }
    out[key] = turn ? { ...r, t: turn } : r;
  }
  if (only.length) { for (const k of only) console.log(k, JSON.stringify(out[k] || 'left out')); }
  else {
    // Shapes, raw in LDraw axes, with the shared stud and tube shapes they use: the most used pieces (the catalog) in
    // full detail in lib-shapes-core.json, loaded at start; the rest with low-detail circles, 40 to a file.
    const { walk, pack, packMesh, PRIMS } = require('./ldraw-pack.js');
    for (const f of fs.readdirSync(APP)) if (/^lib-shapes-(\d+|core)\.json$/.test(f)) fs.unlinkSync(path.join(APP, f));
    const core = Object.keys(out).filter((k) => lib.parts[k][8] & 2), rest = Object.keys(out).filter((k) => !(lib.parts[k][8] & 2)), PER = 40, sizes = [];
    const chunks = [['core', core, false], ...Array.from({ length: Math.ceil(rest.length / PER) }, (_, k) => [k, rest.slice(k * PER, (k + 1) * PER), true])];
    for (const [k, keys, lowres] of chunks) {
      const parts = {}, used = new Set();
      for (const key of keys) {
        const file = lib.parts[key][0];
        parts[file] = pack(null, walk(load(file + '.dat', ['parts/', 'p/']), PRIMS, lowres), { at: (q) => q, r: 0 });
        for (const [name] of parts[file].s) used.add(name);
        out[key].k = k;
      }
      const prims = Object.fromEntries([...used].map((n) => [n, packMesh(PRIMS[n], (q) => q)]));
      const f = path.join(APP, `lib-shapes-${k}.json`);
      fs.writeFileSync(f, JSON.stringify({ parts, _prims: prims }));
      sizes.push(fs.statSync(f).size);
    }
    console.log(`lib-shapes-core: ${(sizes[0] / 1048576).toFixed(1)} MB`);
    console.log(`lib-shapes: ${sizes.length} files, ${(sizes.reduce((a, b) => a + b, 0) / 1048576).toFixed(1)} MB, largest ${(Math.max(...sizes) / 1048576).toFixed(1)} MB`);
    fs.writeFileSync(path.join(APP, 'library-connect.json'), JSON.stringify(out));
    console.log(`${Object.keys(out).length} pieces fit the grid in ${((Date.now() - t0) / 1000).toFixed(0)} s; left out:`, why);
  }
}

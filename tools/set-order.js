// Puts the parts of a real set in an order a child can build: a part goes in no earlier than the step where something
// already built holds it. LDraw models often build a sub-assembly elsewhere and attach it later; inlined, its parts
// would float until then. Holding is worked out from the CAD data of the piece library (tools/library-connect.js):
// a stud of one part in a grip of another; parts without stud data (rims, Technic, clips) hold by touching.
const fs = require('fs'), path = require('path');
const { load, measure, TOPSTUD } = require('../tests/ldraw-lib.js');
const { keyOf } = require('./library-keys.js');
// On a fresh checkout the first set build runs before the library exists; then only touching parts count as held.
const CONN_FILE = path.join(__dirname, '..', 'app', 'library-connect.json');
const CONN = fs.existsSync(CONN_FILE) ? JSON.parse(fs.readFileSync(CONN_FILE, 'utf8')) : {};

const ap = (M, x, y, z) => [M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11]];
const dir = (M, x, y, z) => [M[0] * x + M[1] * y + M[2] * z, M[4] * x + M[5] * y + M[6] * z, M[8] * x + M[9] * y + M[10] * z];
const mul = (A, B) => {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 4 + j] = A[i * 4] * B[j] + A[i * 4 + 1] * B[4 + j] + A[i * 4 + 2] * B[8 + j];
    r[i * 4 + 3] = A[i * 4] * B[3] + A[i * 4 + 1] * B[7] + A[i * 4 + 2] * B[11] + A[i * 4 + 3];
  }
  return r;
};
/** Every stud of a part, pointing any way (side studs too): base point and unit direction, in LDraw axes. */
function studsOf(text) {
  const out = [];
  (function go(t, M, depth) {
    if (depth > 30) return;
    for (const raw of t.split(/\r?\n/)) {
      const a = raw.trim().split(/\s+/);
      if (a[0] !== '1') continue;
      const n = a.slice(2, 14).map(Number), name = a.slice(14).join(' ').toLowerCase().replace(/\\/g, '/');
      const M2 = mul(M, [n[3], n[4], n[5], n[0], n[6], n[7], n[8], n[1], n[9], n[10], n[11], n[2]]);
      if (TOPSTUD.test(path.basename(name))) {
        // A stud is 4 units tall from its base; some are drawn stretched, so the base is the tip less 4.
        const o = ap(M2, 0, 0, 0), u = dir(M2, 0, -1, 0), L = Math.hypot(...u), e = u.map((v) => v / L);
        out.push({ p: o.map((v, k) => v + 4 * u[k] - 4 * e[k]), d: e });
        continue;
      }
      // Stud groups (stug-*.dat) and sub-files hold more studs; plain shape primitives hold none.
      if (!/^(\d+-\d+|box|rect|tri|edge|ring|disc|ndis|cyl|con|chrd|tor|bump|empty|axl|peghole|connhole|beam|tooth|npeg|logo)/.test(path.basename(name)) || name.startsWith('s/')) {
        const st = load(name); if (st) go(st, M2, depth + 1);
      }
    }
  })(text, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], 0);
  return out;
}
const local = {};
/** A part's studs (any direction), grips (from the library, facing the part's up) and body box, in LDraw axes. */
function partData(file) {
  if (local[file]) return local[file];
  const K = CONN[keyOf(file) || ''] || CONN[file];
  const text = load(file + '.dat', ['parts/']), m = text ? measure(text) : { min: [0, 0, 0], max: [0, 0, 0] };
  // Library data is in app axes (y up, z toward the viewer), turned t degrees for the common pieces; LDraw has y down
  // and z away.
  const back = ([x, y, z]) => { const t = (360 - (K.t || 0)) % 360; return t === 0 ? [x, y, z] : t === 90 ? [-z, y, x] : t === 180 ? [-x, y, -z] : [z, y, -x]; };
  const pt = (cx, cz, y) => { const [x, yy, z] = back([K.o[0] + 20 * cx + 10, K.o[1] + 8 * y, K.o[2] + 20 * cz + 10]); return [x, -yy, -z]; };
  return (local[file] = {
    studs: text ? studsOf(text) : [],
    holds: K ? K.holds.map(([cx, cz, y]) => pt(cx, cz, y)) : [],
    box: [[m.min[0], -m.max[1], -m.max[2]], [m.max[0], -m.min[1], -m.min[2]]],
  });
}
/** Placed parts {file, M} with their studs, grips and box in the model. */
function place(parts) {
  return parts.map((p) => {
    const d = partData(p.file), up = dir(p.M, 0, -1, 0);
    const corners = [];
    for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) corners.push(ap(p.M, d.box[x][0], d.box[y][1], d.box[z][2]));
    return { studs: d.studs.map((q) => ({ p: ap(p.M, ...q.p), d: dir(p.M, ...q.d) })), holds: d.holds.map((q) => ap(p.M, ...q)), up,
      lo: [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k]))), hi: [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k]))) };
  });
}
/** Which parts hold which: a stud in a grip (same spot, same up), or bodies that go into each other by more than 1 unit. */
function links(P) {
  const near = (a, b) => Math.abs(a[0] - b[0]) < 1.5 && Math.abs(a[1] - b[1]) < 1.5 && Math.abs(a[2] - b[2]) < 1.5;
  const holds = new Map();
  P.forEach((p, i) => p.holds.forEach((q) => { const k = q.map((v) => Math.round(v / 10)).join(','); (holds.get(k) || holds.set(k, []).get(k)).push(i); }));
  const E = P.map(() => new Set());
  P.forEach((p, i) => p.studs.forEach(({ p: s, d: u }) => {
    const r = s.map((v) => Math.round(v / 10));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
      for (const j of holds.get([r[0] + dx, r[1] + dy, r[2] + dz].join(',')) || []) {
        if (j === i) continue;
        const q = P[j], v = q.up;
        if (u[0] * v[0] + u[1] * v[1] + u[2] * v[2] > 0.9 && q.holds.some((h) => near(h, s))) { E[i].add(j); E[j].add(i); }
      }
  }));
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j];
    if ([0, 1, 2].every((k) => Math.min(a.hi[k], b.hi[k]) - Math.max(a.lo[k], b.lo[k]) > 1)) { E[i].add(j); E[j].add(i); }
  }
  return E;
}
/**
 * Parts that count as held by themselves: the first step (the base), parts standing on the table, and the lowest part
 * of each separate model in the set that has neither (a figure on its own, a sub-model placed high).
 */
function bases(steps, P, E) {
  const ground = Math.max(...P.map((p) => p.hi[1])); // LDraw y points down: the table is the largest y
  const out = new Set(), seen = new Set();
  // The first step is a base only in a model with steps of its own; a model without steps is all one step.
  P.forEach((p, i) => { if ((steps.length >= 3 && i < steps[0].length) || p.hi[1] > ground - 2) out.add(i); });
  for (let i = 0; i < P.length; i++) {
    if (seen.has(i)) continue;
    const comp = [i], st = [i]; seen.add(i);
    while (st.length) { const a = st.pop(); for (const b of E[a]) if (!seen.has(b)) { seen.add(b); comp.push(b); st.push(b); } }
    // A separate model off the table (a figure, a sub-model placed high) starts from its lowest part.
    if (!comp.some((j) => out.has(j))) out.add(comp.reduce((a, b) => (P[b].hi[1] > P[a].hi[1] ? b : a)));
  }
  return out;
}
/** Parts (by index into the flat list) that are not held by anything built before or in their step, step by step. */
function floating(steps, P, E, B = bases(steps, P, E)) {
  const out = [], built = new Set();
  let n = 0;
  steps.forEach((s, si) => {
    const ids = s.map(() => n++);
    ids.forEach((i) => built.add(i));
    // Held: connected through built parts to the first step (the base) or to something standing on the table.
    const seen = new Set(), stack = [...built].filter((i) => B.has(i));
    stack.forEach((i) => seen.add(i));
    while (stack.length) { const a = stack.pop(); for (const b of E[a]) if (built.has(b) && !seen.has(b)) { seen.add(b); stack.push(b); } }
    for (const i of built) if (!seen.has(i) && !out.some((f) => f.i === i)) out.push({ i, step: si });
  });
  return out;
}
/**
 * New steps (lists of the same part objects): each part moves to the first step at or after its own where it is held.
 * Steps of up to 8 parts stay as the model has them; bigger ones (and models without steps) are built one separate model
 * at a time, in layers from the bottom up, each part as soon as something holds it.
 */
function orderSteps(steps) {
  const flat = steps.flat(), P = place(flat), E = links(P);
  const stepOf = []; steps.forEach((s, si) => s.forEach(() => stepOf.push(si)));
  const B = bases(steps, P, E), base = (i) => B.has(i);
  // Every part the finished model holds is joined to a base, so every part can wait until it is held.
  const reach = new Set(P.map((p, i) => i).filter(base));
  { const st = [...reach]; while (st.length) { const a = st.pop(); for (const b of E[a]) if (!reach.has(b)) { reach.add(b); st.push(b); } } }
  // Which separate model each part belongs to, so one is finished before the next starts.
  const comp = new Array(P.length).fill(-1);
  for (let i = 0, c = 0; i < P.length; i++) {
    if (comp[i] >= 0) continue;
    const st = [i]; comp[i] = c;
    while (st.length) { const a = st.pop(); for (const b of E[a]) if (comp[b] < 0) { comp[b] = c; st.push(b); } }
    c++;
  }
  const size = []; comp.forEach((c) => (size[c] = (size[c] || 0) + 1)); // the biggest model first
  const out = [], built = new Set();
  let waiting = [], cur = -1;
  const addable = () => waiting.filter((i) => !built.has(i) && (!reach.has(i) || base(i) || [...E[i]].some((j) => built.has(j) && reach.has(j))));
  for (let si = 0; si < steps.length; si++) {
    waiting.push(...flat.map((_, i) => i).filter((i) => stepOf[i] === si));
    for (;;) {
      let can = addable();
      if (!can.length) break;
      // A step of the model's own that fits a child's step stays as it is.
      if (steps.length >= 3 && can.length <= 8 && can.every((i) => stepOf[i] === si)) { can.forEach((i) => built.add(i)); out.push(can.map((i) => flat[i])); cur = comp[can[0]]; continue; }
      // Otherwise: the current separate model first, then its lowest layer that can go on now, at most 8 parts.
      if (can.some((i) => comp[i] === cur)) can = can.filter((i) => comp[i] === cur);
      else { cur = can.map((i) => comp[i]).sort((a, b) => size[b] - size[a] || a - b)[0]; can = can.filter((i) => comp[i] === cur); }
      const low = Math.max(...can.map((i) => P[i].hi[1])); // LDraw y points down: the lowest part has the largest y
      const pick = can.filter((i) => P[i].hi[1] > low - 12).sort((a, b) => P[b].hi[1] - P[a].hi[1] || a - b).slice(0, 8);
      pick.forEach((i) => built.add(i));
      // A small layer joins the step before when that is also small and of the same model (it may rest on it).
      const prev = out.at(-1);
      if (prev?.made && prev.comp === cur && prev.length + pick.length <= 6) prev.push(...pick.map((i) => flat[i]));
      else out.push(Object.assign(pick.map((i) => flat[i]), { made: true, comp: cur }));
    }
    waiting = waiting.filter((i) => !built.has(i));
  }
  if (waiting.length) out.push(waiting.map((i) => flat[i]));
  return out.map((st) => [...st]);
}
module.exports = { orderSteps, floating, bases, place, links };

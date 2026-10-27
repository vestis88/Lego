// Compares the connection data worked out from CAD (tools/library-connect.js) with the hand-made catalog: the space each
// piece fills, its studs and where it grips studs underneath. Any piece may face another way in CAD, so all 4 turns count.
// Usage: node tests/connect-check.js [-v]
const fs = require('fs'), path = require('path'), vm = require('vm');
const { connect } = require('../tools/library-connect.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'byggboken.html'), 'utf8');
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'ldraw-ref.json'), 'utf8'));
// The catalog and the grid functions, run on their own.
const src = html.slice(html.indexOf('const CAT = {};'), html.indexOf('/* ============================================================= helpers */'))
  + html.slice(html.indexOf('/** Cells a part covers at r=0'), html.indexOf('function rotMatrix('));
const ctx = {}; vm.createContext(ctx); vm.runInContext(src.replace('const CAT = {};', 'var CAT = this.CAT = {};') + '\nthis.info = info;', ctx);
const { CAT, info } = ctx;

const key = (a) => a.join(',');
/** The catalog's view of a piece at the origin, r=0: filled unit cells, studs and grips, each as "x,z,y". */
function fromCatalog(id) {
  const I = info({ id, x: 0, y: 0, z: 0, r: 0 });
  return { fill: I.occ.map(([x, y, z]) => key([x, z, y])), studs: I.studs.map((s) => key(s)), holds: I.bottom.map((s) => key(s)) };
}
function fromCad(r, turn) {
  const t = ([x, z, y]) => (turn === 0 ? [x, z, y] : turn === 90 ? [z, -x, y] : turn === 180 ? [-x, -z, y] : [-z, x, y]);
  const fill = [];
  for (const [x, z, lo, hi] of r.cells) for (let y = lo; y <= hi; y++) fill.push(t([x, z, y]));
  const mx = Math.min(...fill.map((p) => p[0])), mz = Math.min(...fill.map((p) => p[1])), my = Math.min(...fill.map((p) => p[2]));
  const n = ([x, z, y]) => key([x - mx, z - mz, y - my]);
  return { fill: fill.map(n), studs: r.studs.map((s) => n(t(s))), holds: r.holds.map((s) => n(t(s))) };
}
const same = (a, b) => a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;
const verbose = process.argv.includes('-v');
const stats = { all: 0, exact: 0, fill: 0, studs: 0, holds: 0, out: 0 }, diffs = [];
for (const [id, C] of Object.entries(CAT)) {
  if (C.child || !ref[id]) continue;
  stats.all++;
  const r = connect(ref[id].file, C.en), cat = fromCatalog(id);
  if (r.why) { stats.out++; diffs.push(`${id} ${C.en}: left out (${r.why})`); continue; }
  // The turn that matches best: filled space first, then studs, then grips.
  let best = null;
  for (const turn of [0, 90, 180, 270]) {
    const cad = fromCad(r, turn), m = [same(cad.fill, cat.fill), same(cad.studs, cat.studs), same(cad.holds, cat.holds)];
    const score = m[0] * 4 + m[1] * 2 + m[2];
    if (!best || score > best.score) best = { score, m, cad, turn };
  }
  const [f, s, h] = best.m;
  stats.fill += f; stats.studs += s; stats.holds += h; if (f && s && h) stats.exact++;
  else diffs.push(`${id} ${C.en}: ${[!f && 'fill', !s && 'studs', !h && 'grips'].filter(Boolean).join(', ')} differ` +
    (verbose ? `\n   catalog ${JSON.stringify(cat)}\n   cad     ${JSON.stringify(best.cad)}` : ''));
}
console.log(diffs.join('\n'));
console.log(`connect: ${stats.exact} of ${stats.all} catalog pieces match the catalog exactly; fill ${stats.fill}, studs ${stats.studs}, grips ${stats.holds} agree; ${stats.out} left out`);

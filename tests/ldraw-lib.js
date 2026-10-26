// Reads LDraw part files (the community CAD library of real LEGO parts) and measures them.
// Files are fetched from library.ldraw.org once and cached in .cache/ldraw.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const CACHE = path.join(__dirname, '.cache', 'ldraw');
const BASES = ['https://library.ldraw.org/library/official/', 'https://library.ldraw.org/library/unofficial/'];
function get(rel) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, rel.replace(/\//g, '__'));
  if (fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return t === '' ? null : t; }
  for (const base of BASES) {
    try {
      const t = execFileSync('curl', ['-sSf', '--max-time', '20', base + rel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (t.startsWith('0')) { fs.writeFileSync(f, t); return t; }
    } catch {}
  }
  fs.writeFileSync(f, ''); return null;
}
function load(name, dirs = ['parts/', 'p/', 'p/48/', 'p/8/']) {
  name = name.toLowerCase().replace(/\\/g, '/');
  for (const d of dirs) { const t = get(d + name); if (t) return t; }
  return null;
}
/** Finds the LDraw file for a design ID: tries suffixes (3040 -> 3040b) and follows "~Moved to". */
function find(id) {
  const base = id.replace(/[a-z]$/, '');
  for (const c of new Set([id, id + 'b', id + 'a', id + 'c', id + 'c01', base, base + 'b', base + 'a', base + 'c'])) {
    let name = c, t = load(c + '.dat', ['parts/']);
    for (let i = 0; t && i < 3; i++) { const m = t.split('\n')[0].match(/^0 ~Moved to (\S+)/); if (!m) break; name = m[1]; t = load(name + '.dat', ['parts/']); }
    if (t) return { file: name, title: t.split('\n')[0].replace(/^0\s*/, '').trim(), text: t };
  }
  return null;
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
// Stud primitives that sit on top of a part (tubes and pins underneath are stud3/stud4 and are not listed).
const TOPSTUD = /^(stud|stud2|stud2a|stud6|stud6a|stud9|stud10|stud12|stud15|stud17a|studp01|stu2\d*|stud\d?a?-?logo\d?)\.dat$/;
/** Body box (without studs) and upward studs, in app axes (y up, z toward the viewer) and LDraw units (1 stud = 20, 1 plate = 8). */
function measure(text) {
  const T = (p) => [p[0], -p[1], -p[2]];
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], studs = [];
  (function walk(t, M, inStud, depth) {
    if (depth > 30) return;
    for (const line of t.split(/\r?\n/)) {
      const a = line.trim().split(/\s+/);
      if (a[0] === '1') {
        const n = a.slice(2, 14).map(Number), name = a.slice(14).join(' ');
        const M2 = mul(M, [n[3], n[4], n[5], n[0], n[6], n[7], n[8], n[1], n[9], n[10], n[11], n[2]]);
        const isStud = !inStud && TOPSTUD.test(path.basename(name.toLowerCase().replace(/\\/g, '/')));
        if (isStud) { const o = ap(M2, 0, 0, 0), u = ap(M2, 0, -1, 0); if (o[1] - u[1] > 0.9) studs.push(T(o)); }
        const st = load(name); if (st) walk(st, M2, inStud || isStud, depth + 1);
      } else if ((a[0] === '3' || a[0] === '4') && !inStud) {
        const n = a.slice(2).map(Number);
        for (let i = 0; i < Number(a[0]); i++) { const p = T(ap(M, n[i * 3], n[i * 3 + 1], n[i * 3 + 2])); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } }
      }
    }
  })(text, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], false, 0);
  return { min: mn, max: mx, studs };
}
module.exports = { find, measure, load, TOPSTUD };

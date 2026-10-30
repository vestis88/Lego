// Measures the pieces that come with other pieces the way the app draws them: a wheel holder with its wheels, a window
// with its glass, the door frame with its door, the flower stem with its flowers. The app draws each of these from
// app/parts.json in its own grid; this draws them there (in a headless browser) and measures the drawing with the same
// rules as tools/library-connect.js, so the space they fill (the wheels' too), their studs and grips match the picture.
// Adds them to app/library-connect.json (comp: 1). Run after tools/library-connect.js.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { layout } = require('./library-connect.js');
const { TOPSTUD } = require('../tests/ldraw-lib.js');
const ROOT = path.join(__dirname, '..'), APP = path.join(ROOT, 'app');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const html = path.join(ROOT, 'tests', 'thumbs-harness.html');
  fs.writeFileSync(html, `<!doctype html><html><head><meta charset=utf8></head><body>${fs.readFileSync(path.join(APP, 'byggboken.html'), 'utf8')}</body></html>`);
  await p.route('**/three.min.js', (r) => r.fulfill({ path: path.join(ROOT, 'tests', '.cache', 'three.min.js'), contentType: 'application/javascript' }));
  await p.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await p.route('http://app.test/**', (r) => { const f = new URL(r.request().url()).pathname.slice(1); const file = f === 'index.html' ? html : path.join(APP, f); return fs.existsSync(file) ? r.fulfill({ path: file }) : r.fulfill({ status: 404, body: '' }); });
  await p.goto('http://app.test/index.html'); await p.waitForFunction(() => LD.parts);
  // Each composite at the origin, r=0: its triangles (studs left out) and its upward studs, in LDraw units, app axes.
  const got = await p.evaluate((topstud) => {
    const TOP = new RegExp(topstud);
    const out = {};
    for (const C of Object.values(CAT).filter((C) => composite(C) && !C.child)) {
      // Draw without the studs on top (they stand above the part and fill nothing); keep them as stud positions.
      const own = [C.id, C.door, C.glass, C.extras?.[0]?.id, C.wheels?.mesh].filter(Boolean);
      const saved = own.map((id) => [id, LD.parts[id] || LD.parts._wheels?.[id]]);
      const studs = (LD.parts[C.id].s || []).filter(([n]) => TOP.test(n)).map(([, ...m]) => {
        // m: rows of [col x, col y, col z, translation]; the stud's own up is -y, drawn 4 units tall from its base.
        const u = [-m[1], -m[5], -m[9]], L = Math.hypot(...u), o = [m[3], m[7], m[11]];
        return { o: o.map((v, k) => v + 4 * u[k] - (4 * u[k]) / L), up: u.map((v) => v / L) };
      });
      for (const [id, P] of saved) if (P?.s) LD.parts[id] = { ...P, s: P.s.filter(([n]) => !TOP.test(n)) };
      LD.cache.clear();
      const triangles = (solo) => {
        const g = buildPart({ id: C.id, c: 'red', c2: 'red', x: 0, y: 0, z: 0, r: 0 }, solo), tris = [];
        g.updateMatrixWorld(true);
        g.traverse((o) => {
          if (!o.isMesh) return;
          const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, a = geo.attributes.position, v = new THREE.Vector3();
          for (let i = 0; i < a.count; i += 3) {
            const t = [];
            for (let k = 0; k < 3; k++) { v.fromBufferAttribute(a, i + k).applyMatrix4(o.matrixWorld); t.push([v.x * 20, v.y * 20, v.z * 20]); }
            tris.push(t);
          }
        });
        return tris;
      };
      // All of it for the space it fills; the main piece alone for its grips (a pane or door is only drawn near its place).
      const tris = triangles(false), main = triangles(true);
      for (const [id, P] of saved) if (P) { if (LD.parts[id]) LD.parts[id] = P; }
      LD.cache.clear();
      out[C.id] = { tris, main, studs, w: C.w, d: C.d };
    }
    return out;
  }, TOPSTUD.source);
  await b.close();
  const conn = JSON.parse(fs.readFileSync(path.join(APP, 'library-connect.json'), 'utf8'));
  const report = [];
  for (const [id, { tris, main, studs }] of Object.entries(got)) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const t of tris) for (const q of t) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); }
    // The drawing's own grid (cell 0 at the origin), reaching as far below and to the sides as the part does.
    const kx = Math.floor((mn[0] + 2) / 20), kz = Math.floor((mn[2] + 2) / 20), ky = Math.floor((mn[1] + 1) / 8);
    const up = studs.filter((s) => s.up[1] > 0.9), r = layout(tris, up, mn, mx, 20 * kx, 8 * ky, 20 * kz), rm = layout(main, up, mn, mx, 20 * kx, 8 * ky, 20 * kz);
    if (r.why || rm.why) { report.push(`${id}: ${r.why || rm.why}`); continue; }
    r.holds = rm.holds;
    const m = ([x, z, ...rest]) => [x + kx, z + kz, ...rest];
    conn[id] = { w: got[id].w, d: got[id].d, h: r.h + ky, cells: r.cells.map(([x, z, lo, hi]) => [x + kx, z + kz, lo + ky, hi + ky]),
      studs: r.studs.map(([x, z, y]) => [x + kx, z + kz, y + ky]), holds: r.holds.map(([x, z, y]) => [x + kx, z + kz, y + ky]), o: [0, 0, 0], comp: 1 };
    report.push(`${id}: ${conn[id].cells.length} columns, ${conn[id].studs.length} studs, ${conn[id].holds.length} grips`);
  }
  fs.writeFileSync(path.join(APP, 'library-connect.json'), JSON.stringify(conn));
  console.log(report.join('\n'));
})();

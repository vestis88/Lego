// Draws a small white picture of every piece in app/library.json, which the app tints to any color: app/lib-icons-N.json,
// pieces in order of how many sets use them, ICONS per file (so the common pieces come in the first files).
// Run after tools/library-build.js. Needs Playwright with Chromium and the LDraw cache.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { load } = require('../tests/ldraw-lib.js');
const { walk, pack, packMesh, PRIMS } = require('./ldraw-pack.js');
const ROOT = path.join(__dirname, '..'), APP = path.join(ROOT, 'app'), ICONS = 500;
const lib = JSON.parse(fs.readFileSync(path.join(APP, 'library.json'), 'utf8'));
const keys = Object.keys(lib.parts);
// Raw low-detail shapes, packed one chunk at a time (only for drawing here).
const tmp = path.join(ROOT, 'tests', '.cache', 'library-shapes.json');
function shapesFile(list) {
  const shapes = {};
  for (const [, f] of list) { const t = load(f + '.dat', ['parts/', 'p/']); if (t) shapes[f] = pack(null, walk(t, PRIMS, true), { at: (p) => p, r: 0 }); }
  const prims = {}; for (const [n, W] of Object.entries(PRIMS)) prims[n] = packMesh(W, (p) => p);
  fs.writeFileSync(tmp, JSON.stringify({ names: {}, cat: {}, parts: shapes, _prims: prims }));
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const html = path.join(ROOT, 'tests', 'thumbs-harness.html');
  fs.writeFileSync(html, `<!doctype html><html><head><meta charset=utf8></head><body>${fs.readFileSync(path.join(APP, 'byggboken.html'), 'utf8')}</body></html>`);
  await p.route('**/three.min.js', (r) => r.fulfill({ path: path.join(ROOT, 'tests', '.cache', 'three.min.js'), contentType: 'application/javascript' }));
  await p.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await p.route('http://app.test/**', (r) => { const f = new URL(r.request().url()).pathname.slice(1); r.fulfill({ path: f === 'index.html' ? html : f === 'library-shapes.json' ? tmp : path.join(APP, f) }); });
  await p.goto('http://app.test/index.html'); await p.waitForFunction(() => LD.parts);
  for (const f of fs.readdirSync(APP)) if (/^lib-icons-\d+\.json$/.test(f)) fs.unlinkSync(path.join(APP, f));
  let bytes = 0;
  for (let k = 0; k * ICONS < keys.length; k++) {
    const list = keys.slice(k * ICONS, (k + 1) * ICONS).map((key) => [key, lib.parts[key][0]]);
    shapesFile(list);
    const icons = await p.evaluate(async (list) => {
      SETS.shapes = await fetchJson('library-shapes.json?' + Math.random());
      const out = {};
      for (const [key, file] of list) if (SETS.shapes.parts[file]) out[key] = Snap.shoot(buildPart({ id: file, c: 'white', x: 0, y: 0, z: 0, r: 0 }, true), 80, 80, { pad: 1.0, type: 'image/webp', quality: 0.7 });
      LD.cache.clear(); LD.prims.clear(); SETS.shapes = null;
      return out;
    }, list);
    const json = JSON.stringify(icons); bytes += json.length;
    fs.writeFileSync(path.join(APP, `lib-icons-${k}.json`), json);
    process.stdout.write(`${k + 1} `);
  }
  console.log(`\n${keys.length} pictures, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  await b.close();
})();

// Draws a small picture of every real set with the app's own renderer, into app/sets-thumbs-N.json (one file per chunk).
// Run after tools/omr-build.js. Needs Playwright with Chromium.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), APP = path.join(ROOT, 'app');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const html = path.join(ROOT, 'tests', 'thumbs-harness.html');
  fs.writeFileSync(html, `<!doctype html><html><head><meta charset=utf8></head><body>${fs.readFileSync(path.join(APP, 'byggboken.html'), 'utf8')}</body></html>`);
  await p.route('**/three.min.js', (r) => r.fulfill({ path: path.join(ROOT, 'tests', '.cache', 'three.min.js'), contentType: 'application/javascript' }));
  await p.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await p.route('http://app.test/**', (r) => { const f = new URL(r.request().url()).pathname.slice(1); r.fulfill({ path: f === 'index.html' ? html : path.join(APP, f) }); });
  await p.goto('http://app.test/index.html'); await p.waitForFunction(() => LD.parts);
  const index = JSON.parse(fs.readFileSync(path.join(APP, 'sets-index.json'), 'utf8'));
  const chunks = Math.max(...index.map((e) => e.chunk)) + 1;
  let bytes = 0;
  for (let k = 0; k < chunks; k++) {
    const thumbs = await p.evaluate(async (k) => {
      const [, c] = await Promise.all([loadSetShapes(k), loadChunk(k)]), out = {};
      for (const [key, d] of Object.entries(c)) {
        const root = new THREE.Group();
        setSteps(d).forEach((s) => s.parts.forEach((q) => root.add(buildPart(q))));
        out[key] = Snap.shoot(root, 240, 180, { bg: 0xf4f7fa, pad: 1.05, type: 'image/webp', quality: 0.75 });
      }
      LD.cache.clear();
      return out;
    }, k);
    const json = JSON.stringify(thumbs); bytes += json.length;
    fs.writeFileSync(path.join(APP, `sets-thumbs-${k}.json`), json);
    process.stdout.write(`${k + 1}/${chunks} `);
  }
  console.log(`\n${index.length} pictures, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  await b.close();
})();

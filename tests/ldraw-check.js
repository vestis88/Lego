// Compares every catalog part with its real geometry from LDraw (ldraw-ref.json, made by ldraw-update.js):
// footprint, height and which cells have studs on top. Works offline. Fails on any difference not listed in ACCEPTED.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const S = __dirname;

/** The catalog as the app sees it: size and the cells with studs on top at r=0. */
async function catalog(app = path.join(S, '..', 'app', 'byggboken.html')) {
  fs.writeFileSync(path.join(S, 'ldraw-harness.html'), `<!doctype html><html><head><meta charset=utf8></head><body>${fs.readFileSync(app, 'utf8')}</body></html>`);
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route('**/three.min.js', (r) => r.fulfill({ path: path.join(S, '.cache', 'three.min.js'), contentType: 'application/javascript' }));
  await p.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await p.goto('file://' + path.join(S, 'ldraw-harness.html')); await p.waitForTimeout(500);
  const cat = await p.evaluate(() => Object.values(CAT).map((C) => ({ id: C.id, w: C.w, d: C.d, h: C.h, child: !!C.child, studs: ruleCells(C, C.studs) })));
  await b.close();
  return cat;
}

// Real differences the grid can't express, each checked against a photo or LDraw drawing. F = footprint, H = height, S = studs.
const ACCEPTED = {
  '2540': 'FH: the bar handle sticks out 0.8 studs beside the plate',
  '32028': 'F: the door rail sticks out 0.45 studs beside the plate',
  '4081b': 'FH: the clip sticks out in front of the plate',
  '2926': 'FS: the wheel pins stick out at the ends; the wheel space is reserved separately',
  '4600': 'FS: the wheel pins stick out at the sides; the wheel space is reserved separately',
  '6157': 'FHS: the wide wheel holders stick out and hang below; the wheel space is reserved separately',
  '122c01': 'FHS: the axle and wheels stick out and hang below; the wheel space is reserved separately',
  '3471': 'F: the lowest branches overhang the 4 x 4 area by 0.2 studs',
  '3741': 'FS: the 3 stems spread out; the app reserves a 3 x 3 area for stems and flowers',
  '3742': 'F: comes with the flower stem and is drawn inside its 3 x 3 area',
  '3794': 'S: the single center stud sits between grid positions, so it counts as a smooth top',
  '15573': 'S: the single center stud sits between grid positions, so it counts as a smooth top',
  '87580': 'S: the single center stud sits between grid positions, so it counts as a smooth top',
  '3942c': 'S: the top stud sits between grid positions, so it counts as a smooth top',
  '3811': 'H: a baseplate is half a plate thick; the grid\'s smallest step is 1 plate',
  '3857': 'H: a baseplate is half a plate thick; the grid\'s smallest step is 1 plate',
  '3867': 'H: a baseplate is half a plate thick; the grid\'s smallest step is 1 plate',
  '3853': 'FHS: LDraw draws the 2 end studs as part of the shutter pins; BrickLink photo shows 4 studs',
  '60594': 'HS: LDraw draws the 2 end studs as frame posts; BrickLink photo shows 4 studs',
  '60596': 'HS: LDraw draws the 2 end studs as frame posts; BrickLink photo shows 4 studs',
  '4079': 'S: the 2 studs on the seat sit 2 plates lower than the backrest; the grid only has studs on top',
  '3855': 'FH: comes with window 3853 and is drawn inside it',
  '4133': 'FH: comes with window 4132 and is drawn inside it',
  '4131': 'FH: comes with door frame 4130 and is drawn inside it',
  '60616': 'FH: comes with door frame 60596 and is drawn inside it',
  '60623': 'FH: comes with a door frame and is drawn inside it',
  '60797': 'FH: comes with door frame 30179 and is drawn inside it',
  '2921': 'F: the handle sticks out 0.7 studs in front of the brick',
  '30602': 'F: the lip sticks out 0.4 studs in front',
  '32607': 'F: the 3 leaves spread up to 0.9 studs over the neighbors on one side',
  '4085': 'F: the clip sticks out 0.7 studs in front of the plate',
  '60478': 'FH: the bar handle sticks out 0.8 studs past the end of the plate',
  '4862': 'FH: comes with window 2377 and is drawn inside it',
  '4624c01': 'FH: wheels are sized in millimetres, not studs',
  '6014ac01': 'FH: wheels are sized in millimetres, not studs',
};

function compare(cat, ref) {
  const out = [];
  const rot = ([x, z], r) => (r === 0 ? [x, z] : r === 90 ? [-z, x] : r === 180 ? [-x, -z] : [z, -x]);
  const key = (cells) => cells.map(([x, z]) => `${x},${z}`).sort().join(' ');
  for (const C of cat) {
    const R = ref[C.id];
    if (!R) { out.push({ id: C.id, kinds: 'R', msg: 'not in ldraw-ref.json; run ldraw-update.js' }); continue; }
    const h = (R.max[1] - R.min[1]) / 8;
    // Try the 4 turns; keep the one whose footprint and studs fit best.
    let best = null;
    for (const r of [0, 90, 180, 270]) {
      const a = rot([R.min[0], R.min[2]], r), b = rot([R.max[0], R.max[2]], r);
      const x0 = Math.min(a[0], b[0]), z0 = Math.min(a[1], b[1]);
      const w = Math.abs(a[0] - b[0]) / 20, d = Math.abs(a[1] - b[1]) / 20;
      const studs = key(R.studs.map((s) => rot([s[0], s[2]], r)).map(([x, z]) => [Math.round(((x - x0) / 20 - 0.5) * 4) / 4 + 0, Math.round(((z - z0) / 20 - 0.5) * 4) / 4 + 0]));
      const fit = Math.abs(w - C.w) < 0.3 && Math.abs(d - C.d) < 0.3, same = studs === key(C.studs);
      const score = (fit ? 2 : 0) + (same ? 1 : 0);
      if (!best || score > best.score) best = { score, fit, same, w, d, studs };
    }
    let kinds = '';
    if (!best.fit) kinds += 'F';
    if (Math.abs(h - C.h) >= 0.5) kinds += 'H';
    if (!best.same) kinds += 'S';
    if (kinds) out.push({ id: C.id, kinds, msg: `app ${C.w}x${C.d}x${C.h} plates, studs [${key(C.studs)}]; LDraw ${R.file} "${R.title}" ${best.w.toFixed(2)}x${best.d.toFixed(2)}x${h.toFixed(2)}, studs [${best.studs}]` });
  }
  return out;
}

module.exports = { catalog, compare };

if (require.main === module) {
  (async () => {
    const ref = JSON.parse(fs.readFileSync(path.join(S, 'ldraw-ref.json'), 'utf8'));
    const cat = await catalog(process.argv[2]);
    const diffs = compare(cat, ref);
    // An accepted part may only differ in the ways its reason names.
    const bad = diffs.filter((d) => !ACCEPTED[d.id] || [...d.kinds].some((k) => !ACCEPTED[d.id].split(':')[0].includes(k)));
    const unused = Object.keys(ACCEPTED).filter((id) => !diffs.some((d) => d.id === id));
    if (unused.length) console.log('LDraw: accepted exceptions that now match exactly (remove them): ' + unused.join(', '));
    console.log(bad.length ? 'LDRAW DEVIATIONS:\n' + bad.map((d) => `${d.id} [${d.kinds}] ${d.msg}`).join('\n')
      : `ldraw ok: ${cat.length - diffs.length} of ${cat.length} parts match LDraw exactly, ${diffs.length} accepted differences`);
    if (bad.length || unused.length) process.exitCode = 1;
  })();
}

const { chromium } = require('playwright');
const fs = require('fs');
const S = process.argv[2];
// Audits the app file given as the second argument (default: the app in this repo).
const APP = process.argv[3] || S + '/../app/byggboken.html';
const page = `<!doctype html><html><head><meta charset=utf8></head><body>${fs.readFileSync(APP, 'utf8')}</body></html>`;
fs.writeFileSync(S + '/audit-harness.html', page);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route('**/three.min.js', r => r.fulfill({ path: S + '/.cache/three.min.js', contentType: 'application/javascript' }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort());
  await p.goto('file://' + S + '/audit-harness.html'); await p.waitForTimeout(500);
  // Real sizes measured by BrickLink (cm, studs included) for every part whose name does not give its height.
  // A part missing here fails the audit: look it up before adding it. "unverified" entries are reported, never silent.
  const REAL_SIZE = {
    "3829c01": { cm: [0.8, 1.6, 1.84], src: "BrickLink 3829c01: Stud Dim. 0.8 x 1.6 x 1.84 cm" },
    "4079": { cm: [1.6, 1.92, 1.8], src: "BrickLink 4079: 1.6 x 1.92 x 1.8 cm; ToyPro: Seat 2 x 2 x 2" },
    "3403c01": { cm: [3.2, 3.2, 1.15], src: "BrickLink 3403c01: 4 x 4 x 1 studs, 3.2 x 3.2 x 1.15 cm" },
    "3741": { unverified: "no measured height found; drawn about 2 bricks tall" },
  };
  // Parts compared side by side with a photo of the real part (source in brackets). Everything else is listed as not photo-checked.
  const PHOTO_CHECKED = {
    "3829c01": "family photo 2026-10-24", "3403c01": "family photo", "122c01": "family photo", "2412b": "family photo",
    "4070": "family photo", "3853": "family photo", "4032": "family photo", "2432": "family photo", "4460": "family photo",
  };
  const out = await p.evaluate(([REAL_SIZE, PHOTO_CHECKED]) => {
    const res = [];
    // A directional part one stud deep faces across its long side (windows, panels, grille bricks, the steering stand).
    const facesAlongLength = ["slope", "inv", "curve", "screen", "holder", "convex", "concave", "cutcorner", "quarter"];
    for (const C of Object.values(CAT)) {
      if (C.dir && !facesAlongLength.includes(C.shape) && C.d > C.w) res.push(`${C.id} (${C.en}): faces along its long side (w${C.w} d${C.d}); real 1-deep parts face across it`);
    }
    const notPhoto = Object.values(CAT).filter((C) => !C.child && !PHOTO_CHECKED[C.id]).map((C) => C.id);
    res.push(`PHOTO-CHECK: ${Object.keys(PHOTO_CHECKED).length} parts compared with a real photo; not yet: ${notPhoto.length} (${notPhoto.slice(0, 12).join(", ")}${notPhoto.length > 12 ? ", ..." : ""})`);
    // Names that fix the height: plates, tiles and baseplates are 1 plate; bricks, plain slopes, arches and cones 1 x 1 are 1 brick; a third number is the height in bricks.
    const heightFromName = (n) => /^(Brick|Plate|Tile|Baseplate|Technic Brick|Technic Plate|Slope|Arch|Cone 1 x 1|Wedge Plate|Antenna)/.test(n) || / x \d+(?: \d\/\d)? x (\d|\d\/\d)/.test(n);
    for (const C of Object.values(CAT)) {
      if (C.child || heightFromName(C.en)) continue;
      const R = REAL_SIZE[C.id];
      if (!R) { res.push(`${C.id} (${C.en}): height not verified; add its BrickLink size to REAL_SIZE`); continue; }
      if (R.unverified) { res.push(`${C.id}: UNVERIFIED height (${R.unverified})`); continue; }
      const [a, b, hcm] = R.cm, realH = hcm * 10;
      const box3 = new THREE.Box3().setFromObject(buildPart({ id: C.id, c: "red", x: 0, y: 0, z: 0, r: 0 }));
      const drawnH = box3.max.y * 8; // stud units to mm
      if (Math.abs(drawnH - realH) > 1.6) res.push(`${C.id} (${C.en}): drawn ${drawnH.toFixed(1)} mm tall, real ${realH} mm (${R.src})`);
      const studs = C.studs !== "none" ? 1.7 : 0;
      if (Math.abs(C.h * 3.2 - (realH - studs)) > 1.6) res.push(`${C.id}: catalog height ${C.h} plates = ${(C.h * 3.2).toFixed(1)} mm, real ${(realH - studs).toFixed(1)} mm without studs (${R.src})`);
      const real = [a, b].map((x) => x * 10 / 8).sort((x, y) => x - y), mine = [C.w, C.d].sort((x, y) => x - y);
      if (real.some((x, i) => Math.abs(x - mine[i]) > 0.45)) res.push(`${C.id}: footprint ${mine.join("x")} studs, real ${real.map((x) => x.toFixed(2)).join("x")} (${R.src})`);
    }
    const frac = (t) => t.includes('/') ? (t.includes(' ') ? Number(t.split(' ')[0]) + eval(t.split(' ')[1]) : eval(t)) : Number(t);
    for (const C of Object.values(CAT)) {
      const m = C.en.match(/(\d+(?: \d\/\d)?|\d\/\d) x (\d+)(?: x (\d+ \d\/\d|\d\/\d|\d+))?/);
      if (!m) { res.push(`${C.id}: no size in name "${C.en}"`); continue; }
      const a = Number(m[1]), bb = Number(m[2]), c = m[3] != null ? frac(m[3]) : null;
      const issues = [];
      const name = C.en;
      // Naming conventions: slopes/curves are "along x across (x tall)"; windows, doors, windscreens and panels are "depth x width x height in bricks".
      let expW, expD, expH = null;
      if (/^Slope|Curved/.test(name)) { expD = a; expW = bb; if (c != null) expH = Math.round(c * 3); }
      else if (/^(Window|Door Frame|Door |Windscreen|Panel|Glass|Pane)/.test(name)) { expD = a; expW = bb; if (c != null) expH = Math.round(c * 3); }
      else if (/^Arch/.test(name)) { expD = a; expW = bb; expH = c != null ? c * 3 : 3; }
      else if (/^Antenna/.test(name)) { expW = 1; expD = 1; expH = bb * 3; }
      else if (/^(Plant Tree|Cone)/.test(name)) { expW = a; expD = bb; if (c != null) expH = Math.round(c * 3); }
      else { expW = Math.min(a, bb); expD = Math.max(a, bb); if (c != null) expH = Math.round(c * 3); }
      const dims = [C.w, C.d].sort((x, y) => x - y).join('x'), exp = [expW, expD].sort((x, y) => x - y).join('x');
      if (dims !== exp) issues.push(`footprint ${C.w}x${C.d} vs name ${expW}x${expD}`);
      else if (/^Slope|Curved|Window|Door|Windscreen|Panel/.test(name) && (C.w !== expW || C.d !== expD)) issues.push(`orientation w${C.w} d${C.d} but name implies w${expW} d${expD}`);
      if (expH != null && expH !== C.h) issues.push(`height ${C.h} plates vs name ${expH}`);
      if (expH == null) {
        const H = /^Plate|^Tile|^Baseplate/.test(name) ? 1 : /^Brick|^Technic Brick/.test(name) ? 3 : null;
        if (H != null && C.h !== H) issues.push(`height ${C.h} vs ${H}`);
      }
      if (/^Tile/.test(name) && C.studs !== 'none') issues.push('tile with studs');
      const holes = name.match(/(\d+) Holes/); if (holes && Number(holes[1]) !== C.d - 1) issues.push(`holes ${C.d - 1} vs ${holes[1]}`);
      // size label shown to the child should read like the real part name
      const label = C.size; const realLabel = c != null ? `${a}×${bb}×${m[3]}` : `${a}×${bb}`;
      if (label && label.replace(/ \d\/\d/, '') !== realLabel.replace(/ \d\/\d/, '') && label !== `${bb}×${a}` ) issues.push(`label "${label}" vs real "${realLabel}"`);
      else if (label && /^Slope|Curved/.test(name) && label === `${bb}×${a}` && a !== bb) issues.push(`label "${label}" reversed vs real "${realLabel}"`);
      if (issues.length) res.push(`${C.id} (${name}): ${issues.join('; ')}`);
    }
    return res;
  }, [REAL_SIZE, PHOTO_CHECKED]);
  // Accepted on purpose; every other line fails the audit.
  const ACCEPTED = {
    '4133': 'the pane is named after its 2 x 4 x 3 window; the pane itself is thin',
    '4624c01': 'wheels are sized in millimetres, not studs',
    '6014ac01': 'wheels are sized in millimetres, not studs',
    '11477': 'the 2/3 height is left out of the label for the child',
    '85984': 'the 2/3 height is left out of the label for the child',
  };
  const warn = out.filter((l) => l.includes("UNVERIFIED") || l.startsWith("PHOTO-CHECK"));
  if (warn.length) console.log("WARNINGS (not yet verified against a real measurement):\n" + warn.join("\n"));
  const bad = out.filter((l) => !l.includes("UNVERIFIED") && !l.startsWith("PHOTO-CHECK") && !ACCEPTED[l.split(/[ :]/)[0]]);
  console.log(bad.length ? 'DEVIATIONS:\n' + bad.join('\n') : `audit ok (${Object.keys(ACCEPTED).length} accepted exceptions)`);
  if (bad.length) process.exitCode = 1;
  await b.close();
})();

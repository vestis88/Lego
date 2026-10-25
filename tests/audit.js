const { chromium } = require('playwright');
const S = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route('**/three.min.js', r => r.fulfill({ path: S + '/.cache/three.min.js', contentType: 'application/javascript' }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort());
  await p.goto('file://' + S + '/harness.html'); await p.waitForTimeout(500);
  const out = await p.evaluate(() => {
    const res = [];
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
  });
  // Accepted on purpose; every other line fails the audit.
  const ACCEPTED = {
    '4133': 'the pane is named after its 2 x 4 x 3 window; the pane itself is thin',
    '4624c01': 'wheels are sized in millimetres, not studs',
    '6014ac01': 'wheels are sized in millimetres, not studs',
    '11477': 'the 2/3 height is left out of the label for the child',
    '85984': 'the 2/3 height is left out of the label for the child',
  };
  const bad = out.filter((l) => !ACCEPTED[l.split(/[ :]/)[0]]);
  console.log(bad.length ? 'DEVIATIONS:\n' + bad.join('\n') : `audit ok (${Object.keys(ACCEPTED).length} accepted exceptions)`);
  if (bad.length) process.exitCode = 1;
  await b.close();
})();

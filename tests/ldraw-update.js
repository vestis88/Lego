// Re-measures every catalog part from the LDraw library (needs internet) and writes ldraw-ref.json.
// Run it after adding a part, then run run.sh: ldraw-check.js compares the app with this file.
const fs = require('fs'), path = require('path');
const { find, measure } = require('./ldraw-lib.js');
const { catalog } = require('./ldraw-check.js');
// Parts whose LDraw file has another name than the design ID.
const FILE = { '60797': '60797c01' };
(async () => {
  const ref = {};
  for (const C of await catalog()) {
    const f = find(FILE[C.id] || C.id);
    if (!f) { console.log(C.id, 'not found in LDraw'); continue; }
    const m = measure(f.text), r = (v) => Math.round(v * 10) / 10;
    ref[C.id] = { file: f.file, title: f.title, min: m.min.map(r), max: m.max.map(r), studs: m.studs.map((p) => p.map(r)) };
    console.log(C.id.padEnd(9), f.file.padEnd(10), f.title);
  }
  fs.writeFileSync(path.join(__dirname, 'ldraw-ref.json'), JSON.stringify(ref, null, 0).replace(/\},"/g, '},\n"') + '\n');
})();

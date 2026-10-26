// Builds app/rb-index.json from Rebrickable's free database downloads (https://rebrickable.com/downloads/): the parts list
// of every official LEGO set, so "Vilka set kan jag bygga?" can look through all of them, not only the sets with steps.
// Usage: node tools/rb-build.js   (downloads about 17 MB into tests/.cache/rb the first time)
const fs = require('fs'), path = require('path'), zlib = require('zlib'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), APP = path.join(ROOT, 'app'), CACHE = path.join(ROOT, 'tests', '.cache', 'rb');
// Themes left out: not System bricks, or not sets one builds.
const SKIP = /^(Technic|Duplo|Bionicle|Gear|Books|Collectible Minifigures|Key Chains|Magnets|Mindstorms|Znap|Primo|Baby|Quatro|Clikits|Scala|Belville|Fabuland Bulk|Service Packs|Bulk Bricks|Supplemental|Dimensions|Power Functions|Educational and Dacta|HO 1:87 Vehicles|Galidor|Jack Stone|4 Juniors|Explore|Promotional|Dots|Vidiyo|Brick Sketches|Mosaic|Art)$/;

/** Calls fn(row) for every row of a table, without keeping them (inventory_parts has 1.5 million rows). */
const rows = (name, fn) => table(name, fn);
const table = (name, fn) => {
  const f = path.join(CACHE, name + '.csv.gz');
  if (!fs.existsSync(f)) { fs.mkdirSync(CACHE, { recursive: true }); execFileSync('curl', ['-sSf', '-o', f, `https://cdn.rebrickable.com/media/downloads/${name}.csv.gz`]); }
  const lines = zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split(/\r?\n/).filter(Boolean);
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const head = split(lines[0]), out = [];
  for (let i = 1; i < lines.length; i++) {
    const v = split(lines[i]), row = {};
    for (let k = 0; k < head.length; k++) row[head[k]] = v[k];
    if (fn) fn(row); else out.push(row);
  }
  return out;
};

// Catalog ids by normalized part number (as in tools/omr-build.js), and the app's colors.
const html = fs.readFileSync(path.join(APP, 'byggboken.html'), 'utf8');
const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'ldraw-ref.json'), 'utf8'));
const norm = (f) => f.toLowerCase().replace(/\.dat$/, '').replace(/(pr?[0-9]{2,}[a-z0-9]*|pat[0-9]+)$/, '').replace(/([0-9])[a-d]$/, '$1');
const childIds = new Set([...html.matchAll(/def\("([^"]+)",[^\n]*child: true/g)].map((m) => m[1]));
const CATALOG = {};
for (const [id, r] of Object.entries(ref)) if (!childIds.has(id)) { CATALOG[norm(id)] = id; CATALOG[norm(r.file)] = id; }
// Newer molds of catalog pieces count as that piece.
for (const [a, id] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'part-aliases.json'), 'utf8')))) if (ref[id]) CATALOG[norm(a)] = id;
const COMES_WITH = new Set(['4624', '3641', '6014', '6015', '4862', '3742', '3855', '4133', '4131', '60616', '60623', '60797', '60601', '60602', '60603', '73312', '4181', '4182', '4183', '73194']);
const appColors = [...html.matchAll(/^\s+(\w+):\s+\{ hex: 0x([0-9a-f]{6}),.*?(alpha: ([0-9.]+))?\s*\},?$/gm)]
  .map((m) => ({ name: m[1], rgb: [0, 2, 4].map((i) => parseInt(m[2].slice(i, i + 2), 16)), trans: !!m[3] }));
const colorOf = {};
for (const c of table('colors')) {
  const rgb = [0, 2, 4].map((i) => parseInt(c.rgb.slice(i, i + 2), 16)), trans = c.is_trans === 'True';
  let best = 'lightgray', bd = Infinity;
  for (const a of appColors) { if (a.trans !== trans) continue; const d = a.rgb.reduce((s, v, i) => s + (v - rgb[i]) ** 2, 0); if (d < bd) { bd = d; best = a.name; } }
  colorOf[c.id] = best;
}

// Theme of a set: its top theme's name.
const themes = Object.fromEntries(table('themes').map((t) => [t.id, t]));
const rootTheme = (id) => { let t = themes[id]; while (t?.parent_id) t = themes[t.parent_id]; return t?.name || ''; };
// The first version of each set's inventory, its parts (spares left out) and its minifigures.
const inv = {};
for (const i of table('inventories')) if (!inv[i.set_num] || Number(i.version) < Number(inv[i.set_num].version)) inv[i.set_num] = i;
const invSet = Object.fromEntries(Object.values(inv).map((i) => [i.id, i.set_num]));
const parts = {}, figs = {};
rows('inventory_parts', (p) => { if (invSet[p.inventory_id] && p.is_spare !== 'True') (parts[invSet[p.inventory_id]] ||= []).push([p.part_num, p.color_id, Number(p.quantity)]); });
for (const m of table('inventory_minifigs')) if (invSet[m.inventory_id]) figs[invSet[m.inventory_id]] = (figs[invSet[m.inventory_id]] || 0) + Number(m.quantity);

const MIN_COVER = Number(process.env.MIN_COVER || 0.6);
const out = [], ids = [], colors = [], ixMap = new Map();
const ix = (list, v) => { const k = (list === ids ? 'i:' : 'c:') + v; if (!ixMap.has(k)) { ixMap.set(k, list.length); list.push(v); } return ixMap.get(k); };
let total = 0;
for (const s of table('sets')) {
  const theme = rootTheme(s.theme_id), list = parts[s.set_num];
  if (!list || SKIP.test(theme)) continue;
  const need = new Map(); let n = 0, other = 0;
  for (const [num, color, q] of list) {
    const k = norm(num);
    if (COMES_WITH.has(k)) continue;
    n += q;
    const cat = CATALOG[k];
    if (cat) { const key = cat + ':' + colorOf[color]; need.set(key, (need.get(key) || 0) + q); } else other += q;
  }
  if (n < 10 || n > 1500) continue;
  total++;
  // Only sets the catalog covers well enough to be worth suggesting.
  if (other / n > 1 - MIN_COVER) continue;
  // Pieces as a flat list of numbers: catalog piece (index into ids), color (index into colors), count.
  const flat = [];
  for (const [k, q] of need) { const [id, c] = k.split(':'); flat.push(ix(ids, id), ix(colors, c), q); }
  out.push([s.set_num, s.name, Number(s.year), theme, n, figs[s.set_num] || 0, other, flat, s.img_url.replace('https://cdn.rebrickable.com/media/sets/', '')]);
}
fs.writeFileSync(path.join(APP, 'rb-index.json'), JSON.stringify({ ids, colors, sets: out }));
console.log(`${total} System sets of 10-1500 pieces; ${out.length} are at least ${MIN_COVER * 100}% catalog pieces; rb-index.json ${(fs.statSync(path.join(APP, 'rb-index.json')).size / 1024 / 1024).toFixed(1)} MB`);

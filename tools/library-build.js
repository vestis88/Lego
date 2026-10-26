// Builds app/library.json: one library of every real piece the app knows, all drawn from LDraw CAD models.
// It holds the catalog pieces (the ones the builder can connect on its stud grid), every part of the step-by-step sets
// (LDraw OMR) and every part used in at least MIN_SETS official System sets (Rebrickable's parts lists).
// Usage: node tools/library-build.js   (after tools/omr-build.js; needs tests/.cache/rb and the LDraw cache)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { find, load, measure } = require('../tests/ldraw-lib.js');
const ROOT = path.join(__dirname, '..'), APP = path.join(ROOT, 'app'), RB = path.join(ROOT, 'tests', '.cache', 'rb');
const MIN_SETS = 3;
const SKIP_THEMES = /^(Technic|Duplo|Bionicle|Gear|Books|Collectible Minifigures|Key Chains|Magnets|Mindstorms|Znap|Primo|Baby|Quatro|Clikits|Scala|Belville|Service Packs|Bulk Bricks|Supplemental|Dimensions|Power Functions|Educational and Dacta|Galidor|Jack Stone|4 Juniors|Explore|Promotional|Dots|Vidiyo|Brick Sketches|Mosaic|Art)$/;
const SKIP_CATS = /^(Stickers|Non-LEGO|Non-System Parts|Duplo|Pen & Watch|Magnets and Holders|Electronics|Clikits|Znap|Belville|Minidoll|HO Scale)/;

const rows = (name, fn) => {
  const lines = zlib.gunzipSync(fs.readFileSync(path.join(RB, name + '.csv.gz'))).toString('utf8').split(/\r?\n/).filter(Boolean);
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  for (let i = 1; i < lines.length; i++) fn(split(lines[i]));
};

/* ------------------------------------------------- Rebrickable: parts */
const cats = {}; rows('part_categories', ([id, name]) => { cats[id] = name; });
const rbParts = {}; rows('parts', ([num, name, cat]) => { rbParts[num] = { name, cat: cats[cat] || '' }; });
const themes = {}; rows('themes', ([id, name, parent]) => { themes[id] = { name, parent }; });
const rootTheme = (id) => { let t = themes[id]; while (t?.parent) t = themes[t.parent]; return t?.name || ''; };
const okSets = new Set(); rows('sets', ([num, , , th, n]) => { if (!SKIP_THEMES.test(rootTheme(th)) && +n >= 10 && +n <= 1500) okSets.add(num); });
const inv = {}; rows('inventories', ([id, v, set]) => { if (okSets.has(set) && (!inv[set] || +v < inv[set][1])) inv[set] = [id, +v]; });
const invOk = new Set(Object.values(inv).map((x) => x[0]));
// Prints count as their plain part; molds and alternates of one piece are one piece.
const parent = {};
rows('part_relationships', ([type, child, par]) => { if (type === 'P') parent[child] = par; });
const plain = (n) => { for (let i = 0; i < 4 && parent[n]; i++) n = parent[n]; return n; };
const same = {};
rows('part_relationships', ([type, a, b]) => { if (type === 'M' || type === 'A') { (same[a] ||= new Set()).add(b); (same[b] ||= new Set()).add(a); } });
const setsUsing = new Map();
rows('inventory_parts', ([iid, num, , , spare]) => { if (invOk.has(iid) && spare !== 'True') { const k = plain(num); (setsUsing.get(k) || setsUsing.set(k, new Set()).get(k)).add(iid); } });
const pop = (n) => setsUsing.get(n)?.size || 0;

/* ------------------------------------------------------ LDraw lookup */
const resolved = {};
/** The LDraw file for a part number, trying LDraw's own name variants and then the part's other molds. */
function ldraw(num, depth = 0) {
  if (num in resolved) return resolved[num];
  resolved[num] = null;
  let f = load(num + '.dat', ['parts/']) ? num : find(num)?.file || null;
  // A printed or patterned variant without its own model is drawn as the plain part.
  const base = num.replace(/(pr|pat)\d+[a-z0-9]*$/, '');
  if (!f && base !== num) f = ldraw(base, depth + 1);
  if (!f && depth < 2) for (const o of same[num] || []) if ((f = ldraw(o, depth + 1))) break;
  // Shortcuts that LDraw has moved point at the new file.
  const t = f && load(f + '.dat', ['parts/']); const moved = t?.split('\n')[0].match(/^0 ~Moved to (\S+)/);
  if (moved) f = moved[1];
  return (resolved[num] = f);
}

/* --------------------------------------------------- the catalog part */
const html = fs.readFileSync(path.join(APP, 'byggboken.html'), 'utf8');
const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'ldraw-ref.json'), 'utf8'));
const aliases = JSON.parse(fs.readFileSync(path.join(__dirname, 'part-aliases.json'), 'utf8'));
const norm = (f) => f.toLowerCase().replace(/\.dat$/, '').replace(/(pr?[0-9]{2,}[a-z0-9]*|pat[0-9]+)$/, '').replace(/([0-9])[a-d]$/, '$1');
const catalogOf = {};
for (const [id, r] of Object.entries(ref)) { catalogOf[norm(id)] = id; catalogOf[norm(r.file)] = id; }
for (const [a, id] of Object.entries(aliases)) if (ref[id]) catalogOf[norm(a)] = id;
const svOf = {}; // Swedish names the app's catalog already has are built in the app; library names are for the others.

/* ---------------------------------------------------- Swedish names */
// Leading words of a part name, longest first, in Swedish; the size and a few features follow.
const NOUNS = [
  ['minifig torso', 'Minifigur, kropp'], ['minifig legs', 'Minifigur, ben'], ['minifig hips', 'Minifigur, höfter'], ['minifig head', 'Minifigur, huvud'], ['minifig hand', 'Minifigur, hand'],
  ['minifig arm', 'Minifigur, arm'], ['minifig leg', 'Minifigur, ben'], ['minifig hair', 'Minifigur, hår'], ['minifig helmet', 'Minifigur, hjälm'], ['minifig cap', 'Minifigur, keps'],
  ['minifig hat', 'Minifigur, hatt'], ['minifig', 'Minifigur, tillbehör'],
  ['brick round', 'Rund kloss'], ['brick curved', 'Böjd kloss'], ['brick sloped', 'Taklutning'], ['brick arch', 'Valv'], ['brick wedged', 'Kilkloss'], ['brick special', 'Specialkloss'], ['brick', 'Kloss'],
  ['wedge plate', 'Kilplatta'], ['plate round', 'Rund platta'], ['plate special', 'Specialplatta'], ['plate', 'Platta'], ['baseplate', 'Basplatta'],
  ['tile round', 'Rund slät platta'], ['tile special', 'Slät specialplatta'], ['tile', 'Slät platta'],
  ['slope', 'Taklutning'], ['wedge', 'Kil'], ['hinge plate', 'Gångjärnsplatta'], ['hinge brick', 'Gångjärnskloss'], ['hinge', 'Gångjärn'], ['bracket', 'Vinkelplatta'],
  ['bar holder', 'Stånghållare'], ['bar', 'Stång'], ['panel', 'Vägg'], ['window', 'Fönster'], ['glass', 'Glas'], ['door', 'Dörr'], ['windscreen', 'Vindruta'], ['shutter', 'Fönsterlucka'],
  ['wheel', 'Hjul'], ['tyre', 'Däck'], ['tire', 'Däck'], ['car mudguard', 'Stänkskärm'], ['mudguard', 'Stänkskärm'], ['vehicle', 'Fordonsdel'], ['car', 'Bildel'],
  ['plant', 'Växt'], ['flower', 'Blomma'], ['animal', 'Djur'], ['rock', 'Sten'], ['cone', 'Kon'], ['dish', 'Parabol'], ['cylinder', 'Cylinder'], ['container', 'Behållare'],
  ['fence', 'Staket'], ['ladder', 'Stege'], ['flag', 'Flagga'], ['support', 'Stöd'], ['antenna', 'Antenn'], ['technic', 'Teknikbit'], ['hose', 'Slang'], ['string', 'Snöre'],
  ['boat', 'Båtdel'], ['train', 'Tågdel'], ['arch', 'Valv'], ['turntable', 'Vridskiva'], ['steering', 'Ratt'], ['seat', 'Stol'], ['chair', 'Stol'], ['box', 'Låda'], ['crate', 'Låda'],
  ['wing', 'Vinge'], ['propeller', 'Propeller'], ['tail', 'Stjärt'], ['magnet', 'Magnet'], ['tap', 'Kran'], ['lamp', 'Lampa'], ['torch', 'Fackla'], ['sword', 'Svärd'], ['shield', 'Sköld'],
];
const FEATURES = [[/with handle/, ' med handtag'], [/with clip/, ' med klämma'], [/with (pin |axle )?holes?/, ' med hål'], [/with (side )?studs? on (\w+ )?sides?/, ' med sidoknoppar'],
  [/inverted/, ', omvänd'], [/double/, ', dubbel'], [/corner/, ', hörn'], [/with bar/, ' med stång'], [/with pins?(?! hole)/, ' med tapp'], [/grille/, ' med galler'], [/with axles?(?! hole)/, ' med axel'], [/curved/, ', böjd'],
  [/wheel (clips?|holders?)/, ' med hjulfäste'], [/with towball/, ' med dragkrok'], [/with rail/, ' med räcke'], [/with arch/, ' med valv'], [/with groove/, ' med skåra']];
// Words that say nothing about the shape; any other word left untranslated makes the piece a "special" one, so it
// never gets the same Swedish name as the plain piece (a 2×2 plate with wheel clips is not "Platta 2×2").
const FILLER = /\b(with|and|on|of|the|a|in|to|for|top|bottom|side|sides|end|ends|1|2|3|4|stud|studs|x|type|old|new|thin|thick|reinforced|underside|hollow|solid|open|closed|short|long|left|right|center|centre|single|plain|standard|modified|special|[0-9./]+l?)\b/g;
function swedish(name) {
  const n = name.toLowerCase().replace(/[\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  const hit = NOUNS.find(([en]) => new RegExp(`^${en}\\b`).test(n));
  if (!hit) return null;
  const dims = n.match(/(\d+(?:\.\d+)?(?: \d\/\d)?) x (\d+(?:\.\d+)?(?: \d\/\d)?)(?: x (\d+(?:\.\d+)?(?: \d\/\d)?))?/);
  let out = hit[1] + (dims ? ' ' + dims.slice(1).filter(Boolean).join('×') : '');
  let rest = n.slice(hit[0].length).replace(dims?.[0] || '', ' ');
  for (const [re, sv] of FEATURES) if (re.test(n)) { rest = rest.replace(re, ' '); if (!hit[1].toLowerCase().includes(sv.replace(/[ ,]/g, '').slice(0, 5))) out += sv; }
  const unsaid = /[a-z]{3,}/.test(rest.replace(/[^a-z0-9./ ]/g, ' ').replace(FILLER, ' '));
  // A catch-all word ("Djur", "Teknikbit") with more to say is left to the English name, which says what it is.
  if (unsaid && /^(Teknikbit|Djur|Växt|Tågdel|Fordonsdel|Bildel|Båtdel|Minifigur, tillbehör)$/.test(hit[1])) return null;
  if (unsaid && !/special/i.test(hit[1]) && !/,/.test(hit[1]))
    out = hit[1].replace(/(^|\s)(\S+)$/, (_, sp, w) => sp ? ' special' + w : 'Special' + w.toLowerCase()) + out.slice(hit[1].length);
  return out;
}

/* -------------------------------------------------------- collect */
const lib = new Map(); // key -> entry
const alias = {};      // any part number or LDraw file -> key
const groupOf = (cat, title) => {
  const c = cat || title;
  if (/Minifig/i.test(c)) return 'figure';
  if (/Technic|Pneumatic|Gear Parts|Mechanical/i.test(c)) return 'technic';
  if (/Wheels|Tyre|Transportation|Windscreens|Vehicle|Car /i.test(c)) return 'vehicle';
  if (/Windows and Doors|Window|Door|Glass/i.test(c)) return 'window';
  if (/Plants|Animal|Rock/i.test(c)) return 'nature';
  if (/Bricks Sloped|Bricks Curved|Slope/i.test(c)) return 'slope';
  if (/Round and Cones|Dishes|Cone|Dish/i.test(c)) return 'round';
  if (/Tiles|Tile/i.test(c)) return 'tile';
  if (/Plates|Baseplate|Plate/i.test(c)) return 'plate';
  if (/Bricks|Brick/i.test(c)) return 'brick';
  return 'special';
};
function add(file, nums, popularity) {
  const key = catalogOf[norm(file)] || file;
  let e = lib.get(key);
  if (!e) {
    const text = load(file + '.dat', ['parts/']);
    if (!text) return;
    const title = text.split('\n')[0].replace(/^0\s*[~=_]?/, '').replace(/\s+/g, ' ').trim();
    if (/^(Sticker|Moved to)/i.test(title)) return;
    const m = measure(text), r1 = (v) => Math.round(v * 10) / 10;
    const rbn = nums.find((n) => rbParts[n]) || null;
    e = { key, file, en: rbParts[rbn]?.name || title, cat: rbParts[rbn]?.cat || '', size: [r1((m.max[0] - m.min[0]) / 20), r1((m.max[2] - m.min[2]) / 20), r1((m.max[1] - m.min[1]) / 8)], pop: 0 };
    e.group = groupOf(e.cat, title);
    e.figure = /^Minifig/i.test(title) || /^Minifig/.test(e.cat);
    lib.set(key, e);
  }
  e.pop = Math.max(e.pop, popularity);
  for (const n of [file, ...nums]) alias[n.toLowerCase()] = key;
}
// 1. The catalog.
for (const [id, r] of Object.entries(ref)) add(r.file, [id, ...Object.keys(aliases).filter((a) => aliases[a] === id)], pop(id));
// 2. Every part of the step-by-step sets.
for (const f of fs.readdirSync(APP).filter((f) => /^sets-\d+\.json$/.test(f))) for (const d of Object.values(JSON.parse(fs.readFileSync(path.join(APP, f), 'utf8')))) for (const file of d.files) add(file, [], 0);
// 3. Parts used in at least MIN_SETS official System sets.
let unresolved = 0;
const missed = [];
for (const [num, s] of setsUsing) {
  if (s.size < MIN_SETS || SKIP_CATS.test(rbParts[num]?.cat || '')) continue;
  const file = ldraw(num);
  if (file) add(file, [num, ...(same[num] || [])], s.size); else { unresolved++; missed.push([s.size, num, rbParts[num]?.name, rbParts[num]?.cat]); }
}
// The bare number (without a variant letter or print code) points at the same piece when nothing else claims it.
for (const [n, k] of Object.entries({ ...alias })) { const b = norm(n); if (!alias[b]) alias[b] = k; }
// Part numbers of prints point at their plain part's entry.
for (const [child, par] of Object.entries(parent)) { const k = alias[plain(par).toLowerCase()]; if (k && !alias[child.toLowerCase()]) alias[child.toLowerCase()] = k; }

/* -------------------------------------------------------------- write */
const parts = {};
for (const e of [...lib.values()].sort((a, b) => b.pop - a.pop)) {
  const sv = ref[e.key] ? null : swedish(e.en);
  parts[e.key] = [e.file, sv, e.en, e.group, ...e.size, e.pop, (e.figure ? 1 : 0) | (ref[e.key] ? 2 : 0)];
}
fs.writeFileSync(path.join(APP, 'library.json'), JSON.stringify({ fields: ['ldraw', 'sv', 'en', 'group', 'w', 'd', 'h', 'sets', 'flags (1 minifig part, 2 builder can connect it)'], parts, alias }));
const n = Object.keys(parts).length, sv = Object.values(parts).filter((p) => p[1] || p[8] & 2).length;
console.log(`${n} pieces (${Object.values(parts).filter((p) => p[8] & 2).length} the builder can connect, ${Object.values(parts).filter((p) => p[8] & 1).length} minifigure parts); ${sv} with a Swedish name; ${unresolved} part numbers not in LDraw; library.json ${(fs.statSync(path.join(APP, 'library.json')).size / 1024 / 1024).toFixed(1)} MB`);
if (process.env.MISSED) console.log(missed.sort((a, b) => b[0] - a[0]).slice(0, 40).map((m) => m.join(' | ')).join('\n'));

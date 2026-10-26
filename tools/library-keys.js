// The piece library's key for any part number or LDraw file name (see tools/library-build.js), or null for a piece
// the library doesn't have. Used by the set builders so every parts list counts the same pieces as the app.
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'app', 'library.json');
const norm = (f) => f.toLowerCase().replace(/\.dat$/, '').replace(/(pr?[0-9]{2,}[a-z0-9]*|pat[0-9]+)$/, '').replace(/([0-9])[a-d]$/, '$1');
let lib = null;
function keyOf(num) {
  if (!lib) lib = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { parts: {}, alias: {} };
  const n = num.toLowerCase().replace(/\.dat$/, '');
  return lib.alias[n] || (lib.parts[n] ? n : null) || lib.alias[norm(n)] || null;
}
module.exports = { keyOf, norm };

#!/usr/bin/env bash
# Rebuilds all generated app data in order: the sets' steps (their part lists feed the library), the piece library, its
# pictures and how each piece connects, then the sets again (put in an order where every part is held, and counting
# library pieces) and Rebrickable's sets.
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/omr-build.js
node tools/library-build.js
node tools/library-icons.js
node tools/library-connect.js
node tools/composite-connect.js
node tools/omr-build.js
node tools/omr-thumbs.js
node tools/rb-build.js
python3 tools/rb-thumbs.py
python3 tools/rb-instructions.py

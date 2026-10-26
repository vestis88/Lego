#!/usr/bin/env bash
# Rebuilds all generated app data in order: the sets' steps (their part lists feed the library), the piece library and
# its pictures, then the sets again and Rebrickable's sets, so every "what you need" list counts library pieces.
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/omr-build.js
node tools/library-build.js
node tools/library-icons.js
node tools/omr-build.js
node tools/omr-thumbs.js
node tools/rb-build.js

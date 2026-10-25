#!/usr/bin/env bash
# Runs the catalog audit, the unit checks and the end-to-end flow in headless Chromium.
# Needs Node and Playwright with Chromium. Claude is replaced by a stand-in that returns fixed answers.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .cache shots
if [ ! -f .cache/three.min.js ]; then
  (cd .cache && npm pack three@0.128.0 --silent >/dev/null && tar xzf three-0.128.0.tgz && cp package/build/three.min.js . && rm -rf package three-0.128.0.tgz)
fi
node e2e.js "$PWD"
node audit.js "$PWD"
node ldraw-check.js

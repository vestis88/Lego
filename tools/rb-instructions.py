#!/usr/bin/env python3
"""Which official sets without steps in the app have instructions online, so a set's sheet only links where there are
some. LEGO's own site can't be checked from a script (it refuses them), but BrickInstructions (lego.brickinstructions.com)
shows its scanned instruction pages, many of them for old sets LEGO doesn't have. Writes app/rb-instructions.json:
the set numbers (without "-1") BrickInstructions has. Answers are cached in tests/.cache/rb-instr.
Usage: python3 tools/rb-instructions.py"""
import json, os, re, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(__file__), '..')
APP, CACHE = os.path.join(ROOT, 'app'), os.path.join(ROOT, 'tests', '.cache', 'rb-instr')
os.makedirs(CACHE, exist_ok=True)
sets = json.load(open(os.path.join(APP, 'rb-index.json')))['sets']
nums = sorted({s[0].rsplit('-', 1)[0] for s in sets})

def has(num):
    f = os.path.join(CACHE, num)
    if os.path.exists(f): return open(f).read() == '1'
    url = f'https://lego.brickinstructions.com/en/lego_instructions/set/{num}'
    ok = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Byggboken instructions check (family app)'})
            with urllib.request.urlopen(req, timeout=30) as r: page = r.read().decode('utf-8', 'replace')
            ok = bool(re.search(r"/instructions/\d+/[^'\"]+/\w+\.jpg", page))
            break
        except Exception:
            time.sleep(2 + attempt * 3)
    if ok is None: return False  # not cached: asked again next run
    open(f, 'w').write('1' if ok else '0')
    time.sleep(0.2)
    return ok

with ThreadPoolExecutor(8) as pool:
    found = [n for n, ok in zip(nums, pool.map(has, nums)) if ok]
json.dump(found, open(os.path.join(APP, 'rb-instructions.json'), 'w'), separators=(',', ':'))
print(f'{len(found)} of {len(nums)} sets have instructions on BrickInstructions')

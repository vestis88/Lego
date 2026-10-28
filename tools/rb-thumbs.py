#!/usr/bin/env python3
"""Pictures of the official sets without steps (app/rb-index.json): Rebrickable's set photos, shrunk to 240 x 180 WebP
and packed 100 sets to a file (about 600 KB: a phone fetches only the files of the cards it shows), app/rb-thumbs-N.json ({set number: data URL}), in the order of rb-index.json.
The published app can't load images from other sites, so the pictures go with it like sets-thumbs-N.json.
Usage: python3 tools/rb-thumbs.py   (downloads the photos into tests/.cache/rb-img, about 5 GB; delete it afterwards)"""
import base64, io, json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
APP, CACHE = os.path.join(ROOT, 'app'), os.path.join(ROOT, 'tests', '.cache', 'rb-img')
PER, W, H = 100, 240, 180
os.makedirs(CACHE, exist_ok=True)
sets = json.load(open(os.path.join(APP, 'rb-index.json')))['sets']

def photo(img):
    """The cached photo's bytes, downloaded the first time (None if Rebrickable has none)."""
    f = os.path.join(CACHE, img.replace('/', '_'))
    if not os.path.exists(f):
        try:
            with urllib.request.urlopen('https://cdn.rebrickable.com/media/sets/' + img, timeout=30) as r: data = r.read()
        except Exception:
            data = b''
        with open(f, 'wb') as out: out.write(data)
    data = open(f, 'rb').read()
    return data or None

def thumb(entry):
    num, img = entry[0], entry[8]
    data = img and photo(img)
    if not data: return num, None
    try:
        im = Image.open(io.BytesIO(data)).convert('RGB')
    except Exception:
        return num, None
    # The whole model, on white like Rebrickable's photos, in the cards' 4:3 shape.
    im.thumbnail((W, H), Image.LANCZOS)
    card = Image.new('RGB', (W, H), 'white'); card.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
    buf = io.BytesIO(); card.save(buf, 'WEBP', quality=62, method=6)
    return num, 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()

with ThreadPoolExecutor(12) as pool:
    done = list(pool.map(thumb, sets))
for f in os.listdir(APP):
    if f.startswith('rb-thumbs-') and f.endswith('.json'): os.remove(os.path.join(APP, f))
total, missing = 0, 0
for k in range(0, len(done), PER):
    chunk = {num: url for num, url in done[k:k + PER] if url}
    missing += PER - len(chunk) if k + PER <= len(done) else len(done) - k - len(chunk)
    f = os.path.join(APP, f'rb-thumbs-{k // PER}.json')
    json.dump(chunk, open(f, 'w'), separators=(',', ':'))
    total += os.path.getsize(f)
print(f'{len(done) - missing} of {len(done)} sets have a picture; {(len(done) + PER - 1) // PER} files, {total / 1048576:.1f} MB')

# Byggboken

Step-by-step building instructions for bricks, made for a young builder. Everything in the app is in Swedish, with read-aloud.

**Open the app:** https://claude.ai/artifact/TquZzcroNSXEXFG2QkQuPC

The app runs inside Claude (the Claude app on iPhone or iPad, or claude.ai in a browser). Generating instructions uses the signed-in person's Claude subscription. There are no API keys and no API costs.

## What it does

| Feature | How it works |
|---|---|
| **Berätta** (text) | Type or dictate what to build. Claude designs the model brick by brick and the app draws each step in 3D. |
| **Foto** | Photograph a thing (or a finished model) and get a buildable version of it. |
| **Överraska** | One tap for a surprise build. The app picks three random themes and Claude chooses one. |
| **Mina bitar** | Photograph your loose pieces. Claude counts them into a list you can correct with + and −. Builds can then use *only* those pieces, or those pieces plus a few extras. |
| **Hitta bit** | Pick a piece (or tap one in a build step), photograph the pile, and the app circles where it is and reads a hint aloud. |
| **Riktiga set** | Step-by-step instructions for 913 real LEGO sets from 1955 to today (Town, Space, Castle, trains, racers, Creator and more). Search by the number on the box or by name, or browse by theme. |
| **Vilka set kan jag bygga?** | From *Mina bitar*: lists the real sets you have the most pieces for, with how many you have in the right color and in any color. |
| **Svårighet** slider | 1–10, from "like a 3-year-old" (~8 pieces) to "expert" (~140 pieces). The default is "like a 10-year-old" (~90 pieces). |

In the instruction viewer:

- Each step shows a "parts needed" box with a 3D icon and count for each piece.
- New pieces drop into place and glow.
- Drag to rotate and pinch to zoom.
- The speaker button reads each step aloud in Swedish.
- The screen stays awake while building.
- It remembers which step you were on.

## How it is built

- **Two files:** `app/byggboken.html` is the app, published as a claude.ai Artifact. `app/parts.json` holds the real shape of every part, and is published next to it. three.js (r128, from cdnjs) renders the bricks.
- **Real part shapes:** every part is drawn from its CAD model in the [LDraw library](https://library.ldraw.org) (CC BY 4.0), the community library of exact LEGO part models. That includes the outline edges, the studs and the tubes underneath. `tools/ldraw-pack.js` converts them:
  - it turns each part to the app's facing and places it on the stud grid;
  - it packs positions as 16-bit integers;
  - it stores each repeated stud and tube shape once.

  The result is 1.4 MB (about 440 KB compressed) for all 164 parts. A model of 140 parts builds in about 0.3 s.
- **AI:** the Artifact `sample` capability, with images enabled, asks Claude. It runs on the viewer's own Claude account and plan. Generation uses the most capable model for difficulty 4 and up, so big builds can take a minute or two.
- **Real sets:** the instructions come from the [LDraw Official Model Repository](https://library.ldraw.org/omr) (OMR). It has CAD models of real sets, built step by step by LDraw fans and redistributable under CC BY 2.0. Each set's author is shown on its cover. `tools/omr-build.js` turns them into app data:
  - It keeps System sets of 10 to 400 pieces whose parts are all in LDraw: 913 models.
  - It splits them into steps at the models' STEP marks, at most 8 new pieces per step. Sets without STEP marks are built in layers from the bottom up.
  - Printed parts are drawn as the plain part, and LDraw colors become the app's named colors, so read-aloud still works.
  - Pieces that are also in the catalog keep their Swedish names and can be looked for with *Hitta bit*.

  The data is split so a phone only downloads what it opens:

  | File | What it holds | Size |
  |---|---|---|
  | `sets-index.json` | the list, with the catalog pieces each set needs | 0.6 MB |
  | `sets-N.json` | the steps of 25 sets | 5.5 MB in all |
  | `sets-thumbs-N.json` | their pictures, drawn ahead by `tools/omr-thumbs.js` | 3.7 MB in all |
  | `set-parts-common.json` | shapes of the parts 10+ sets use, downloaded once | 4.2 MB |
  | `set-parts-N.json` | the rest of a chunk's parts | 0.1–3.9 MB |

  Set parts use LDraw's low-detail circle primitives.
- **Sync:** the Artifact `db` capability takes the place of Firebase. Saved builds (`builds/<id>`) and the piece list (`inventory/main`) sync to every device signed in to the same Claude account.
- **Real parts only:** Claude may use only parts from the built-in catalog of real LEGO System parts, by design ID (the number molded on the part). The app throws away any other part and asks Claude to fix it.
- **Structure checker:** every model is checked on a stud grid against how the parts really connect. Each part knows which of its cells have studs on top and which accept studs underneath. After Claude answers, the app checks four things:
  - No two parts share space, including the space the wheels need.
  - Every part is held by studs. Smooth tops and the slanted part of a slope hold nothing.
  - After every step, the model is one connected piece.
  - No part has to be squeezed in between pieces already placed above and below it.

  If it finds problems, it sends Claude one automatic repair request. Then a local clean-up always runs: it removes overlapping parts, splits steps with more than 8 parts (bottom-up), and moves loose parts to the step where something holds them.

### Parts catalog

About 190 real System parts, focused on the classic 1990s range (Town, Castle, Space, and the Trees & Flowers packs):

| Group | Parts (design IDs) |
|---|---|
| Bricks | 1×1 to 1×16: 3005, 3004, 3622, 3010, 3009, 3008, 6111, 6112, 2465; 2×2 to 2×10: 3003, 3002, 3001, 2456, 3007, 3006; tall: 3245c (1×2×2), 30145 (2×2×3), 2453, 2454, 3755, 3754 (×5 pillars); 2357 corner; 4070 headlight brick; 2877 grille brick |
| Technic bricks with holes (normal studs) | 3700, 3701, 3894, 3702, 2730, 3895, 32018, 3703 (1×2 to 1×16) |
| Arches | 3659 (1×4), 3455 (1×6), 3307 (1×6×2) |
| Plates | 3024 to 41539 (1×1 to 8×8), plus 60479 1×12, 2445 2×12, 4282 2×16, 3029 4×12, 3028 6×12, 3456 6×14, 3027 6×16, 3026 6×24; 2420 corner; 3709b / 3738 Technic plates with holes; 2540 with handle; 4081b with clip light |
| Baseplates | 3867 16×16, 3857 16×32, 3811 32×32 |
| Tiles | 3070b, 3069b, 63864, 2431, 6636, 4162, 3068b, 87079; 2412b grille |
| Slopes | 45°: 3040, 3039, 3038, 3037; 33°: 4286, 3298, 4161, 3297; 75°: 4460, 3684; inverted: 3665, 3660, 4287, 3747b; 30° cheese: 54200, 85984 |
| Round | 3062b, 4073, 98138, 3941, 4032, 14769; cones 4589, 3942c; antenna 3957 |
| Nature | 3471 pine tree, 3470 fruit tree, 3741 flower stem with 3× 3742 flowers, 33291 flower plate |
| Windows & doors | 2377 1×2×2 plane window, 3853 1×4×3 window + 3855 glass, 4132 2×4×3 window + 4133 pane, 4130 2×4×5 door frame + 4131 door, 30179 1×4×6 door frame + 60623 4-pane door; newer 60592, 60593, 60594, 60596 + 60616 |
| Vehicles | Wheel plates: 4600 + 2× 4624/3641 wheels, 122c01 with small red wheels, 6157 wide holder + 2× 6014/6015 big wheels, 2926 1×4 with a wheel at each end. Also 3829c01 steering wheel stand, 4079 seat, 3823 windscreen, 2450 3×3 cut-corner wedge plate, 2432 tile with handle (bumpers) |
| Special | 3403c01 turntable 4×4 |
| Roofs | 3043 / 3044 ridges, 3045 outside corner, 3046 inside corner, 60481 65° slope |
| More common parts | 3065 brick without bottom tube (transparent windows), 30136 log brick, 30414 brick 1×4 with side studs, 14719 corner tile, 87580 2×2 jumper, 35480 plate with rounded ends, 32028 plate with door rail, 60474 round plate 4×4 |
| From real sets (most used in OMR sets and fitting the grid) | 6091 / 6081 / 6215 curved-top bricks, 50950 / 61678 curved slopes, 4445 slope 2×8, 30363 slope 18° 4×2, 61409 grille slope, 3048 triple slope, 3676 inverted corner, 43722 / 43723 / 41769 / 41770 wedge plates, 2419 plate 3×6 without corners, 91405 / 92438 big plates, 11213 round plate 6×6, 87081 round brick 4×4, 3943 cone 4×4×2, 59900 cone 1×1, 4215 / 87544 / 30413 / 6231 panels, 3633 fence, 3308 / 4490 arches, 98283 masonry brick, 6541 / 32000 Technic bricks, 2921 brick with handle, 4085 plate with clip, 60478 plate with end handle, 4862 glass for window 2377 |
| Most common today | 15573 / 3794 jumper plates, 11212 plate 3×3, 14716 / 22886 bricks ×3 tall, 87087 / 11211 / 4733 bricks with side studs, 11477 / 15068 curved slopes, 25269 quarter-circle tile, 4865 / 4864 panels |

The checker knows each part's special rules:

- Corner pieces leave their fourth cell empty.
- Arches rest only on their two end columns.
- Trees attach with the 2×2 center of their base.
- The turntable has studs on its round top but not the corners.
- Nothing attaches under a baseplate or a wheel plate.
- Pieces that come with another piece (glass, doors, flowers, wheels) are listed separately in the parts list.

The rule for loose parts allows pillars standing side by side on the table before an arch or plate bridges them. Gears, axles, beams and the big Technic wheels are left out until Technic support is added.

**Wheels work like real LEGO.** Every wheel plate clips *under* a chassis with its studs, and its wheels sit on side pins. Each wheel plate reserves its real wheel space, and anything wider than the chassis has to sit above it, like a fender. The prompt also gives Claude a short recipe for vehicles: chassis, wheel plates, seat, steering wheel, windscreen, grille, headlights and taillights.

The wheels are real LDraw wheels mounted on the measured pin tips of each plate. Their size and the space they reserve are computed from those models, and so is the prompt text that tells Claude about them:

| Wheel plate | Wheel space beside it | Wider parts start at |
|---|---|---|
| 4600 | 1 column each side, 2 plates below to 2 above | y+3 |
| 122c01 | 1 column each side, 1 below to 3 above | y+4 |
| 6157 | 2 columns each side, 4 rows long, 2 below to 4 above (its holders rise above the plate) | y+5 |
| 2926 | 1 column at each end, 3 rows, 2 below to 2 above | y+3 |

The 3788 mudguard and the hinged 1×3×1 car doors are not in yet. Their studs sit at two heights, or they attach with a hinge, and the grid engine can't represent that yet.

The home screen has two examples: a small race car (4600 wheels) and a beach buggy (6157 big wheels, seat, steering wheel and windscreen).

### Model format

Coordinates use a stud grid: `x` (right) and `z` (toward the viewer) are in studs, and `y` is in plates (a brick is 3 plates tall). Each part gives its minimum corner and a rotation `r` (0/90/180/270). At `r=0`, directional parts face or slope down toward +z.

```json
{"title": "Liten racerbil", "description": "…", "steps": [
  {"text": "Tryck fast två hjulhållare under plattan.", "parts": [
    {"id": "4600", "x": 1, "y": -1, "z": 0, "r": 0, "c": "black", "c2": "lightgray"}
  ]}
]}
```

`c2` is the wheel hub color on a 4600, or the door color on a 60596. Builds saved in the older format are converted to catalog parts when they load. Technic parts are planned for later.

## Photos from several angles

Counting your pieces (**Mina bitar**), finding a piece (**Hitta bit**) and building from a photo (**Foto**) can each use up to 3 photos of the same subject. That's limited by how many images the viewer's Claude app accepts per request. All photos go to Claude in one request with instructions to:

- treat them as the same pile or object, with nothing moved between photos;
- count every piece only once;
- use the view from above for stud counts and footprints;
- use the angled views to tell plates, tiles and bricks apart by height, read slope profiles and find hidden pieces.

**Why:** a photo straight from above shows the studs but not the height. A 1×4 plate, a 1×4 brick and a 1×4 tile with studs out of view all look alike, and pieces under other pieces are hidden. Research on LEGO recognition describes the same problem: pieces look the same from some angles, and changing the viewpoint resolves it. Apps like Brickit get around it by asking for spread-out pieces.

**Cost:** each extra photo adds roughly the cost of the first one (photos are scaled to about 1.2 megapixels) and a little more waiting. So the app suggests the second photo instead of requiring it. The finder asks for another angle only if the first photo didn't find the piece.

## Tests and catalog audit

Run `tests/run.sh` before publishing. It needs Node and Playwright with Chromium, and it fails on any problem. It runs four checks:

- **Name audit:** compares each part's real name with its size, height, holes and label, and compares parts whose name gives no height with BrickLink's measured size.
- **LDraw check:** compares each part's footprint, height and stud positions with the real part's CAD model from the [LDraw library](https://library.ldraw.org), stored in `tests/ldraw-ref.json`. After adding a part, run `node tests/ldraw-update.js` (needs internet) to measure it.
- **Part geometry:** checks every part in all four rotations: the real shape stays in its space (apart from known bits that stick out, like pins and handles), its real studs sit on the cells the checker gives studs, and wheels stay inside their reserved space.
- **Full flow:** runs the whole app with a stand-in for Claude on simulated iPhone and iPad screens.

`docs/catalog-audit.md` lists the deviations found when every part was compared with the real part, how each was fixed, and the rules for adding parts.

## Updating the app

Edit `app/byggboken.html` (the parts catalog is the `CAT` table near the top of the script), then republish it to the same artifact URL from a Claude Code session, with `app/parts.json` as a supporting file. The HTML file is the page body only: no `<!doctype>`, `<html>` or `<head>` tags, because the publisher adds them.

To add a part:

1. Add it to `CAT`.
2. Run `node tools/ldraw-pack.js <id>` (needs internet the first time) and `node tests/ldraw-update.js`.
3. Check the picture of the new part. The facing it got is saved in `tools/ldraw-turns.json`; fix it in `TURN` in the packer if it's wrong.
4. Run `tests/run.sh`.

To rebuild the real sets (after adding catalog pieces, so *Vilka set kan jag bygga?* counts them): `node tools/omr-build.js && node tools/omr-thumbs.js`. The first run downloads the OMR models (120 MB) into `tests/.cache/omr`. For speed, also unpack LDraw's `complete.zip` and `ldrawunf.zip` into `tests/.cache/ldraw` (file names lowercased, `/` as `__`) and create `tests/.cache/ldraw/.complete`. With that marker the part loader works offline. The generated set files are not in git (they're about 60 MB); publish them with the app as supporting files.

## Known limits

- The parts are exact, but the pictures are still not an official booklet: no part callout arrows or sub-assemblies yet.
- Real sets: printed details (faces, signs, stickers) are drawn as the plain part. Minifigures are built in place like the rest. Part names that aren't in the catalog are LDraw's English names; read-aloud then just says "bit".
- Claude's spatial accuracy drops on very large models. The checker catches loose and overlapping pieces, but it can't judge whether the model looks good.
- Piece counting and the piece finder use still photos, not a live camera, and can miss small or hidden pieces.

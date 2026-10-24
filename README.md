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
| **Svårighet** slider | 1–10, from "like a 3-year-old" (~8 pieces) to "expert" (~140 pieces). The default is "like a 10-year-old" (~90 pieces). |

In the instruction viewer:

- Each step shows a "parts needed" box with a 3D icon and count for each piece.
- New pieces drop into place and glow.
- Drag to rotate and pinch to zoom.
- The speaker button reads each step aloud in Swedish.
- The screen stays awake while building.
- It remembers which step you were on.

## How it is built

- **One file:** `app/byggboken.html`, published as a claude.ai Artifact. three.js (r128, from cdnjs) renders the bricks.
- **AI:** the Artifact `sample` capability, with images enabled, asks Claude. It runs on the viewer's own Claude account and plan. Generation uses the most capable model for difficulty 4 and up, so big builds can take a minute or two.
- **Sync:** the Artifact `db` capability takes the place of Firebase. Saved builds (`builds/<id>`) and the piece list (`inventory/main`) sync to every device signed in to the same Claude account.
- **Real parts only:** Claude may use only parts from the built-in catalog of real LEGO System parts, by design ID (the number molded on the part). The app throws away any other part and asks Claude to fix it.
- **Structure checker:** every model is checked on a stud grid against how the parts really connect. Each part knows which of its cells have studs on top and which accept studs underneath. After Claude answers, the app checks four things:
  - No two parts share space, including the space the wheels need.
  - Every part is held by studs. Smooth tops and the slanted part of a slope hold nothing.
  - After every step, the model is one connected piece.
  - No part has to be squeezed in between pieces already placed above and below it.

  If it finds problems, it sends Claude one automatic repair request. Then a local clean-up always runs: it removes overlapping parts, splits steps with more than 8 parts (bottom-up), and moves loose parts to the step where something holds them.

### Parts catalog

About 120 real System parts, focused on the classic 1990s range (Town, Castle, Space, and the Trees & Flowers packs):

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
| Vehicles | 4600 wheel holder + 2× 4624/3641 wheels, 122c01 plate with small red wheels, 3829c01 steering wheel stand, 3823 windscreen |
| Special | 3403c01 turntable 4×4 |

The checker knows each part's special rules:

- Corner pieces leave their fourth cell empty.
- Arches rest only on their two end columns.
- Trees attach with the 2×2 center of their base.
- The turntable has studs on its round top but not the corners.
- Nothing attaches under a baseplate or a wheel plate.
- Pieces that come with another piece (glass, doors, flowers, wheels) are listed separately in the parts list.

The rule for loose parts allows pillars standing side by side on the table before an arch or plate bridges them. Gears, axles, beams and the big Technic wheels are left out until Technic support is added.

**Wheels work like real LEGO.** The 4600 plate clips *under* a chassis with its studs, and its two wheels snap onto the side pins. The wheels take up real space: one stud column on each side, from 3 plates below the holder to 2 plates above it. Anything wider than the holder has to sit above that space, like a fender.

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

## Updating the app

Edit `app/byggboken.html` (the parts catalog is the `CAT` table near the top of the script), then republish it to the same artifact URL from a Claude Code session. The file is the page body only: no `<!doctype>`, `<html>` or `<head>` tags, because the publisher adds them.

## Known limits

- Pictures look like a building booklet, but not like an official one. Windows, doors and the windscreen are drawn simplified.
- Claude's spatial accuracy drops on very large models. The checker catches loose and overlapping pieces, but it can't judge whether the model looks good.
- Piece counting and the piece finder use still photos, not a live camera, and can miss small or hidden pieces.

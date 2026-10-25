# Parts catalog audit

This compares every part in the catalog with the real LEGO part: its size, height, studs, connections, the shape drawn on screen, the label shown to the child, and the pieces it comes with.

## Deviations found and fixed (2026-10-25)

| # | Part | What was wrong | Fix |
|---|---|---|---|
| 1 | 19 slopes, inverted slopes, curved slopes, cheese slopes and the 3044 ridge | Size labels were reversed. LEGO names slopes *length down the slope × width* ("Slope 45 2 x 3" is 3038), but the app showed "Taklutning 3×2". | Labels now follow LEGO naming: 3040 "2×1", 3038 "2×3", 3298 "3×2", 4460 "2×1×3" and so on. |
| 2 | 122c01 plate with red wheels | Wheels were drawn about 9.6 mm across. Brick Architect lists them as 8 mm. | Wheel radius is 0.5 studs (8 mm), and the hub is smaller. |
| 3 | 30179 door frame (1998) | It came with door 60623 (4 panes). BrickLink lists the 3-pane doors (x39c01, 60797) as the ones that fit 30179. | It now comes with 60797, a door with 3 panes, drawn with 3 panes. |
| 4 | Doors 60616, 60623 and 4131 | Drawn one plate shorter than the real door: 17 plates instead of 18, and 14 instead of 15. | Doors are full height (1×4×6 = 18 plates, 1×4×5 = 15). The door is drawn filling the frame opening. |
| 5 | 3742 flower and 3741 flower stem | The flower is a 2×2 part, but I drew it 1×1, so the stem's flowers sat in a 1×1 space. | The flower is 2×2. The stem stands on the center cell of a 3×3 area, its flowers spread over the top of that area, and only the top three plates of the outer cells count as filled. |
| 6 | 3823 windscreen | Drawn as a solid wedge. The real part is a thin glass shell, hollow behind. | It's now drawn as side walls, a top ledge with the studs, a front lip and a thin slanted pane. |
| 7 | 30136 log brick | Drawn with horizontal grooves. It's a *palisade* brick, with vertical logs. | Vertical half-logs on both long sides. |
| 8 | 4070 headlight brick | The side stud stuck out of the face. On the real brick it sits inside a square recess, flush with the face. | Recessed lamp face with the stud inside. |
| 9 | 2540 plate with bar handle | The handle was hidden inside the plate. It really sticks out beside the plate. | The handle is drawn outside the plate's edge. |
| 10 | All studs | Studs were 1.44 mm tall. Real studs are 1.7 mm. | Studs are 0.21 studs (1.7 mm) tall everywhere. |
| 11 | Technic bricks with holes | Holes were drawn at mid-height. Real Technic brick holes are centered 5.8 mm up. | Holes are 5.8 mm up. |

## Missed by the first audit, found afterwards

| # | Part | What was wrong | Why the audit missed it | Fix |
|---|---|---|---|---|
| 12 | 3829c01 steering stand (pointed out by you) | Built 1 brick (9.6 mm) tall. BrickLink measures it at 0.8 × 1.6 × 1.84 cm, so it's 18.4 mm tall, about 2 bricks. | The name has no height, and the audit only checked heights it could read from a name (plates, tiles, bricks). The geometry tests compared the drawing with my own catalog entry, and both were equally wrong. Nothing compared the part with a real measurement. | 6 plates tall: a smooth 1×2 tile base, a column rising from the front stud and leaning back, and the wheel tilted toward the driver. |
| 13 | 4079 seat | Built 1 brick tall. BrickLink measures it at 1.8 cm, and ToyPro calls it "Seat 2 x 2 x 2". | Same blind spot. Found by the new check. | 6 plates tall with the backrest. |
| 14 | 3403c01 turntable | Built 2 plates tall. BrickLink lists it as 4 × 4 × 1 studs, 1.15 cm tall including studs: 1 brick. | Same blind spot. Found by the new check. | 3 plates tall. |

| 15 | 3829c01 steering stand (pointed out by you, second time) | **Rotated 90° and the wrong shape.** In the real part the 1×2 tile lies *across* the car, a flat grooved column stands straight up from the *middle* of the long side, and a wheel about 11 mm across sits on top, tilted toward the driver, hanging over the space behind. I had the base running along the car, a thin rod on one end stud leaning back, and a small wheel. | I never looked at the real part. I drew it from memory, and every "visual check" compared my render with my own idea of the part. The height check (fix 12) only compared one number. | Base across (w2 × d1), a straight slab column in the middle, a larger tilted wheel, and the space it hangs over counts as filled (only up high). Compared side by side with two steering stands in your photo. |
| 16 | 122c01 plate with red wheels | **My earlier fix 2 was wrong.** I shrank the wheels to 8 mm, but "8 mm D." in Brick Architect's name is the red *hub*. Your photo shows black treaded tires about 15 mm across, on a metal axle a little outside the plate. | I read a measurement without checking which part of the wheel it described, and didn't compare with a photo. | Tires 14.4 mm across on red 8 mm hubs, set slightly outside the plate. Wider parts start 3 plates above the plate. |
| 17 | 2412b grille tile | Slots ran along the tile. On the real tile (your photo) they run across it. | Drawn from memory. | Five bars across the tile. |
| 18 | 4079 seat (follow-up) | The whole 2×2 counted as 2 bricks tall, so a steering wheel couldn't hang over the seat as it does in real cars. | The space a part fills was always its full box. | Only the backrest row is full height; the front row is seat height. |

**Root cause:** whenever a part's name carried no height, I guessed one. Every check then compared my model with my own guess.

**New checks:**

- `tests/audit.js` keeps a `REAL_SIZE` table of BrickLink measurements, with sources, for every part whose name doesn't give its height. A part missing from the table fails the audit, so it has to be looked up before it's added. The audit compares the height of the drawn part and the catalog height with the measurement (within half a plate), and the footprint too. A part that couldn't be verified (today only the 3741 flower stem) is printed as UNVERIFIED on every run instead of passing silently.
- The audit now builds its own test page from the app file, so it can audit any version: `node tests/audit.js tests path/to/byggboken.html`. Run against the version before this fix, it fails on 3829c01, 4079 and 3403c01. Run against the fixed version, it passes.
- `tests/unit.js` also checks that each part's drawing reaches its declared height, not just stays under it.

**After the second 3829c01 report:**

- **Orientation rule (`tests/audit.js`):** a directional part one stud deep must face across its long side, as real windows, panels, grille bricks and the steering stand do. Run against the previous version, it flags the steering stand: "faces along its long side (w1 d2)".
- **Overhang check (`tests/unit.js`):** a drawing may only stick out where the part really fills space (for example the steering wheel above the row behind it). The filled space can now be lower than the part in some rows (the seat's front row) or reach beyond it up high (the steering wheel).
- **New tests:** a seat with a steering stand in front fits together, and a tall stack behind the stand collides with the wheel.
- **Photo check list:** `PHOTO_CHECKED` in the audit lists the parts compared side by side with a photo of the real part. 9 are done (3829c01, 3403c01, 122c01, 2412b, 4070, 3853, 4032, 2432, 4460); every run lists the parts not yet compared. A photo of more of your pieces would let me check the rest.

## Cross-check against LDraw CAD geometry (2026-10-25)

[LDraw](https://library.ldraw.org) is the community CAD library of real LEGO parts, modelled to the exact LEGO unit (1 stud = 20 LDU, 1 plate = 8 LDU). For every part in the catalog I measured the LDraw model's footprint, height and the position of every stud on top, and compared them with the app. I also rendered each part next to the app's drawing, and checked BrickLink and Brick Architect photos wherever the two disagreed.

135 of 164 parts match LDraw exactly: footprint, height and every stud position. Six were wrong, and five of them could make the app accept builds that don't fit in real life:

| # | Part | What was wrong | Fix |
|---|---|---|---|
| 19 | 3823 windscreen | The app put 4 studs along the top. The real part has only 2, one at each end; the middle of the top is smooth. Bricks could be placed on studs that don't exist. | Only the two end studs connect. |
| 20 | 4865 panel 1×2×1 | The app gave it 2 studs on top of the wall, drawn on a top frame. The real panel is a plain L (a floor plate and a thin wall) with no studs at all. Things could be stacked on a 1.6 mm wall. | No studs, no top frame. (The 1×2×2 panel 4864 does have a top frame with 2 studs, and still does.) |
| 21 | 2432 tile with handle | Counted as 1 plate tall. The handle rises 3 plates above the tile, so the part is 4 plates tall. Parts could be placed through the handle. | 4 plates tall, drawn with end walls and a bar on top. |
| 22 | 3470 fruit tree | 14 plates (4⅔ bricks) tall. LDraw and Brick Owl (1.4" × 1.4" × 2.3") give 18 plates, 6 bricks. Parts could be placed inside the crown. | 18 plates, label 4×4×6, crown drawn as an oval on a thin trunk and round foot. |
| 23 | 60474 round plate 4×4 | Only the 8 outer studs connected. The real plate has 12 studs: every cell except the corners, with the pin hole between the 4 middle studs. | All 12 studs connect. |
| 24 | 2412b grille tile | Fix 17 above turned the slots across the tile. BrickLink's photo, Brick Architect's drawing and LDraw all show 3 bars and 2 slots running **along** the tile. | Slots run along the tile again. If the tile in your photo had slots across it, it may have been a different part; please send it again. |

The 29 parts that still differ from LDraw are listed with their reasons in `ACCEPTED` in `tests/ldraw-check.js`. Each is a real difference the stud grid can't express, for example:

- handles, clips, rails and wheel pins that stick out beside a part;
- the single center stud of jumper plates;
- baseplates, which are half a plate thick;
- the 2 studs on the seat 4079, which sit lower than the top of the part.

Three of them are LDraw quirks, checked against BrickLink photos: the windows 3853 and 60594 and the door frame 60596 do have 4 studs on top, but LDraw draws the end studs as part of the frame.

**New check (`tests/ldraw-check.js`, run by `run.sh`):** compares every catalog part with `tests/ldraw-ref.json`, the LDraw measurements, and fails on any difference that isn't accepted. An accepted part may only differ in the ways its reason names (footprint, height or studs), and an exception that stops being needed also fails, so the list stays honest. It works offline. After adding a part, run `node tests/ldraw-update.js` (needs internet) to measure it from LDraw. Run against the version before this fix, the check flags 3823, 4865, 2432, 3470 and 60474.

## Lessons: rules for adding parts

00. **Look at the real part.** Compare the render side by side with a photo of the real part, from your own pieces or BrickLink, from at least two angles, before adding it. Then add it to `PHOTO_CHECKED`. Check which way it faces, where every feature sits and how big it is next to a stud, not just its overall size. Never "fix" a part from a number alone without checking what the number measures.
0. **Never guess a size.** If the name doesn't give the height, take it from BrickLink's measured size and add it to `REAL_SIZE` with the source. If no measurement can be found, mark it unverified so it stays visible.
1. **Look the part up before adding it.** Confirm the design ID, name and size on BrickLink, Brick Architect or Rebrickable. When sources disagree (for example 3048 and 3049), leave the part out instead of guessing.
2. **Labels follow LEGO naming.** Plain parts: smaller × larger ("Plate 2 x 4"). Slopes: length down the slope × width (× height). Windows, doors, windscreens and panels: depth × width × height in bricks.
3. **Use real proportions.** A stud is 8 mm across and 1.7 mm tall; a plate is 3.2 mm and a brick 9.6 mm. Technic holes sit 5.8 mm up. Wheel and tire diameters come from the part name (for example "Tire 15mm D.").
4. **Draw what the part is.** Hollow parts are hollow, recessed studs are recessed, and logs run the right way. A detail that sticks out (a handle, side studs) should stick out.
5. **Pieces that come together must match.** Check BrickLink's "fits with" lists for frames and doors, windows and glass, and wheel plates and wheels. A piece that comes along gets its real size, even when only its icon is shown.
6. **Model how it connects, not just how it looks.** List studs on top, connections underneath (arches only at the ends, trees at the center, nothing under baseplates and wheel plates), cells that stay empty (corner pieces), and wheel space.
6b. **Measure it in LDraw.** Run `node tests/ldraw-update.js` and then `tests/run.sh`. The LDraw check compares the footprint, height and studs with the real CAD model. Don't add an exception unless a photo shows the grid can't express the difference.
7. **Run the tests before publishing:** `tests/run.sh`. It runs the name-against-size audit (`tests/audit.js`) and checks every part in all four rotations: shape inside its space, studs where the checker expects them, wheels inside their reserved space (`tests/unit.js`). It also runs the full app flow on simulated iPhone and iPad screens (`tests/e2e.js`). The audit fails on any deviation that isn't on its short list of accepted exceptions, each with its reason.

## Known simplifications (not errors)

- Windows, doors, trees, the steering wheel and the turntable are drawn simplified, but at the right size.
- Side studs, the jumper plates' center stud and the cones' top stud are drawn but don't connect, because they sit between grid positions.
- The 3788 mudguard, the hinged 1×3×1 car doors and wing plates are left out: the grid can't express them yet, or their shape couldn't be confirmed.

## Sources

- [BrickLink: 3829c01 Steering Stand 1 x 2 (0.8 x 1.6 x 1.84 cm)](https://www.bricklink.com/v2/catalog/catalogitem.page?P=3829c01)
- [Toysperiod: 3829c01 Tile 1 x 2 with Vehicle Steering Stand](https://www.toysperiod.com/lego-set-reference/parts/tiles/undecorated-tiles/3829c01_tile-specialty-1-x-2-with-vehicle-steering-stand-complete-assembly-with-black-steering-wheel/)
- [BrickLink: 4079 Seat / Chair 2 x 2](https://www.bricklink.com/v2/catalog/catalogitem.page?P=4079)
- [ToyPro: 4079 Seat 2 x 2 x 2](https://www.toypro.com/us/product/34624/seat-2-x-2-x-2/black)
- [BrickLink: 3403c01 Turntable 4 x 4 (3.2 x 3.2 x 1.15 cm)](https://www.bricklink.com/v2/catalog/catalogitem.page?P=3403c01)

- [Brick Architect: 122c01 2×2 Plate w/ 8mm D. Wheels](https://brickarchitect.com/parts/122c01)
- [BrickLink: 30179 Door Frame 1 x 4 x 6 (fits x39c01 and 60797)](https://www.bricklink.com/v2/catalog/catalogitem.page?P=30179)
- [BrickLink: x39c03 Door 1 x 4 x 6 with 3 Panes](https://www.bricklink.com/v2/catalog/catalogitem.page?P=x39c03)
- [Brick Architect: 4070 1×1 Brick, Headlight](https://brickarchitect.com/parts/4070)
- [Brick Owl: 3823 Windscreen 2 x 4 x 2](https://www.brickowl.com/us/catalog/lego-windscreen-2-x-4-x-2-3823-35260)
- [BrickLink: 3043 Slope 45 2 x 2 Double](https://www.bricklink.com/v2/catalog/catalogitem.page?P=3043)
- [LDraw parts library](https://library.ldraw.org) (CAD models measured for every part; see `tests/ldraw-ref.json`)
- [Brick Owl: 3470 Fruit Tree (1.4" x 1.4" x 2.3")](https://brickowl.com/catalog/901226)
- [Brick Architect: 2412 Tile 1×2 Grille](https://brickarchitect.com/parts/2412), [2432 Tile 1×2 with Handle](https://brickarchitect.com/parts/2432), [4865 Panel 1×2×1](https://brickarchitect.com/parts/4865)

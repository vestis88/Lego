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
- **Structure checker:** after Claude answers, the app checks the model on a stud grid. It looks for overlapping pieces, and for pieces that aren't held by studs or aren't connected to the ground after each step. If it finds problems, it sends Claude one automatic repair request. Any overlaps still left after the repair are removed.

### Model format

Coordinates use a stud grid: `x` (right) and `z` (toward the viewer) are in studs, and `y` is in plates (a brick is 3 plates tall). Each part gives its minimum corner:

```json
{"title": "Liten racerbil", "description": "…", "steps": [
  {"text": "Lägg en röd kloss ovanpå.", "parts": [
    {"k": "brick", "x": 1, "y": 4, "z": 0, "w": 2, "d": 6, "h": 3, "c": "red"}
  ]}
]}
```

Part kinds: `brick`, `plate`, `tile`, `slope` (with `dir`), `round`, `wheel` (with `axis`). Technic parts are planned for later.

## Updating the app

Edit `app/byggboken.html`, then republish it to the same artifact URL from a Claude Code session. The file is the page body only: no `<!doctype>`, `<html>` or `<head>` tags, because the publisher adds them.

## Known limits

- Pictures look like a building booklet, but not like an official one.
- Claude's spatial accuracy drops on very large models. The checker catches loose and overlapping pieces, but it can't judge whether the model looks good.
- Piece counting and the piece finder use still photos, not a live camera, and can miss small or hidden pieces.

// Runs inside the page.
window.__unit = () => {
  const out = [];
  const ok = (c, m) => { if (!c) out.push("FAIL " + m); };
  // 1. Geometry footprint and grid cells agree for every part and rotation (pieces measured from CAD: see __unitAuto).
  for (const C of Object.values(CAT).filter((C) => !C.auto)) for (const r of [0, 90, 180, 270]) {
    const p = { id: C.id, x: 3, y: 2, z: -4, r, c: "red" };
    const I = info(p);
    const g = buildPart(p, true);
    const b = new THREE.Box3().setFromObject(g);
    const tag = `${C.id} r${r}`;
    // Real parts that reach past their grid cells (pins, handles, clips, tabs, branches) or have studs off the grid.
    const OUT = { "2540": 0.85, "32028": 0.5, "4081b": 0.95, "33291": 0.15, "3471": 0.25, "3470": 0.2, "3741": 0.2, "4600": 0.75, "6157": 1.25, "122c01": 0.85, "2926": 0.75, "4079": 0.3, "3853": 0.25, "4070": 0.1,
      "4733": 0.25, "11211": 0.25, "30414": 0.25, "87087": 0.25, "2921": 0.75, "4085": 0.75, "60478": 0.85, "30602": 0.45, "32607": 0.9, "24866": 0.1,
      "32952": 0.25, "47905": 0.25, "26604": 0.25, "52107": 0.25 };
    // Studs off the grid (center studs), or other bits above the top that the stud check would mistake for studs.
    const OFFGRID = ["3794", "15573", "87580", "3942c", "33291", "4600", "6157", "122c01", "2926", "2540", "4081b", "3741", "2921", "4085", "60478", "6091", "6081", "32607", "24866"];
    if (!C.child) {
      const tol = (OUT[C.id] || 0) + 0.06;
      ok(b.max.y >= (p.y + C.h) * PH - 0.3, `${tag} drawn top ${b.max.y.toFixed(2)} falls short of its height ${((p.y + C.h) * PH).toFixed(2)}`);
      // The drawing stays inside the space the part occupies, apart from the known bits that stick out.
      const ox = I.occ.map((c) => c[0]), oz = I.occ.map((c) => c[2]);
      const [x0, x1, z0, z1] = [Math.min(...ox), Math.max(...ox) + 1, Math.min(...oz), Math.max(...oz) + 1];
      ok(b.min.x > x0 - tol && b.max.x < x1 + tol && b.min.z > z0 - tol && b.max.z < z1 + tol && b.min.y > p.y * PH - 0.01 - (OUT[C.id] ? 0.45 : 0) && b.max.y < (p.y + C.h) * PH + 0.25 + (OUT[C.id] ? 0.45 : 0), `${tag} shape leaves its space (${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)}, ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)}, y ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)} vs ${x0}..${x1}, ${z0}..${z1})`);
      const xs = I.cells.map((c) => c[0]), zs = I.cells.map((c) => c[1]);
      ok(I.cells.length === canonCells(C).length && Math.min(...xs) === p.x && Math.max(...xs) === p.x + I.w - 1 && Math.min(...zs) === p.z && Math.max(...zs) === p.z + I.d - 1, `${tag} cells`);
    }
    // Real studs on top (from LDraw) sit exactly over the cells the checker gives studs, turned with the part.
    const studPos = new Set();
    g.traverse((o) => { if (o.isMesh) { const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i++) if (a.getY(i) > (p.y + (C.studY ?? C.h)) * PH + 0.1 && a.getY(i) < (p.y + (C.studY ?? C.h)) * PH + 0.3) studPos.add(Math.floor(a.getX(i)) + "," + Math.floor(a.getZ(i))); } });
    const sc = new Set(I.studs.map(([x, z]) => x + "," + z));
    if (!OFFGRID.includes(C.id) && !C.child) ok([...studPos].every((k) => sc.has(k)) && [...sc].every((k) => studPos.has(k)), `${tag} drawn studs [${[...studPos].sort()}] vs stud cells [${[...sc].sort()}]`);
    // wheels stay inside the occupied wheel space
    if (C.wheels) {
      const full = new THREE.Box3().setFromObject(buildPart(p, false));
      const xs = I.occ.map((c) => c[0]), ys = I.occ.map((c) => c[1]), zs = I.occ.map((c) => c[2]);
      ok(full.min.x >= Math.min(...xs) - 0.01 && full.max.x <= Math.max(...xs) + 1.01 && full.min.z >= Math.min(...zs) - 0.01 && full.max.z <= Math.max(...zs) + 1.01, `${tag} wheels outside occupancy x/z`);
      ok(full.min.y >= Math.min(...ys) * PH - 0.01 && full.max.y <= (Math.max(...ys) + 1) * PH + 0.01, `${tag} wheels outside occupancy y ${full.min.y}..${full.max.y}`);
    }
  }
  // 2. Example build is clean.
  ok(problemList(analyze(EXAMPLE.steps)).length === 0, "example problems: " + problemList(analyze(EXAMPLE.steps)).join(" | "));
  // 3. Detects floating, overlap, trapped, unknown.
  const bad = normBuild({ steps: [
    { parts: [{ id: "3032", x: 0, y: 0, z: 0 }] },
    { parts: [{ id: "3001", x: 0, y: 1, z: 0 }, { id: "3003", x: 0, y: 1, z: 0 }, { id: "9999", x: 0, y: 1, z: 0 }, { id: "3001", x: 2, y: 1, z: 2 }, { id: "3020", x: 2, y: 7, z: 2 }] },
    { parts: [{ id: "3001", x: 2, y: 4, z: 2 }] },
  ] });
  const a = analyze(bad.steps);
  ok(bad.unknown.length === 1, "unknown id detected");
  ok(a.overlaps.length === 1, "overlap detected " + a.overlaps.length);
  ok(a.floats.length === 1 && a.parts[a.floats[0].i].id === "3020", "float detected " + JSON.stringify(a.floats));
  ok(a.trapped.length === 1 && a.parts[a.trapped[0].i].y === 4 && a.parts[a.trapped[0].i].step === 2, "trapped detected " + JSON.stringify(a.trapped.map((t) => a.parts[t.i])));
  const fixed = repairLocally(bad.steps);
  const a2 = analyze(fixed.steps);
  ok(a2.overlaps.length === 0 && a2.floats.length === 0, "local repair clears overlap+float");
  ok(fixed.steps[2].parts.some((p) => p.id === "3020"), "floating plate moved to step 3");
  // 4. Wheel space blocks a wide plate placed too low.
  const car = normBuild({ steps: [{ parts: [{ id: "3795", x: 1, y: 0, z: 0 }] }, { parts: [{ id: "4600", x: 1, y: -1, z: 0 }] }, { parts: [{ id: "3032", x: 0, y: 1, z: 0 }] }] });
  ok(analyze(car.steps).overlaps.length === 1, "wide plate hits wheels");
  // 5. Smooth tops hold nothing.
  const tile = normBuild({ steps: [{ parts: [{ id: "3068b", x: 0, y: 0, z: 0 }] }, { parts: [{ id: "3003", x: 0, y: 1, z: 0 }] }] });
  ok(analyze(tile.steps).floats.length === 1, "brick on tile floats");
  // 6. Slope studs: brick on the high row holds, on the low row floats.
  const sl = normBuild({ steps: [{ parts: [{ id: "3039", x: 0, y: 0, z: 0, r: 0 }] }, { parts: [{ id: "3004", x: 0, y: 3, z: 0, r: 90 }] }] });
  ok(analyze(sl.steps).floats.length === 0, "brick on slope high row holds");
  const sl2 = normBuild({ steps: [{ parts: [{ id: "3039", x: 0, y: 0, z: 0, r: 0 }] }, { parts: [{ id: "3004", x: 0, y: 3, z: 1, r: 90 }] }] });
  ok(analyze(sl2.steps).floats.length === 1, "brick on slanted row floats");
  // 7. Legacy builds convert.
  const leg = normBuild({ steps: [{ parts: [{ k: "brick", x: 0, y: 0, z: 0, w: 4, d: 2, h: 3, c: "red" }, { k: "slope", x: 0, y: 3, z: 0, w: 2, d: 2, dir: "+z", c: "blue" }, { k: "wheel", x: 0, y: 0, z: 0 }] }] });
  ok(leg.steps[0].parts.length === 2 && leg.steps[0].parts[0].id === "3001" && leg.steps[0].parts[0].r === 90 && leg.steps[0].parts[1].id === "3039", "legacy " + JSON.stringify(leg.steps));
  // 8. Pieces list adds wheels and doors.
  const pl = groupParts([{ id: "4600", c: "black" }, { id: "60596", c: "white", c2: "red" }]).map((g) => `${g.n}x${g.p.id}:${g.p.c}`).sort();
  ok(JSON.stringify(pl) === JSON.stringify(["1x4600:black", "1x60596:white", "1x60616:red", "2x4624c01:lightgray"]), "piece list " + pl);
  ok(spokenPart({ id: "60592", c: "red" }, 1) === "ett rött fönster 1 gånger 2 gånger 2", spokenPart({ id: "60592", c: "red" }, 1));
  ok(spokenPart({ id: "3001", c: "blue" }, 2) === "två blå klossar 2 gånger 4", spokenPart({ id: "3001", c: "blue" }, 2));
  // 9. 1990s connection rules.
  const arch = normBuild({ steps: [{ parts: [{ id: "3001", x: 0, y: 0, z: 0, r: 90 }, { id: "3001", x: 4, y: 0, z: 0, r: 90 }] }, { parts: [{ id: "3659", x: 1, y: 3, z: 0 }] }] });
  ok(analyze(arch.steps).floats.length === 0, "arch rests on its ends");
  const arch2 = normBuild({ steps: [{ parts: [{ id: "3003", x: 1, y: 0, z: 0 }] }, { parts: [{ id: "3659", x: 0, y: 3, z: 0 }] }] });
  ok(analyze(arch2.steps).floats.length === 1, "arch held only by the opening floats");
  const corner = normBuild({ steps: [{ parts: [{ id: "2357", x: 0, y: 0, z: 0 }] }, { parts: [{ id: "3005", x: 1, y: 3, z: 1 }] }] });
  const ca = analyze(corner.steps);
  ok(ca.overlaps.length === 0 && ca.floats.length === 1, "corner leaves its empty cell free " + JSON.stringify([ca.overlaps.length, ca.floats.length]));
  const tree = normBuild({ steps: [{ parts: [{ id: "3031", x: 0, y: 0, z: 0 }] }, { parts: [{ id: "3471", x: 0, y: 1, z: 0 }] }] });
  ok(analyze(tree.steps).floats.length === 0, "tree attaches with its center");
  const bp = normBuild({ steps: [{ parts: [{ id: "3867", x: 0, y: 0, z: 0 }] }, { parts: [{ id: "3022", x: 0, y: -1, z: 0 }] }] });
  ok(analyze(bp.steps).floats.length === 1, "nothing attaches under a baseplate");
  const tt = info({ id: "3403c01", x: 0, y: 0, z: 0, r: 0 });
  ok(tt.studs.length === 12, "turntable studs " + tt.studs.length);
  const rw = normBuild({ steps: [{ parts: [{ id: "3795", x: 1, y: 0, z: 0 }] }, { parts: [{ id: "122c01", x: 1, y: -1, z: 0 }] }, { parts: [{ id: "2456", x: 1, y: 1, z: 0 }] }, { parts: [{ id: "3032", x: 0, y: 4, z: 0 }] }] });
  ok(analyze(rw.steps).overlaps.length === 0, "122c01 wheels clear at y+3 and above");
  const rw2 = normBuild({ steps: [{ parts: [{ id: "3795", x: 1, y: 0, z: 0 }] }, { parts: [{ id: "122c01", x: 1, y: -1, z: 0 }] }, { parts: [{ id: "3032", x: 0, y: 0, z: 0 }] }] });
  ok(analyze(rw2.steps).overlaps.length > 0, "122c01 wheels block a low plate");
  ok(JSON.stringify(groupParts([{ id: "3853", c: "white" }, { id: "3741", c: "green", c2: "yellow" }]).map((g) => g.n + "x" + g.p.id + ":" + g.p.c).sort()) === JSON.stringify(["1x3741:green", "1x3853:white", "1x3855:transparent", "3x3742:yellow"]), "window glass + flowers listed");
  ok(problemList(analyze(EXAMPLE_BUGGY.steps)).length === 0, "buggy problems: " + problemList(analyze(EXAMPLE_BUGGY.steps)).join(" | "));
  LOADER_MODELS.forEach((m, i) => ok(problemList(analyze(normBuild({ steps: m.map((p) => ({ parts: [p] })) }).steps)).length === 0, "loader model " + i + ": " + problemList(analyze(normBuild({ steps: m.map((p) => ({ parts: [p] })) }).steps))));
  // 10. Vehicle parts.
  const wide = normBuild({ steps: [{ parts: [{ id: "3795", x: 1, y: 0, z: 0 }] }, { parts: [{ id: "6157", x: 1, y: -1, z: 0 }] }, { parts: [{ id: "3032", x: 0, y: 2, z: 0 }] }] });
  ok(analyze(wide.steps).overlaps.length === 1, "6157 wide wheels block a plate at y+3");
  const wide2 = normBuild({ steps: [{ parts: [{ id: "3795", x: 1, y: 0, z: 0 }] }, { parts: [{ id: "6157", x: 1, y: -1, z: 0 }] }, { parts: [{ id: "2456", x: 1, y: 1, z: 0 }] }, { parts: [{ id: "3032", x: 0, y: 4, z: 0 }] }] });
  ok(problemList(analyze(wide2.steps)).length === 0, "6157 clear at y+4 " + problemList(analyze(wide2.steps)));
  const axle = normBuild({ steps: [{ parts: [{ id: "3032", x: 0, y: 0, z: 0 }] }, { parts: [{ id: "2926", x: 0, y: -1, z: 1 }, { id: "2926", x: 0, y: -1, z: 4 }] }] });
  ok(problemList(analyze(axle.steps)).length === 0, "2926 axles under a 4x6 " + problemList(analyze(axle.steps)));
  const cc = info({ id: "2450", x: 0, y: 0, z: 0, r: 0 });
  ok(cc.studs.length === 6 && cc.cells.length === 8, "2450 cells");
  ok(JSON.stringify(groupParts([{ id: "6157", c: "black" }, { id: "2926", c: "red", c2: "white" }]).map((g) => g.n + "x" + g.p.id + ":" + g.p.c).sort()) === JSON.stringify(["1x2926:red", "1x6157:black", "2x4624c01:white", "2x6014ac01:white"]), "wheel extras listed");
  // 12. Steering stand: across the car, in front of a seat, wheel over the seat's low front row.
  const st = info({ id: "3829c01", x: 0, y: 0, z: 0, r: 0 });
  ok(st.cells.length === 2 && st.cells.every(([x, z]) => z === 0), "steering base lies across (x)");
  const cab = normBuild({ steps: [{ parts: [{ id: "3021", x: 0, y: 0, z: 0, r: 0 }] }, { parts: [{ id: "4079", x: 0, y: 1, z: 0 }, { id: "3829c01", x: 0, y: 1, z: 2 }] }] });
  ok(problemList(analyze(cab.steps)).length === 0, "seat + steering stand fit together " + problemList(analyze(cab.steps)));
  const cab2 = normBuild({ steps: [{ parts: [{ id: "3021", x: 0, y: 0, z: 0, r: 0 }] }, { parts: [{ id: "3004", x: 0, y: 1, z: 1, r: 90 }, { id: "3004", x: 0, y: 4, z: 1, r: 90 }, { id: "3829c01", x: 0, y: 1, z: 2 }] }] });
  ok(analyze(cab2.steps).overlaps.length === 1, "steering wheel collides with a tall brick behind it");
  // 11. Roof pieces and round plates.
  ok(info({ id: "3046", x: 0, y: 0, z: 0, r: 0 }).studs.length === 3, "3046 studs");
  const rp = info({ id: "60474", x: 0, y: 0, z: 0, r: 0 });
  ok(rp.studs.length === 12 && rp.cells.length === 12, "60474 cells " + rp.studs.length + "/" + rp.cells.length);
  const ridge = normBuild({ steps: [{ parts: [{ id: "3043", x: 0, y: 0, z: 0 }] }, { parts: [{ id: "3005", x: 0, y: 3, z: 0 }] }] });
  ok(analyze(ridge.steps).floats.length === 1, "nothing holds on a ridge");
  const cvx = normBuild({ steps: [{ parts: [{ id: "3045", x: 0, y: 0, z: 0 }] }, { parts: [{ id: "3005", x: 0, y: 3, z: 0 }] }] });
  ok(analyze(cvx.steps).floats.length === 0, "brick on convex corner stud holds");
  const cvx2 = normBuild({ steps: [{ parts: [{ id: "3045", x: 0, y: 0, z: 0, r: 90 }] }, { parts: [{ id: "3005", x: 0, y: 3, z: 0 }] }] });
  ok(analyze(cvx2.steps).floats.length === 1, "turned convex corner moves its stud");
  // 14. Curved-top bricks: their studs are 3 plates up, under the curve's top.
  const bow = normBuild({ steps: [{ parts: [{ id: "6091", x: 0, y: 0, z: 0, r: 0 }] }, { parts: [{ id: "3005", x: 0, y: 3, z: 0 }] }] });
  ok(problemList(analyze(bow.steps)).length === 0, "brick on a curved-top brick's stud " + problemList(analyze(bow.steps)));
  const bow2 = normBuild({ steps: [{ parts: [{ id: "6091", x: 0, y: 0, z: 0, r: 0 }] }, { parts: [{ id: "3004", x: 0, y: 3, z: 0, r: 0 }] }] });
  ok(analyze(bow2.steps).overlaps.length === 1, "a 1x2 brick at stud height hits the curve");
  // 13. Real sets: how much of a set the child's pieces cover (same color, or any color).
  const inv0 = Store.inventory;
  Store.inventory = [{ id: "3001", c: "red", n: 3 }, { id: "3001", c: "blue", n: 5 }, { id: "3004", c: "red", n: 1 }];
  const cov = setCoverage({ need: [["3001", "red", 4], ["3004", "white", 2]], other: 2 });
  ok(cov.total === 8 && cov.have === 3 && cov.any === 5, "set coverage " + JSON.stringify(cov));
  Store.inventory = inv0;
  return out;
};

// Pieces measured from CAD (library-connect.json): drawn where the checker thinks they are, in every rotation, and the
// checker connects them by their studs and grips. Checks the pieces in the first shape files.
window.__unitAuto = async () => {
  const out = [];
  const ok = (c, m) => { if (!c) out.push("FAIL " + m); };
  await loadConnect();
  const auto = Object.values(CAT).filter((C) => C.auto && C.conn.k < 3);
  ok(auto.length > 60, "measured pieces loaded: " + auto.length);
  await ensureParts(auto.map((C) => ({ id: C.id })));
  // Known: thin sheets lying exactly on a plate boundary fill no cell (the boat deck's curved rim).
  const THIN = ["998"];
  for (const C of auto.filter((C) => !THIN.includes(C.id))) for (const r of [0, 90, 180, 270]) {
    const p = { id: C.id, x: 3, y: 2, z: -4, r, c: "red" }, I = info(p);
    const b = new THREE.Box3().setFromObject(buildPart(p, true));
    const xs = I.occ.map((c) => c[0]), ys = I.occ.map((c) => c[1]), zs = I.occ.map((c) => c[2]);
    // Material less than 1 unit into a cell doesn't fill it, studs stand above the top and side studs stick out 0.2.
    const t = 0.25;
    ok(b.min.x > Math.min(...xs) - t && b.max.x < Math.max(...xs) + 1 + t && b.min.z > Math.min(...zs) - t && b.max.z < Math.max(...zs) + 1 + t
      && b.min.y > Math.min(...ys) * PH - t && b.max.y < (Math.max(...ys) + 1) * PH + 0.2 + t,
      `${C.id} r${r} drawn ${[b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z].map((v) => v.toFixed(2))} vs space x ${Math.min(...xs)}..${Math.max(...xs) + 1} y ${(Math.min(...ys) * PH).toFixed(2)}..${((Math.max(...ys) + 1) * PH).toFixed(2)} z ${Math.min(...zs)}..${Math.max(...zs) + 1}`);
  }
  // A 1x1 brick on any stud of a measured piece holds; one beside the studs floats. A measured piece on a big plate holds by its grips.
  const studded = auto.find((C) => C.conn.studs.length && C.conn.holds.some(([, , y]) => y === 0));
  const [sx, sz, sy] = studded.conn.studs[0];
  const base = { id: studded.id, x: 0, y: 0, z: 0, r: 0, c: "red" };
  ok(analyze([{ parts: [base] }, { parts: [{ id: "3005", x: sx, y: sy, z: sz, c: "blue" }] }]).floats.length === 0, `brick on a stud of ${studded.id}`);
  ok(analyze([{ parts: [base] }, { parts: [{ id: "3005", x: -5, y: sy, z: -5, c: "blue" }] }]).floats.length === 1, `brick away from ${studded.id} floats`);
  const [hx, hz] = studded.conn.holds.find(([, , y]) => y === 0);
  ok(analyze([{ parts: [{ id: "3958", x: -2, y: -1, z: -2, c: "green" }] }, { parts: [base] }]).floats.length === 0, `${studded.id} held by its grip at (${hx},${hz})`);
  ok(pieceSpec(studded).startsWith(studded.id + ": "), "measured piece described for Claude");
  return out;
};

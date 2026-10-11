/* global document, KeyboardEvent */
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { Buffer } from "node:buffer";

// Run against `npm run dev`. This isolated page mounts the shipped game on its
// own engine so the capture can step a clock without exposing a debug global.
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route("**/capture.html", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<html><body style="margin:0"><canvas id="stage" style="width:1280px;height:720px"></canvas></body></html>',
  }),
);
await page.goto("http://localhost:5173/capture.html");
const result = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const canvas = document.getElementById("stage");
  const engine = createEngine({
    canvas,
    width: 1280,
    height: 720,
    game,
    background: BACKGROUND,
    layout: "dpad-4",
    clock: new ConstantClock(1000 / 60),
  });
  await engine.initialize();
  await engine.advance(1);
  const title = canvas.toDataURL("image/png");
  const key = (code) => {
    document.dispatchEvent(new KeyboardEvent("keydown", { code }));
    document.dispatchEvent(new KeyboardEvent("keyup", { code }));
  };
  key("ArrowDown");
  await engine.advance(1);
  key("Enter");
  await engine.advance(1);
  const howto = canvas.toDataURL("image/png");
  key("Escape");
  await engine.advance(1);
  key("ArrowUp");
  await engine.advance(1);
  key("Enter");
  await engine.advance(1);
  const chain = [];
  for (let col = 14; col >= 7; col--) chain.push({ col, row: 7 });
  for (let row = 8; row <= 12; row++) chain.push({ col: 7, row });
  for (let col = 8; col <= 20; col++) chain.push({ col, row: 12 });
  for (let row = 11; row >= 8; row--) chain.push({ col: 20, row });
  for (let col = 19; col >= 16; col--) chain.push({ col, row: 8 });
  engine.apply((s) => engine.debug.setSnake(s, chain));
  const pellets = [
    { col: 16, row: 7 },
    { col: 20, row: 7 },
    { col: 23, row: 6 },
    { col: 23, row: 4 },
    { col: 19, row: 4 },
    { col: 15, row: 4 },
    { col: 15, row: 2 },
    { col: 19, row: 1 },
    { col: 24, row: 1 },
  ];
  engine.apply((s) =>
    engine.debug.setPellet(s, pellets[0].col, pellets[0].row),
  );
  let next = 1;
  engine.apply((s) =>
    engine.debug.setNextPellet(s, pellets[next].col, pellets[next].row),
  );
  const turns = new Map([
    [9, "ArrowUp"],
    [12, "ArrowLeft"],
    [20, "ArrowUp"],
    [23, "ArrowRight"],
  ]);
  let lastScore = 0;
  let live = "";
  engine.startRecording();
  for (let frame = 0; frame < 240; frame++) {
    const ticks = engine.state.ticks;
    if (turns.has(ticks)) {
      key(turns.get(ticks));
      turns.delete(ticks);
    }
    await engine.advance(1);
    if (engine.state.score !== lastScore) {
      lastScore = engine.state.score;
      next++;
      if (pellets[next])
        engine.apply((s) =>
          engine.debug.setNextPellet(s, pellets[next].col, pellets[next].row),
        );
    }
    if (frame === 105) live = canvas.toDataURL("image/png");
  }
  const replay = engine.stopRecording();
  const snapshot = engine.debug.snapshot(engine.state);
  key("KeyP");
  await engine.advance(1);
  const paused = canvas.toDataURL("image/png");
  engine.destroy();
  return { title, howto, live, paused, replay, snapshot };
});
await mkdir("showcase", { recursive: true });
for (const name of ["title", "howto", "live", "paused"]) {
  await writeFile(
    `showcase/${name}.png`,
    Buffer.from(result[name].split(",")[1], "base64"),
  );
}
await writeFile(
  "showcase/combo.json.gz",
  gzipSync(JSON.stringify(result.replay)),
);
await writeFile(
  "/tmp/coil-capture-snapshot.json",
  JSON.stringify(result.snapshot, null, 2),
);
await browser.close();

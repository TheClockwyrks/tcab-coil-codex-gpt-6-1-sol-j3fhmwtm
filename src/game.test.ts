import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  type Game,
  type UpdateApi,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND, type CoilState, type CoilDebugApi } from "./game";
import { debug, initial, validCells, type ReadState } from "./state";
import { update } from "./simulation";
import * as C from "./constants";

function harness() {
  const edges = new Set<string>();
  let muted = false;
  const api: UpdateApi = {
    input: {
      value: () => 0,
      pressed: (name) => edges.delete(name),
      pointer: () => ({
        x: 0,
        y: 0,
        down: false,
        device: "mouse",
        buttons: [],
      }),
      pointerSamples: () => [],
      pointerContacts: () => [],
      pointerPressed: () => false,
      pointerReleased: () => false,
      wheel: () => ({ x: 0, y: 0 }),
    },
    audio: {
      play: vi.fn(),
      loop: vi.fn(),
      stop: vi.fn(),
      looping: () => false,
      muted: () => muted,
      setMuted: (b) => {
        muted = b;
      },
    },
    frame: () => ({ count: 0, timeMs: 0, lastDeltaMs: 0 }),
    viewport: () => ({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      width: 1280,
      height: 720,
      dpr: 1,
    }),
  };
  const image = createCanvas(32, 32) as unknown as ImageBitmap;
  let state = initial({
    head: [image, image, image, image],
    body: image,
    corner: image,
    tail: image,
  });
  return {
    api,
    get state() {
      return state;
    },
    pose(fn: (s: ReadState) => CoilState) {
      state = fn(state);
    },
    step(dt = 0, ...actions: string[]) {
      actions.forEach((a) => edges.add(a));
      state = update(state, api, dt);
      return state;
    },
  };
}
let h: ReturnType<typeof harness>;
beforeEach(() => {
  h = harness();
});
function play() {
  h.step(0, "confirm");
}

describe("fixed ticks and steering", () => {
  it("accumulates fractions and resolves eight ticks per second without mutating old state", () => {
    play();
    const original = h.state;
    h.step(0.06);
    expect(h.state.ticks).toBe(0);
    h.step(0.065);
    expect(h.state.snake[0]).toEqual({ col: 16, row: 8 });
    expect(original.snake[0]).toEqual(C.START_CELLS[0]);
    h.step(0.875);
    expect(h.state.ticks).toBe(8);
    expect(h.state.simTime).toBe(1);
  });
  it("buffers two turns over two ticks and discards an overflow", () => {
    play();
    h.step(0, "down");
    h.step(0, "left");
    h.step(0, "up");
    expect(h.state.turns).toEqual(["down", "left"]);
    h.step(0.125);
    expect(h.state.dir).toBe("down");
    h.step(0.125);
    expect(h.state.dir).toBe("left");
    expect(h.state.snake[0]).toEqual({ col: 14, row: 9 });
  });
  it.each(["left", "right"])("consumes invalid %s without reversing", (dir) => {
    play();
    h.step(0.125, dir);
    expect(h.state.dir).toBe("right");
    expect(h.state.turns).toEqual([]);
  });
  it("steering and travel switches hold only their own faculties", () => {
    play();
    h.pose((s) => debug.setSnakeTravel(s, false));
    h.step(0.125, "up");
    expect(h.state.dir).toBe("up");
    expect(h.state.snake).toEqual(C.START_CELLS);
    h.pose((s) => debug.setSnakeSteering(s, false));
    h.step(0.25, "left");
    expect(h.state.turns).toEqual([]);
    h.pose((s) => debug.setSnakeTravel(s, true));
    h.step(0.125);
    expect(h.state.snake[0].row).toBe(7);
  });
});
describe("growth, scoring and collision", () => {
  it("scores at the resolved multiplier, grows, and emits each cue once", () => {
    play();
    h.pose((s) => debug.setPellet(s, 16, 8));
    h.pose((s) => debug.setNextPellet(s, 17, 8));
    h.step(0.125);
    expect(h.state.score).toBe(10);
    expect(h.state.snake).toHaveLength(4);
    expect(h.state.comboWindow).toBe(3.375);
    expect(h.state.pellet).toEqual({ col: 17, row: 8 });
    h.step(0.125);
    expect(h.state.combo).toBe(2);
    expect(h.state.score).toBe(30);
    expect(h.state.best).toBe(30);
    expect(h.api.audio.play).toHaveBeenCalledTimes(3);
    expect(h.api.audio.play).toHaveBeenLastCalledWith(C.CUES.comboUp);
  });
  it("caps combos and lapses exactly on the 28th window tick", () => {
    play();
    h.pose((s) => debug.setCombo(s, 5));
    h.pose((s) => debug.setComboWindow(s, 3.5));
    h.pose((s) => debug.setSnakeTravel(s, false));
    h.step(3.375);
    expect(h.state.combo).toBe(5);
    expect(h.state.comboWindow).toBe(0.125);
    h.step(0.125);
    expect(h.state.combo).toBe(1);
    expect(h.state.comboWindow).toBe(0);
  });
  it("scores a closed window at one even after a posed multiplier", () => {
    play();
    h.pose((s) => debug.setCombo(s, 5));
    h.pose((s) => debug.setPellet(s, 16, 8));
    h.step(0.125);
    expect(h.state.score).toBe(10);
    expect(h.state.combo).toBe(1);
  });
  it("dies before moving and consumes extra accumulated time", () => {
    play();
    h.pose((s) =>
      debug.setSnake(s, [
        { col: 28, row: 8 },
        { col: 27, row: 8 },
      ]),
    );
    h.pose((s) => debug.setCombo(s, 3));
    h.pose((s) => debug.setComboWindow(s, 2));
    h.step(1);
    expect(h.state.screen).toBe("gameover");
    expect(h.state.accumulator).toBe(0);
    expect(h.state.ticks).toBe(1);
    expect(h.state.comboWindow).toBe(2);
    expect(h.state.snake[0].col).toBe(28);
    expect(h.api.audio.play).toHaveBeenCalledWith(C.CUES.death);
  });
  const loop = [
    { col: 4, row: 4 },
    { col: 4, row: 5 },
    { col: 5, row: 5 },
    { col: 5, row: 4 },
  ];
  it("allows entry to a vacating tail", () => {
    play();
    h.pose((s) => debug.setSnake(s, loop));
    h.step(0.125);
    expect(h.state.screen).toBe("playing");
    expect(h.state.snake[0]).toEqual({ col: 5, row: 4 });
  });
  it("rejects every other body cell", () => {
    play();
    h.pose((s) => debug.setSnake(s, loop));
    h.pose((s) => debug.setDirection(s, "down"));
    h.step(0.125);
    expect(h.state.screen).toBe("gameover");
  });
  it("leaves no pellet after an eat with respawn disabled, preserving the next pose", () => {
    play();
    h.pose((s) => debug.setPelletRespawn(s, false));
    h.pose((s) => debug.setPellet(s, 16, 8));
    h.pose((s) => debug.setNextPellet(s, 19, 8));
    h.step(0.125);
    expect(h.state.pellet).toBeNull();
    expect(h.state.nextPellet).toEqual({ col: 19, row: 8 });
    expect(h.state.screen).toBe("playing");
  });
  it("clears a completely filled board on the final eat", () => {
    play();
    const cells: C.Cell[] = [];
    for (let row = 1; row <= 16; row++) {
      const cols = Array.from({ length: 28 }, (_, i) =>
        row % 2 ? i + 1 : 28 - i,
      );
      cols.forEach((col) => cells.push({ col, row }));
    }
    // Head at the first cell of this Hamiltonian path, final free cell at (1,1).
    h.pose((s) => debug.setSnake(s, cells.slice(1)));
    h.pose((s) => debug.setDirection(s, "left"));
    h.pose((s) => debug.setPellet(s, 1, 1));
    h.step(0.125);
    expect(h.state.screen).toBe("cleared");
    expect(h.state.pellet).toBeNull();
    expect(h.state.snake).toHaveLength(448);
  });
});
describe("screens, menus and sound", () => {
  it("remembers title selection through help and wraps navigation", () => {
    h.step(0, "up");
    expect(h.state.menuIndex).toBe(1);
    h.step(0, "confirm");
    expect(h.state.screen).toBe("howto");
    h.step(0, "back");
    expect(h.state.menuIndex).toBe(1);
    expect(h.state.titleIndex).toBe(1);
  });
  it("freezes ticks, accumulator, combo and bite while paused, then resumes", () => {
    play();
    h.step(0.06);
    h.step(0.2, "pause");
    const frozen = h.state;
    h.step(10);
    expect(h.state.simTime).toBe(frozen.simTime);
    expect(h.state.accumulator).toBe(0.06);
    h.step(0.065, "pause");
    expect(h.state.ticks).toBe(1);
    expect(h.state.screen).toBe("playing");
  });
  it("restarts rounds, retains session figures, and exits to the title", () => {
    play();
    h.pose((s) => debug.setScore(s, 100));
    h.step(0);
    h.step(0, "pause");
    h.step(0, "down");
    h.step(0, "confirm");
    expect(h.state.score).toBe(0);
    expect(h.state.best).toBe(100);
    h.step(0, "back");
    h.step(0, "up");
    h.step(0, "confirm");
    expect(h.state.screen).toBe("title");
  });
  it("toggles engine mute on every screen and keeps posed best honest", () => {
    h.step(0, "mute");
    expect(h.state.muted).toBe(true);
    h.pose((s) => debug.setScore(s, 150));
    h.pose((s) => debug.setBest(s, 2));
    h.step(0);
    expect(h.state.best).toBe(150);
    h.pose((s) => debug.reset(s));
    expect(h.state.muted).toBe(true);
    expect(h.state.best).toBe(0);
  });
  it("uses both pointer edges in the same item, including within one frame", () => {
    const sample = (type: "down" | "up", x: number, y: number) => ({
      type,
      x,
      y,
      id: 1,
      primary: true,
      device: "mouse" as const,
      button: "primary" as const,
      buttons: [],
    });
    h.api.input.pointerSamples = () => [
      sample("down", 500, 448),
      sample("up", 500, 510),
    ];
    h.step();
    expect(h.state.screen).toBe("title");
    expect(h.state.menuIndex).toBe(1);
    h.api.input.pointerSamples = () => [
      sample("down", 500, 448),
      sample("up", 500, 448),
    ];
    h.step();
    expect(h.state.screen).toBe("playing");
  });
});
describe("debug contract and pellet draws", () => {
  it("validates domains loudly without mutating state", () => {
    const s = h.state;
    expect(() => debug.setScore(s, -1)).toThrow();
    expect(() => debug.setBest(s, 1.5)).toThrow();
    expect(() => debug.setCombo(s, 0)).toThrow();
    expect(() => debug.setComboWindow(s, NaN)).toThrow();
    expect(() => debug.setDirection(s, "north" as C.Direction)).toThrow();
    expect(() => debug.setScreen(s, "other" as C.Screen)).toThrow();
    expect(() => debug.setMenuIndex(s, 2)).toThrow();
    expect(() => debug.setPellet(s, 15, 8)).toThrow();
    expect(() => debug.setPellet(s, 0, 2)).toThrow();
    expect(() => debug.setNextPellet(s, 30, 1)).toThrow();
    expect(() => debug.setSnake(s, [])).toThrow();
    expect(() =>
      debug.setSnake(s, [
        { col: 1, row: 1 },
        { col: 3, row: 1 },
      ]),
    ).toThrow();
    expect(() =>
      debug.setSnake(s, [
        { col: 1, row: 1 },
        { col: 1, row: 2 },
        { col: 1, row: 1 },
      ]),
    ).toThrow();
    expect(() => debug.setSnakeTravel(s, 1 as unknown as boolean)).toThrow();
    expect(h.state).toBe(s);
  });
  it("snapshots exact fields, reconciles purely, and answers current menu regions", () => {
    const snap = debug.snapshot(h.state);
    expect(Object.keys(snap)).toHaveLength(21);
    expect(debug.reconcile(h.state)).toEqual(h.state);
    expect(debug.menuItemRect(h.state, 0)).toEqual({
      x: 460,
      y: 435,
      w: 360,
      h: 46,
    });
    expect(debug.menuItemRect(h.state, 2)).toBeNull();
    h.pose((s) => debug.setScreen(s, "playing"));
    expect(debug.menuItemRect(h.state, 0)).toBeNull();
    expect(() => debug.setMenuIndex(h.state, 1)).toThrow();
  });
  it("draws uniformly from every clear cell, ignoring the next pose", () => {
    const cells = validCells(h.state);
    const random = vi.spyOn(Math, "random");
    cells.forEach((expected, i) => {
      random.mockReturnValue((i + 0.5) / cells.length);
      expect(debug.drawPelletCell(h.state)).toEqual(expected);
    });
    random.mockRestore();
    expect(cells).toHaveLength(445);
  });
  it("consumes an invalid next pose at spawn and resets all driver switches", () => {
    h.pose((s) => debug.setNextPellet(s, 0, 0));
    play();
    expect(h.state.nextPellet).toBeNull();
    expect(h.state.pellet).not.toEqual({ col: 0, row: 0 });
    h.pose((s) => debug.clearPellet(s));
    expect(h.state.pellet).toBeNull();
    h.pose((s) => debug.setSnakeSteering(s, false));
    h.pose((s) => debug.setSnakeTravel(s, false));
    h.pose((s) => debug.setPelletRespawn(s, false));
    h.pose((s) => debug.reset(s));
    expect(debug.snapshot(h.state)).toEqual(debug.snapshot(harness().state));
  });
});
it("runs the actual game through the engine, loads native sprites, records drawing and exposes diagnostics", async () => {
  const canvas = createCanvas(1280, 720);
  const events = new EventTarget();
  const testGame: Game<CoilState, CoilDebugApi> = {
    ...game,
    initialize: (api) =>
      game.initialize({
        ...api,
        assets: {
          ...api.assets,
          loadImage: async (path) =>
            (await loadImage(`assets/${path}`)) as unknown as ImageBitmap,
        },
        // Node has no Web Audio. Only replace decoding, leaving the engine cue bus live.
        audio: {
          ...api.audio,
          load: async (cue) => {
            api.audio.define(cue, { freq: 440, durationMs: 40 });
          },
        },
      }),
  };
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: 1280,
    height: 720,
    background: BACKGROUND,
    game: testGame,
    clock: new ConstantClock(125),
    layout: C.LAYOUT,
    surface: {
      cssWidth: () => 1280,
      cssHeight: () => 720,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  engine.apply((s) => engine.debug.setScreen(s, "playing"));
  engine.startRecording();
  await engine.advance(2);
  const recording = engine.stopRecording();
  expect(engine.debug.snapshot(engine.state).ticks).toBe(2);
  expect(recording.frames).toHaveLength(2);
  expect(recording.ops.length).toBeGreaterThan(100);
  expect(
    engine.diagnostics().some((d) => d.name === "head" && d.value === "17, 8"),
  ).toBe(true);
  engine.destroy();
});

it("draws every screen, bite pose and bent chain without changing state", async () => {
  const paths = [
    ...C.SPRITE_PATHS.head,
    C.SPRITE_PATHS.body,
    C.SPRITE_PATHS.corner,
    C.SPRITE_PATHS.tail,
  ];
  const images = await Promise.all(
    paths.map(
      async (path) =>
        (await loadImage(`assets/${path}`)) as unknown as ImageBitmap,
    ),
  );
  const canvas = createCanvas(1280, 720);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  let s = initial({
    head: images.slice(0, 4),
    body: images[4],
    corner: images[5],
    tail: images[6],
  });
  s = debug.setSnake(s, [
    { col: 6, row: 6 },
    { col: 5, row: 6 },
    { col: 5, row: 7 },
    { col: 6, row: 7 },
    { col: 6, row: 8 },
    { col: 5, row: 8 },
    { col: 4, row: 8 },
    { col: 4, row: 7 },
  ]);
  s = {
    ...s,
    pellet: { col: 12, row: 6 },
    combo: 4,
    comboWindow: 2,
    simTime: 1,
    biteAt: 0.9,
    sparks: [{ col: 7, row: 6, time: 0.8 }],
  };
  const rendered = new Set<string>();
  for (const screen of C.SCREENS) {
    const posed = debug.setScreen(s, screen);
    const before = debug.snapshot(posed);
    game.render(posed, { ctx, frame: h.api.frame, viewport: h.api.viewport });
    expect(debug.snapshot(posed)).toEqual(before);
    rendered.add(canvas.toDataURL("image/png"));
  }
  expect(rendered.size).toBe(6);
  const unmuted = canvas.toDataURL("image/png");
  game.render(
    { ...s, screen: "cleared", muted: true },
    { ctx, frame: h.api.frame, viewport: h.api.viewport },
  );
  expect(canvas.toDataURL("image/png")).not.toBe(unmuted);
});

it("selects by a held touch and confirms only after lifting inside the same region", () => {
  const contact = {
    id: 7,
    x: 600,
    y: 515,
    device: "touch" as const,
    primary: true,
    buttons: ["primary" as const],
  };
  h.api.input.pointerContacts = () => [contact];
  h.api.input.pointerSamples = () => [
    { ...contact, type: "down", button: "primary" },
  ];
  h.step();
  expect(h.state.menuIndex).toBe(1);
  expect(h.state.screen).toBe("title");
  h.api.input.pointerContacts = () => [];
  h.api.input.pointerSamples = () => [
    { ...contact, type: "up", button: "primary", buttons: [] },
  ];
  h.step();
  expect(h.state.screen).toBe("howto");
  expect(h.state.titleIndex).toBe(1);
});

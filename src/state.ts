import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";

export interface CoilSnapshot {
  version: number;
  screen: C.Screen;
  menuIndex: number;
  titleIndex: number;
  mode: typeof C.MODE;
  score: number;
  best: number;
  combo: number;
  comboWindow: number;
  muted: boolean;
  ticks: number;
  simTime: number;
  dir: C.Direction;
  turns: readonly C.Direction[];
  snake: readonly C.Cell[];
  pellet: C.Cell | null;
  obstacles: readonly C.Cell[];
  steering: boolean;
  travel: boolean;
  pelletRespawn: boolean;
  nextPellet: C.Cell | null;
}
export interface Sprites {
  head: readonly ImageBitmap[];
  body: ImageBitmap;
  corner: ImageBitmap;
  tail: ImageBitmap;
}
export interface CoilState extends CoilSnapshot {
  sprites: Sprites;
  accumulator: number;
  biteAt: number;
  sparks: readonly { col: number; row: number; time: number }[];
  presses: Readonly<Record<string, { screen: C.Screen; index: number }>>;
}
export type ReadState = DeepReadonly<CoilState>;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function initial(sprites: Sprites, muted = false): CoilState {
  return {
    version: C.COIL_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    mode: C.MODE,
    score: 0,
    best: 0,
    combo: 1,
    comboWindow: 0,
    muted,
    ticks: 0,
    simTime: 0,
    dir: C.START_DIR,
    turns: [],
    snake: [...C.START_CELLS],
    pellet: null,
    obstacles: [],
    steering: true,
    travel: true,
    pelletRespawn: true,
    nextPellet: null,
    sprites,
    accumulator: 0,
    biteAt: -Infinity,
    sparks: [],
    presses: {},
  };
}
export function items(screen: C.Screen): readonly string[] {
  if (screen === "title") return C.TITLE_ITEMS;
  if (screen === "paused") return C.PAUSE_ITEMS;
  if (screen === "gameover" || screen === "cleared") return C.OVER_ITEMS;
  if (screen === "howto") return ["BACK"];
  return [];
}
export function menuRect(s: ReadState, index: number): Rect | null {
  integer(index);
  if (index >= items(s.screen).length) return null;
  return {
    x: 460,
    y:
      (s.screen === "howto" ? 596 : s.screen === "title" ? 435 : 410) +
      index * 58,
    w: 360,
    h: 46,
  };
}
export function same(a: C.Cell | null, b: C.Cell | null): boolean {
  return a !== null && b !== null && a.col === b.col && a.row === b.row;
}
export function interior(c: C.Cell): boolean {
  return (
    c.col >= C.INTERIOR_MIN_COL &&
    c.col <= C.INTERIOR_MAX_COL &&
    c.row >= C.INTERIOR_MIN_ROW &&
    c.row <= C.INTERIOR_MAX_ROW
  );
}
export function validCells(s: ReadState): C.Cell[] {
  const occupied = new Set(
    [...s.snake, ...s.obstacles, ...(s.pellet ? [s.pellet] : [])].map(
      (c) => `${c.col},${c.row}`,
    ),
  );
  const cells: C.Cell[] = [];
  for (let row = C.INTERIOR_MIN_ROW; row <= C.INTERIOR_MAX_ROW; row++) {
    for (let col = C.INTERIOR_MIN_COL; col <= C.INTERIOR_MAX_COL; col++) {
      if (!occupied.has(`${col},${row}`)) cells.push({ col, row });
    }
  }
  return cells;
}
export function drawPellet(s: ReadState): C.Cell | null {
  const cells = validCells(s);
  return cells[Math.floor(Math.random() * cells.length)] ?? null;
}
export function spawn(s: ReadState): CoilState {
  const valid = validCells(s);
  const pellet =
    valid.find((c) => same(c, s.nextPellet)) ??
    valid[Math.floor(Math.random() * valid.length)] ??
    null;
  return { ...s, pellet, nextPellet: null };
}
export function integer(n: number, max = Infinity): void {
  if (!Number.isInteger(n) || n < 0 || n > max)
    throw new RangeError("Expected a whole number in range");
}
function cell(col: number, row: number): C.Cell {
  integer(col, C.GRID_COLS - 1);
  integer(row, C.GRID_ROWS - 1);
  return { col, row };
}
function boolean(value: boolean): void {
  if (typeof value !== "boolean") throw new TypeError("Expected boolean");
}
function direction(dir: C.Direction): void {
  if (!C.DIRECTIONS.includes(dir)) throw new RangeError("Unknown direction");
}

export interface CoilDebugApi {
  version: number;
  reset(s: ReadState): CoilState;
  reconcile(s: ReadState): CoilState;
  snapshot(s: ReadState): CoilSnapshot;
  menuItemRect(s: ReadState, index: number): Rect | null;
  setScreen(s: ReadState, screen: C.Screen): CoilState;
  setMenuIndex(s: ReadState, index: number): CoilState;
  setScore(s: ReadState, points: number): CoilState;
  setBest(s: ReadState, points: number): CoilState;
  setCombo(s: ReadState, multiplier: number): CoilState;
  setComboWindow(s: ReadState, seconds: number): CoilState;
  setSnake(s: ReadState, cells: readonly C.Cell[]): CoilState;
  setDirection(s: ReadState, dir: C.Direction): CoilState;
  clearTurns(s: ReadState): CoilState;
  setSnakeSteering(s: ReadState, enabled: boolean): CoilState;
  setSnakeTravel(s: ReadState, enabled: boolean): CoilState;
  setPellet(s: ReadState, col: number, row: number): CoilState;
  clearPellet(s: ReadState): CoilState;
  setPelletRespawn(s: ReadState, enabled: boolean): CoilState;
  setNextPellet(s: ReadState, col: number, row: number): CoilState;
  drawPelletCell(s: ReadState): C.Cell | null;
}
export const debug: CoilDebugApi = {
  version: C.COIL_DEBUG_VERSION,
  reset: (s) => initial(s.sprites, s.muted),
  reconcile: (s) => ({ ...s }),
  snapshot(s) {
    const {
      version,
      screen,
      menuIndex,
      titleIndex,
      mode,
      score,
      best,
      combo,
      comboWindow,
      muted,
      ticks,
      simTime,
      dir,
      turns,
      snake,
      pellet,
      obstacles,
      steering,
      travel,
      pelletRespawn,
      nextPellet,
    } = s;
    return {
      version,
      screen,
      menuIndex,
      titleIndex,
      mode,
      score,
      best,
      combo,
      comboWindow,
      muted,
      ticks,
      simTime,
      dir,
      turns: [...turns],
      snake: snake.map((c) => ({ ...c })),
      pellet: pellet ? { ...pellet } : null,
      obstacles: obstacles.map((c) => ({ ...c })),
      steering,
      travel,
      pelletRespawn,
      nextPellet: nextPellet ? { ...nextPellet } : null,
    };
  },
  menuItemRect: menuRect,
  setScreen(s, screen) {
    if (!C.SCREENS.includes(screen)) throw new RangeError("Unknown screen");
    return { ...s, screen };
  },
  setMenuIndex(s, menuIndex) {
    integer(menuIndex, Math.max(0, items(s.screen).length - 1));
    return { ...s, menuIndex };
  },
  setScore(s, score) {
    integer(score);
    return { ...s, score };
  },
  setBest(s, best) {
    integer(best);
    return { ...s, best };
  },
  setCombo(s, combo) {
    integer(combo, C.COMBO_MAX);
    if (combo < 1) throw new RangeError("Combo starts at one");
    return { ...s, combo };
  },
  setComboWindow(s, comboWindow) {
    if (
      !Number.isFinite(comboWindow) ||
      comboWindow < 0 ||
      comboWindow > C.COMBO_WINDOW
    )
      throw new RangeError("Invalid combo window");
    return { ...s, comboWindow };
  },
  setSnake(s, cells) {
    if (!Array.isArray(cells) || cells.length === 0)
      throw new RangeError("Snake must have a head");
    const seen = new Set<string>();
    cells.forEach((c, i) => {
      cell(c.col, c.row);
      const key = `${c.col},${c.row}`;
      const prev = cells[i - 1];
      if (
        !interior(c) ||
        s.obstacles.some((o) => same(o, c)) ||
        seen.has(key) ||
        (prev && Math.abs(prev.col - c.col) + Math.abs(prev.row - c.row) !== 1)
      )
        throw new RangeError("Invalid snake chain");
      seen.add(key);
    });
    return { ...s, snake: cells.map((c) => ({ ...c })) };
  },
  setDirection(s, dir) {
    direction(dir);
    return { ...s, dir };
  },
  clearTurns: (s) => ({ ...s, turns: [] }),
  setSnakeSteering(s, steering) {
    boolean(steering);
    return { ...s, steering, turns: steering ? s.turns : [] };
  },
  setSnakeTravel(s, travel) {
    boolean(travel);
    return { ...s, travel };
  },
  setPellet(s, col, row) {
    const pellet = cell(col, row);
    if (
      !interior(pellet) ||
      [...s.snake, ...s.obstacles].some((c) => same(c, pellet))
    )
      throw new RangeError("Pellet cell occupied or outside interior");
    return { ...s, pellet };
  },
  clearPellet: (s) => ({ ...s, pellet: null }),
  setPelletRespawn(s, pelletRespawn) {
    boolean(pelletRespawn);
    return { ...s, pelletRespawn };
  },
  setNextPellet: (s, col, row) => ({ ...s, nextPellet: cell(col, row) }),
  drawPelletCell: drawPellet,
};

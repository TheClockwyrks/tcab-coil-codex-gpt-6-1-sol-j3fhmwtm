import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import {
  initial,
  interior,
  items,
  menuRect,
  same,
  spawn,
  type CoilState,
  type ReadState,
} from "./state";

const vectors: Record<C.Direction, C.Cell> = {
  right: { col: 1, row: 0 },
  left: { col: -1, row: 0 },
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
};
export function start(s: ReadState, api: UpdateApi): CoilState {
  const fresh = initial(s.sprites, s.muted);
  const next = spawn({
    ...fresh,
    screen: "playing",
    best: s.best,
    titleIndex: s.titleIndex,
    ticks: s.ticks,
    simTime: s.simTime,
    nextPellet: s.nextPellet,
    steering: s.steering,
    travel: s.travel,
    pelletRespawn: s.pelletRespawn,
    obstacles: [...C.OBSTACLE_CELLS],
  });
  api.audio.loop(C.CUES.music);
  return next;
}
function screen(s: ReadState, screen: C.Screen): CoilState {
  return {
    ...s,
    screen,
    menuIndex: screen === "title" ? s.titleIndex : 0,
    presses: {},
  };
}
function title(s: ReadState, api: UpdateApi): CoilState {
  api.audio.stop(C.CUES.music);
  return screen(s, "title");
}
function confirm(s: ReadState, api: UpdateApi): CoilState {
  if (s.screen === "title") {
    const next = { ...s, titleIndex: s.menuIndex };
    return s.menuIndex === 0 ? start(next, api) : screen(next, "howto");
  }
  if (s.screen === "howto") return title(s, api);
  if (s.screen === "paused") {
    if (s.menuIndex === 0) return screen(s, "playing");
    return s.menuIndex === 1 ? start(s, api) : title(s, api);
  }
  if (s.screen === "gameover" || s.screen === "cleared")
    return s.menuIndex === 0 ? start(s, api) : title(s, api);
  return { ...s };
}
function tick(state: ReadState, api: UpdateApi): CoilState {
  let s: CoilState = { ...state, ticks: state.ticks + 1 };
  if (s.steering && s.turns.length) {
    const [turn, ...turns] = s.turns;
    const horizontal = (d: C.Direction) => d === "left" || d === "right";
    s = {
      ...s,
      dir: horizontal(turn) !== horizontal(s.dir) ? turn : s.dir,
      turns,
    };
  }
  if (s.travel) {
    const head = s.snake[0];
    const v = vectors[s.dir];
    const next = { col: head.col + v.col, row: head.row + v.row };
    const eat = same(next, s.pellet);
    const solid = eat ? s.snake : s.snake.slice(0, -1);
    if (
      !interior(next) ||
      s.obstacles.some((c) => same(c, next)) ||
      solid.some((c) => same(c, next))
    ) {
      api.audio.play(C.CUES.death);
      api.audio.stop(C.CUES.music);
      return { ...screen(s, "gameover"), accumulator: 0 };
    }
    s = { ...s, snake: [next, ...(eat ? s.snake : s.snake.slice(0, -1))] };
    if (eat) {
      const combo = s.comboWindow > 0 ? Math.min(C.COMBO_MAX, s.combo + 1) : 1;
      api.audio.play(C.CUES.eat);
      if (combo > s.combo) api.audio.play(C.CUES.comboUp);
      s = {
        ...s,
        combo,
        score: s.score + C.PELLET_POINTS * combo,
        comboWindow: C.COMBO_WINDOW,
        pellet: null,
        biteAt: s.simTime - s.accumulator,
        sparks: [...s.sparks, { ...next, time: s.simTime - s.accumulator }],
      };
      if (s.pelletRespawn) {
        s = spawn(s);
        if (!s.pellet) {
          api.audio.stop(C.CUES.music);
          s = { ...screen(s, "cleared"), accumulator: 0 };
        }
      }
    }
  }
  const comboWindow = Math.max(0, s.comboWindow - C.TICK_SECONDS);
  return {
    ...s,
    comboWindow,
    combo: comboWindow === 0 ? 1 : s.combo,
    best: Math.max(s.best, s.score),
  };
}
export function update(
  state: ReadState,
  api: UpdateApi,
  dt: number,
): CoilState {
  let s: CoilState = { ...state };
  const edges = Object.fromEntries(
    C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
  );
  const samples = api.input.pointerSamples();
  const contacts = api.input.pointerContacts();
  const pointer = api.input.pointer();
  if (edges.mute) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  if (s.screen === "playing") {
    if (edges.back || edges.pause) s = screen(s, "paused");
    else if (s.steering) {
      for (const dir of C.DIRECTIONS) {
        if (edges[dir] && s.turns.length < C.TURN_QUEUE_MAX)
          s = { ...s, turns: [...s.turns, dir] };
      }
    }
  } else {
    const count = items(s.screen).length;
    if (edges.up) s.menuIndex = (s.menuIndex + count - 1) % count;
    if (edges.down) s.menuIndex = (s.menuIndex + 1) % count;
    if ((edges.back || edges.pause) && s.screen === "paused")
      s = screen(s, "playing");
    else if (edges.back && s.screen !== "title") s = title(s, api);
    else if (edges.confirm) s = confirm(s, api);
  }
  if (s.screen !== "playing") {
    const hit = (x: number, y: number) =>
      items(s.screen).findIndex((_, i) => {
        const r = menuRect(s, i)!;
        return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      });
    // Hover is resolved from this frame's samples, not a stationary old pointer,
    // so keyboard navigation remains selected until the pointer moves again.
    const presses = { ...s.presses };
    for (const sample of samples) {
      if (sample.device !== "touch" && !sample.primary) continue;
      if (sample.button && sample.button !== "primary") continue;
      const index = hit(sample.x, sample.y);
      if (index >= 0) s.menuIndex = index;
      const key = String(sample.id);
      if (sample.type === "down") {
        if (index >= 0) presses[key] = { screen: s.screen, index };
        else delete presses[key];
      }
      if (sample.type === "up") {
        const press = presses[key];
        delete presses[key];
        if (press && press.screen === s.screen && press.index === index) {
          s.menuIndex = index;
          s = confirm(s, api);
          break;
        }
      }
    }
    for (const contact of contacts) {
      const index = hit(contact.x, contact.y);
      if (index >= 0) s.menuIndex = index;
    }
    // Reading the snapshot once also covers a pointer whose first motion was
    // delivered without a sample by a custom engine surface.
    void pointer;
    s = { ...s, presses: s.screen === "playing" ? {} : presses };
  }
  if (s.screen === "playing") {
    s = { ...s, simTime: s.simTime + dt, accumulator: s.accumulator + dt };
    while (s.accumulator + 1e-10 >= C.TICK_SECONDS && s.screen === "playing") {
      s = tick(
        { ...s, accumulator: Math.max(0, s.accumulator - C.TICK_SECONDS) },
        api,
      );
    }
    s = { ...s, sparks: s.sparks.filter((p) => s.simTime - p.time < 0.65) };
  }
  if (s.screen !== "playing" && s.screen !== "paused")
    api.audio.stop(C.CUES.music);
  return { ...s, best: Math.max(s.best, s.score) };
}

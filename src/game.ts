import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { debug, initial, type CoilState, type CoilDebugApi } from "./state";
import { update } from "./simulation";
import { render } from "./presentation";
export { BACKGROUND } from "./presentation";
export type { CoilState, CoilDebugApi } from "./state";

export const game: Game<CoilState, CoilDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    const paths = [
      ...C.SPRITE_PATHS.head,
      C.SPRITE_PATHS.body,
      C.SPRITE_PATHS.corner,
      C.SPRITE_PATHS.tail,
    ];
    const [images] = await Promise.all([
      Promise.all(paths.map((path) => api.assets.loadImage(path))),
      Promise.all(
        Object.values(C.CUES).map((cue) =>
          api.audio.load(cue, C.CUE_PATHS[cue]),
        ),
      ),
    ]);
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("score", (s) => s.score);
    api.diagnostics.register("best", (s) => s.best);
    api.diagnostics.register("combo", (s) => s.combo);
    api.diagnostics.register("window", (s) => s.comboWindow);
    api.diagnostics.register("direction", (s) => s.dir);
    api.diagnostics.register("length", (s) => s.snake.length);
    api.diagnostics.register(
      "head",
      (s) => `${s.snake[0].col}, ${s.snake[0].row}`,
    );
    api.diagnostics.register("pellet", (s) =>
      s.pellet ? `${s.pellet.col}, ${s.pellet.row}` : "none",
    );
    return [
      initial({
        head: images.slice(0, C.HEAD_FRAMES),
        body: images[4],
        corner: images[5],
        tail: images[6],
      }),
      debug,
    ];
  },
  update,
  render,
};

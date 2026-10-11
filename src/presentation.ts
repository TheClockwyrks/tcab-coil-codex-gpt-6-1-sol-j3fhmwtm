import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { items, menuRect, type ReadState } from "./state";

export const BACKGROUND = "#060e18";
const mint = "#75ffce";
const white = "#e5f9f5";
const muted = "#68918f";
const amber = "#ffd485";
const mono = '"Courier New", monospace';
const sans = '"Arial", sans-serif';

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color = white,
  align: CanvasTextAlign = "left",
  family = mono,
): void {
  ctx.font = `${family === sans ? "700" : "400"} ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function sprite(
  ctx: CanvasRenderingContext2D,
  image: ImageBitmap,
  col: number,
  row: number,
  angle: number,
): void {
  ctx.save();
  ctx.translate(
    C.BOARD_X + col * C.CELL + C.CELL / 2,
    C.BOARD_Y + row * C.CELL + C.CELL / 2,
  );
  ctx.rotate(angle);
  ctx.drawImage(image, -C.CELL / 2, -C.CELL / 2);
  ctx.restore();
}
const angles = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
function board(s: ReadState, ctx: CanvasRenderingContext2D): void {
  const w = C.GRID_COLS * C.CELL,
    h = C.GRID_ROWS * C.CELL;
  ctx.fillStyle = "#081921";
  ctx.fillRect(C.BOARD_X, C.BOARD_Y, w, h);
  for (let row = 0; row < C.GRID_ROWS; row++) {
    for (let col = 0; col < C.GRID_COLS; col++) {
      const x = C.BOARD_X + col * C.CELL,
        y = C.BOARD_Y + row * C.CELL;
      const wall =
        row === 0 ||
        col === 0 ||
        row === C.GRID_ROWS - 1 ||
        col === C.GRID_COLS - 1;
      if (wall) {
        ctx.fillStyle = "#12343d";
        ctx.fillRect(x + 1, y + 1, 30, 30);
        ctx.fillStyle = "#1e5257";
        ctx.fillRect(x + 4, y + 4, 24, 2);
        ctx.fillStyle = "#183e47";
        ctx.fillRect(x + 4, y + 8, 2, 20);
        ctx.fillStyle = "#4d9b90";
        ctx.fillRect(x + 14, y + 14, 4, 4);
      } else {
        ctx.strokeStyle = "#112a32";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, 32, 32);
        ctx.fillStyle = "#264047";
        ctx.fillRect(x + 15, y + 15, 1, 1);
      }
    }
  }
  ctx.strokeStyle = "#397d77";
  ctx.lineWidth = 1;
  ctx.strokeRect(C.BOARD_X - 0.5, C.BOARD_Y - 0.5, w + 1, h + 1);
  // Corner brackets give the whole playing field a precise instrument frame.
  for (const [x, y, dx, dy] of [
    [C.BOARD_X - 7, C.BOARD_Y - 7, 1, 1],
    [C.BOARD_X + w + 7, C.BOARD_Y - 7, -1, 1],
    [C.BOARD_X - 7, C.BOARD_Y + h + 7, 1, -1],
    [C.BOARD_X + w + 7, C.BOARD_Y + h + 7, -1, -1],
  ]) {
    line(ctx, x, y, x + dx * 24, y, mint);
    line(ctx, x, y, x, y + dy * 24, mint);
  }
  for (const o of s.obstacles) {
    const x = C.BOARD_X + o.col * C.CELL,
      y = C.BOARD_Y + o.row * C.CELL;
    ctx.fillStyle = "#84494b";
    ctx.fillRect(x + 2, y + 2, 28, 28);
    line(ctx, x + 5, y + 5, x + 27, y + 27, amber);
    line(ctx, x + 27, y + 5, x + 5, y + 27, amber);
  }
  if (s.pellet) {
    const x = C.BOARD_X + s.pellet.col * C.CELL + 16,
      y = C.BOARD_Y + s.pellet.row * C.CELL + 16;
    const pulse = 1 + Math.sin(s.simTime * 6) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
    glow.addColorStop(0, "#ffcd6250");
    glow.addColorStop(1, "#ffcd6200");
    ctx.fillStyle = glow;
    ctx.fillRect(-22, -22, 44, 44);
    ctx.strokeStyle = "#bb8749";
    ctx.lineWidth = 1;
    ctx.strokeRect(-12, -12, 24, 24);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = amber;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = "#fff4c8";
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }
  ctx.imageSmoothingEnabled = false;
  for (let i = s.snake.length - 1; i >= 0; i--) {
    const c = s.snake[i];
    if (i === 0) {
      const elapsed = s.simTime - s.biteAt;
      const frame =
        elapsed >= 0 && elapsed < C.BITE_SECONDS
          ? 1 + Math.min(2, Math.floor(elapsed / (C.BITE_SECONDS / 3)))
          : 0;
      sprite(ctx, s.sprites.head[frame], c.col, c.row, angles[s.dir]);
    } else if (i === s.snake.length - 1) {
      const prev = s.snake[i - 1];
      sprite(
        ctx,
        s.sprites.tail,
        c.col,
        c.row,
        Math.atan2(prev.row - c.row, prev.col - c.col),
      );
    } else {
      const a = s.snake[i - 1],
        b = s.snake[i + 1];
      if (a.col === b.col || a.row === b.row)
        sprite(
          ctx,
          s.sprites.body,
          c.col,
          c.row,
          a.col === b.col ? Math.PI / 2 : 0,
        );
      else {
        const dirs = [
          { x: a.col - c.col, y: a.row - c.row },
          { x: b.col - c.col, y: b.row - c.row },
        ];
        const right = dirs.some((d) => d.x === 1),
          down = dirs.some((d) => d.y === 1);
        const angle = right
          ? down
            ? 0
            : -Math.PI / 2
          : down
            ? Math.PI / 2
            : Math.PI;
        sprite(ctx, s.sprites.corner, c.col, c.row, angle);
      }
    }
  }
  for (const p of s.sparks) {
    const age = s.simTime - p.time;
    if (age < 0 || age > 0.65) continue;
    const x = C.BOARD_X + p.col * C.CELL + 16,
      y = C.BOARD_Y + p.row * C.CELL + 16;
    ctx.save();
    ctx.globalAlpha = 1 - age / 0.65;
    ctx.strokeStyle = amber;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 12 + age * 55, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5,
        dist = 12 + age * 90;
      ctx.fillStyle = i % 2 ? mint : amber;
      ctx.fillRect(
        x + Math.cos(angle) * dist - 2,
        y + Math.sin(angle) * dist - 2,
        3,
        3,
      );
    }
    ctx.restore();
  }
}
function hud(s: ReadState, ctx: CanvasRenderingContext2D): void {
  text(ctx, C.TITLE_TEXT, 160, 44, 25, mint, "left", sans);
  text(ctx, C.MODE_LABEL, 160, 79, 13, muted);
  text(ctx, C.SCORE_LABEL, 360, 37, 13, muted);
  text(ctx, String(s.score).padStart(4, "0"), 360, 82, 38, white);
  text(ctx, C.BEST_LABEL, 540, 37, 13, muted);
  text(ctx, String(s.best).padStart(4, "0"), 540, 82, 38, white);
  if (s.combo >= 2) {
    text(ctx, `x${s.combo}`, 764, 68, 40, amber);
    text(ctx, "CHAIN", 840, 38, 12, muted);
    ctx.fillStyle = "#263536";
    ctx.fillRect(840, 58, 120, 5);
    ctx.fillStyle = amber;
    ctx.fillRect(840, 58, (120 * s.comboWindow) / C.COMBO_WINDOW, 5);
    text(ctx, `${s.comboWindow.toFixed(1)}s`, 840, 85, 13, amber);
  }
  text(
    ctx,
    s.muted ? "M / MUTED" : "M / SOUND ON",
    1120,
    39,
    12,
    s.muted ? amber : muted,
    "right",
  );
  text(ctx, "P / PAUSE", 1120, 79, 12, muted, "right");
  line(ctx, 160, 100, 1120, 100, "#1b383d");
}
function menu(s: ReadState, ctx: CanvasRenderingContext2D): void {
  for (const [i, label] of items(s.screen).entries()) {
    const r = menuRect(s, i)!;
    const selected = i === s.menuIndex;
    ctx.fillStyle = selected ? "#153d3d" : "#0a2029";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = selected ? mint : "#224049";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (selected) {
      ctx.fillStyle = mint;
      ctx.fillRect(r.x, r.y, 3, r.h);
    }
    text(
      ctx,
      selected ? ">" : "·",
      r.x + 20,
      r.y + 30,
      20,
      selected ? mint : muted,
    );
    text(
      ctx,
      label,
      r.x + r.w / 2,
      r.y + 30,
      17,
      selected ? white : muted,
      "center",
    );
    if (selected) text(ctx, "↵", r.x + r.w - 25, r.y + 30, 18, mint, "center");
  }
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = "#06131af2";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#315757";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = mint;
  ctx.fillRect(x, y, 60, 2);
  ctx.fillRect(x + w - 60, y + h - 2, 60, 2);
}
export function render(s: ReadState, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  const background = ctx.createLinearGradient(0, 0, 0, C.STAGE_H);
  background.addColorStop(0, "#0b1a24");
  background.addColorStop(1, BACKGROUND);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  text(ctx, "01", 58, 148, 12, muted);
  line(ctx, 72, 166, 72, 647, "#19363d");
  text(ctx, "08", 58, 670, 12, muted);
  ctx.save();
  ctx.translate(1215, 420);
  ctx.rotate(-Math.PI / 2);
  text(ctx, "COIL  /  CLASSIC  /  8 Hz", 0, 0, 12, muted, "center");
  ctx.restore();
  board(s, ctx);
  if (
    s.screen === "playing" ||
    s.screen === "paused" ||
    s.screen === "gameover" ||
    s.screen === "cleared"
  )
    hud(s, ctx);
  if (s.screen !== "playing") {
    ctx.fillStyle = "#060e18b8";
    ctx.fillRect(
      C.BOARD_X,
      C.BOARD_Y,
      C.GRID_COLS * C.CELL,
      C.GRID_ROWS * C.CELL,
    );
    if (s.screen === "title") {
      panel(ctx, 395, 184, 490, 414);
      text(ctx, "ARCADE SYSTEM / 01", 640, 225, 12, muted, "center");
      ctx.save();
      ctx.shadowColor = "#57ffc9";
      ctx.shadowBlur = 25;
      text(ctx, C.TITLE_TEXT, 640, 337, 112, mint, "center", sans);
      ctx.restore();
      text(
        ctx,
        C.TAGLINE_TEXT.split("").join(" "),
        640,
        369,
        17,
        white,
        "center",
      );
      line(ctx, 460, 394, 820, 394, "#29494e");
      text(
        ctx,
        `${C.BEST_LABEL}  ${String(s.best).padStart(4, "0")}`,
        640,
        418,
        13,
        amber,
        "center",
      );
      text(
        ctx,
        "A SMALL GRID. AN ENDLESS APPETITE.",
        640,
        566,
        11,
        muted,
        "center",
      );
      text(
        ctx,
        "↑ ↓ SELECT     ENTER PLAY     M SOUND",
        640,
        642,
        13,
        muted,
        "center",
      );
    } else if (s.screen === "howto") {
      panel(ctx, 320, 156, 640, 508);
      text(ctx, "FIELD MANUAL / 01", 640, 193, 12, muted, "center");
      text(ctx, "HOW TO PLAY", 640, 240, 34, mint, "center", sans);
      const paragraphs = [
        [
          "KEEP MOVING",
          "The serpent never stops. A turn lands on the next tick.",
        ],
        [
          "TURN, DON'T REVERSE",
          "Steer at right angles. You cannot double back.",
        ],
        [
          "FEED THE CHAIN",
          "Each pellet adds one cell. Walls and your body are fatal.",
        ],
        [
          "STAY HUNGRY",
          "Eat again within 3.5s to build x2–x5. Wait, and it falls to x1.",
        ],
      ];
      paragraphs.forEach(([heading, body], i) => {
        text(ctx, heading, 355, 285 + i * 63, 13, amber);
        text(ctx, body, 355, 308 + i * 63, 14, white);
      });
      text(
        ctx,
        "ARROWS / WASD  steer     ENTER / SPACE  confirm",
        355,
        551,
        14,
        muted,
      );
      text(
        ctx,
        "ESC  back / pause     P  pause     M  mute",
        355,
        575,
        14,
        muted,
      );
    } else {
      const pause = s.screen === "paused";
      panel(ctx, 395, 236, 490, pause ? 378 : 326);
      text(
        ctx,
        pause ? "SIGNAL HELD" : "ROUND COMPLETE",
        640,
        278,
        12,
        muted,
        "center",
      );
      text(
        ctx,
        pause
          ? "PAUSED"
          : s.screen === "cleared"
            ? C.CLEARED_TEXT
            : C.GAMEOVER_TEXT,
        640,
        327,
        s.screen === "cleared" ? 35 : 43,
        pause ? mint : amber,
        "center",
        sans,
      );
      if (pause)
        text(
          ctx,
          "TAKE A BREATH. KEEP YOUR EDGE.",
          640,
          373,
          12,
          muted,
          "center",
        );
      else {
        text(
          ctx,
          `${C.SCORE_LABEL}  ${s.score}`,
          535,
          380,
          18,
          white,
          "center",
        );
        text(ctx, `${C.BEST_LABEL}  ${s.best}`, 745, 380, 18, mint, "center");
      }
    }
    menu(s, ctx);
  }
  ctx.restore();
}

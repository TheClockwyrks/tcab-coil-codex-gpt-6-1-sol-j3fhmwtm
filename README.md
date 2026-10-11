# Coil

A neon grid serpent for the browser. Steer a continuous pixel-art coil around a
bordered arena, gather amber pellets, and chain meals within 3.5 seconds to build
a multiplier up to x5. One collision ends the round. Your best score stays with
you for the session.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the local address Vite prints. Everything runs in the browser; no accounts,
backend, or external services are needed.

## Build

```sh
npm run build
npm run preview
```

Deploy `dist/` to a static host, at its root or under a subdirectory. The build
bundles the committed sprites and audio through `public/assets/` symlinks.
It requires no asset-generation tools. All fonts are system fonts.

## Controls

| Action | Keys |
| --- | --- |
| Steer / select | Arrow keys or WASD |
| Confirm | Enter or Space |
| Pause / resume | P or Escape |
| Back | Escape |
| Toggle sound | M |
| Diagnostics | Backtick |

Only perpendicular turns are accepted; two requests can wait in the turn buffer.
Menus also accept mouse and touch. Touch activates the engine's on-screen pad.
Sound unlocks on your first interaction. Pausing freezes play but keeps the quiet
music bed running.

## Verify

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests cover timing, steering, scoring, collision, board clearing, menu input,
debug validation, pellet sampling, and an engine-driven render/recording scenario.
The debug API is returned only through `engine.debug`; nothing is exposed on the
normal game page. It supports immutable poses and snapshots for automation.

## Assets and showcase

`assets/snake/` contains seven authored 32×32 transparent pixel sprites, including
a four-frame bite. `assets/audio/` contains three synth cues and an eight-bar
music loop. Their one-time authoring script and operation logs live in
`assets/authoring/`. To regenerate them in an environment with the generation
binaries, run `python3 assets/authoring/generate.py`. This is independent of the
application build.

`showcase/` includes a four-second engine drawing replay and browser captures.
To reproduce them with the development server running, use
`node scripts/capture.mjs`; Playwright's Chromium must be installed.

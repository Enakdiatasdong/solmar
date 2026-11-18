# Expansion C4 verification

The feature logic was exercised on 2026-11-18 with Node 24, the real game modules, three.js scene/math, and a minimal DOM harness. The harness does not provide WebGL, Chrome, CDP, or image capture.

## Runtime results

- Asset: bought `sunset-mart` for `$2,500`; cash `$7,500 -> $7,570` after 61 one-second updates, exactly `$70` income; rate `$70/min`.
- Restaurant: `casa-marea`, health `40 -> 55`, cash `$7,570 -> $7,561` (exactly `$9`), meals eaten `1`.
- Safehouse: bought `marina-loft` for `$5,000`; active respawn `{x:252,z:-108}`; outfit `crimson -> teal -> gold`; v3 save contained the owned asset, both safehouses, outfit `gold`, and `mealsEaten: 1`; `startRun(true)` restored those values.
- Place menus: restaurant rendered 3 rows; keyboard meal selection produced health `55 -> 85` and cash `$15,000 -> $14,970`; Escape closed the menu while the game remained playing; a simulation step left the menu position unchanged. Safehouse row 3 restored health to `100`; row 4 changed the outfit to `violet`.
- Respawn: game-over restart and busted release both returned to `{x:252,z:-108}`; busted health was `75` and the owned asset remained owned.
- Fresh shot staging: `start`, `play`, and `end` each reset assets to `0`, meals to `0`, safehouses to `[garage-flat]`, outfit to `crimson`, and respawn to `{x:-1.2,z:96}`. These are staging checks only.
- Save validation: v2 migration retained cash `4321`, mission `first-fare`, best `75`, muted `true`, and seed `1234`; new fields defaulted to empty/default values. Nine corrupt or denied-storage cases and five nearest-place cases passed.

The complete machine-readable output is `/tmp/solmar-c4-verify.4l2aU7/final-logic-output.json`.

## Static checks

`node --check` passed for every changed JavaScript module: `places.js`, `config.js`, `player.js`, `assets.js`, `restaurants.js`, `safehouses.js`, `save.js`, `hud.js`, `main.js`, `shots.js`, and `world.js`. Python `HTMLParser` accepted `game/index.html`, and `git diff --check` passed.

The reserved-term scan over `game/` returned zero hits. The existing base history contains one older starter subject with a prohibited project nickname; no new commit subject was created.

## Browser check blocker

`node serve.ts --port 8914` could not bind `127.0.0.1:8914` (`EPERM`, operation not permitted). The requested headless Chrome exited before opening its debugging port; its log reports Crashpad `setsockopt: Operation not permitted` and exit code `133`. Therefore `window.__shotReady`, `window.__gameError`, CDP runtime proof, and screenshots could not be obtained in this sandbox. No screenshots were fabricated or added.

## Git check blocker

The linked worktree index is outside the writable workspace. `git add` failed with `Read-only file system` while creating its lock file, so the requested four commits and a clean status could not be produced here. All source changes remain in the worktree for review.

## ADDENDUM — browser verification by the parent subagent (2026-11-19 ~01:40 WIB)

The EPERM/Crashpad failures above were sandbox limits of the Codex session, not of the game. From the parent subagent shell the same steps worked:

- Serve: `node serve.ts --port 8914` bound fine, `curl http://127.0.0.1:8914/` → 200.
- Headless Chrome: `chrome-headless-shell` (puppeteer cache, 157.0.8103.50) with `--remote-debugging-port=9223` + a Node CDP script (global WebSocket): `?shot=start`, `?shot=play`, `?shot=end` all returned `{"shotReady":true,"gameError":null}`.
- Live-page runtime proof (normal load, `window.__solmar.startRun(false)`, CDP `Runtime.evaluate`):
  - Asset: bought `sunset-mart` $2,500; cash `$7,500 -> $7,570` after 61×1s `assets.update(1)` — exactly `+$70`; `ownedIncomePerMin()=70`; HUD income line `"$70/min · 1 assets"`.
  - Restaurant: `casa-marea` item 0, health `40 -> 55` (+15), cash `-$9`, `mealsEaten=1`.
  - Safehouse: bought `marina-loft` $5,000; `setActiveRespawn` → respawn `{x:252,z:-108}`; outfit `crimson -> teal -> gold`; `saveGame` wrote `solmar.save.v3` with `assets:["sunset-mart"]`, `safehouses:{owned:["garage-flat","marina-loft"],respawnId:"marina-loft",outfit:"gold"}`, `mealsEaten:1`, `version:3`.
  - Minimap blips: assets 4, restaurants 4, safehouses 3.
- Screenshots (real renders, 1280×720): `screenshots-c4/start.jpg` (50 KB), `screenshots-c4/play.jpg` (76 KB), `screenshots-c4/end.jpg` (69 KB) — play shot visually confirmed: 3D city, car, HUD, minimap with coloured blips.
- `node --check` re-run by the parent subagent: all 11 changed/created JS modules pass. Reserved-term grep over `game/`: zero hits.

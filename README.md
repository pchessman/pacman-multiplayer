# Pac-Man Versus

A two-player, one-keyboard take on the 1980 arcade classic. In **VS Ghost** mode one player is Pac-Man and the other plays Blinky the ghost. In **Co-op** mode both players are Pac-Men (Pac-Man and Ms. Pac-Man) working together against the AI ghosts. Everything is drawn in 8-bit pixel art on the original 28×31 maze, with flashing power pellets, blue frightened ghosts, a flashing maze when a level is cleared, and chase lights around the cabinet bezel.

## Play

Open `index.html` in any modern browser. There's no build step and no server to run, and it works offline because the font is bundled.

| Player | Controls |
| --- | --- |
| Pac-Man (P1) | `W` `A` `S` `D` |
| Ghost or Ms. Pac-Man (P2) | Arrow keys |
| Both | `P` / `Esc` pause, `M` mute, `F` fullscreen, `Enter` start / rematch, `T` load a theme song (title screen) |

Turns are buffered, so you can press a direction early and the character takes it at the next opening.

## Rules

- **Endless (default).** Levels never stop. The ghost's job is to end the run, and Pac-Man's is to get as far as possible. The results screen shows the level reached and your best ever. Unlike the arcade, there's no level-256 "split screen" crash, so the game keeps going.
- **Level goal (optional).** Set 1–10 levels on the title screen for a head-to-head match. Pac-Man wins by clearing that many levels, and the ghost wins by taking all his lives. These matches count toward the series score.
- Every ghost, including the one player 2 steers, moves at the arcade's ghost speed: 75% on level 1, rising to 95% by level 5. That's a little slower than Pac-Man's 80%, but Pac-Man loses a frame for every dot he eats, which drops him to about 71% while he's eating. Ghosts also slow down in the side tunnels, as in the arcade. The Ghost Speed option can adjust all of this.
- Power pellets turn ghosts blue and slow them down. Eaten ghosts float back to the house as eyes and respawn.
- Dots are 10 points, pellets 50, ghosts 200 / 400 / 800 / 1600 in a chain. You get one extra life at 10,000 points.

## Arcade mechanics

These follow the 1980 original:

- **The maze is the arcade's, tile for tile.** It has 240 dots and 4 power pellets, plus the side tunnels and the ghost house.
- **No-up zones.** Ghosts can't turn upward on the four tiles just above and below the ghost house, unless they're frightened. That rule applies to the player ghost too, so Pac-Man can use those corridors to shake a pursuer.
- **Cruise Elroy.** When few dots are left, the red ghost speeds up in two stages. The HUD shows `ELROY` and the siren speeds up.
- **Cornering.** Pac-Man can turn a few pixels early or late and cut the corner diagonally. Ghosts can't.
- **Eating slows you down.** Pac-Man pauses for a frame on every dot and three frames on a power pellet.
- **Ghost-house release** uses the arcade's per-ghost dot counters. After a death they switch to a shared counter, and a ghost is also released if Pac-Man stops eating for a few seconds.
- **Speeds match the arcade table.** They're measured in-game against the Pac-Man Dossier at levels 1, 2, 5 and 21, and come out within 1% for Pac-Man (with and without dots, and frightened), ghosts, tunnels, frightened ghosts and both Elroy stages.
- **Per-level tables.** Speeds, fright time and flash count, scatter/chase timing, Elroy thresholds and fruit all change by level.
- **AI ghosts** (optional) use the classic targeting, including Pinky's and Inky's famous "up" bug.
- **Fruit** appears below the ghost house after 70 and 170 dots and stays 9–10 seconds. Each level has one fixed fruit, and some repeat. The counter in the bottom right shows the current level's fruit plus the previous six, like the arcade. A new fruit kind first appears on levels 1, 2, 3, 5, 7, 9, 11 and 13. Fruit you haven't reached yet shows as a locked silhouette on the title screen, and a `NEW FRUIT` callout appears when you reach one.

  | Fruit | Cherry | Strawberry | Orange | Apple | Melon | Galaxian | Bell | Key |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Levels | 1 | 2 | 3–4 | 5–6 | 7–8 | 9–10 | 11–12 | 13+ |
  | Points | 100 | 300 | 500 | 700 | 1000 | 2000 | 3000 | 5000 |

- **Intermissions** play after levels 2, 5 and 9, then 13 and 17. Press Enter to skip.

## Versus extras

- **Bonus treats.** These aren't in the arcade original. An ice cream, cupcake, donut or lollipop wanders in through a tunnel after 120 and 200 dots and roams the maze. Pac-Man eats it for 800–2000 points. If the ghost grabs it first, the ghost gets a 4-second **sugar rush** speed boost and the bezel lights turn pink.
- **Match stats and series score** appear on the game-over screen, and a running Pac-Man vs Ghost tally carries across rematches.
- **The board fills the window** and stays sharp at any size. Press F for fullscreen. The maze walls are drawn at arcade scale with hard pixel edges, so the curves step slightly like the original's tile graphics.
- **Light on the CPU.** The walls and dots are baked into one layer that's copied once per frame, eaten dots are erased individually, and the bezel lights animate on the GPU. Pausing also freezes all sound, music included.

## Co-op mode

Pac-Man (WASD) and Ms. Pac-Man (arrows) start on either side of the arcade start spot and clear the maze together. Each AI ghost hunts whichever of them is closer. Two title-screen options set how you share:

- **Lives pool**
  - *Separate:* each player has their own lives. A player who runs out sits out, and the other keeps going until they're out too.
  - *Shared:* both players draw from one pool, double the LIVES setting. The game ends when it's empty.
- **Points**
  - *Separate:* each player keeps their own score, shown left and right at the top.
  - *Shared:* both players add to one team score. The 10,000-point extra life follows the same rule, so each player earns their own or the team earns one.

## Extra ghost

Turning on **Extra Ghost** adds a fifth, green ghost (not in the arcade). It slips in through a side tunnel 8 seconds into each round. From far away it heads straight for Pac-Man, and up close it aims a few tiles *behind* him to cut off his escape. It works in both modes.

## Theme song

The game can play a theme song you supply, on the title screen and through the opening "READY!". It fades out when play starts.

- **Running from the folder:** put an MP3 at `sounds/theme.mp3`. The `sounds/` folder is git-ignored, so copyrighted music never ends up in the repository.
- **Anywhere, including the playable link:** press `T` on the title screen and pick an audio file. It's checked (see Security), saved only in your browser, and reused next time.

## Options (title screen)

| Option | Values |
| --- | --- |
| Mode | VS Ghost or Co-op |
| Ghost Speed | All ghosts, from −30% to +50% of arcade speed. The default, NORMAL, is the real arcade speed table |
| AI Ghosts (VS) / Ghosts (co-op) | VS: 0–3 extra AI ghosts. Co-op: 1–4 AI ghosts (default all four) |
| Extra Ghost | Adds the fifth, green ghost |
| Lives Pool, Points (co-op) | Separate or shared |
| Lives | 1–5 |
| Level Goal | Endless, or 1, 2, 3, 5, 10 levels |
| Bonus Treats | On / Off |

The menu shows five rows at a time and scrolls. Settings and the high score are saved in `localStorage`.

## Security

- **Locked-down page.** A Content-Security-Policy only lets the game load its own files. It blocks inline or remote scripts, network requests, plugins, forms and `<base>` tricks.
- **No HTML from data.** The code never builds markup from data (no `innerHTML`, `eval` or `document.write`). Text on the page is set with `textContent` or drawn on the canvas.
- **Saved data is untrusted.** Settings, high score and best level are checked against the allowed values when read, and anything else is thrown away.
- **Rule tables are frozen** at startup so they can't be changed at runtime.
- **Theme files are checked** before use: a size limit (8 MB), an audio type, a real audio signature in the first bytes (MP3, OGG, WAV, FLAC, M4A), and they must decode as audio and be under 3 minutes. The file is only ever handed to the browser's audio decoder and never leaves your browser.
- **Browser shortcuts are left alone.** Key presses with Ctrl, Cmd or Alt are ignored, so they keep working normally.

## Files

- `js/data.js`: the maze layout and the arcade's per-level tables
- `js/actors.js`: maze, grid movement, Pac-Man, ghosts and treats
- `js/cutscenes.js`: the three intermission acts
- `js/theme.js`: the optional theme song (file checks, browser-only storage)
- `js/game.js`: rules, game states, rendering and input
- `js/sprites.js`: pixel-art sprites at native arcade resolution
- `js/audio.js`: synthesized Web Audio sound effects and an original chiptune jingle
- `fonts/`: Press Start 2P (SIL Open Font License, see `fonts/OFL.txt`)

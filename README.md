# Pac-Man Versus

A two-player, one-keyboard take on the 1980 arcade classic. One player is Pac-Man, the other plays Blinky the ghost. Everything is drawn in 8-bit pixel art on the original 28×31 maze, with flashing power pellets, blue frightened ghosts, a flashing maze when a level is cleared, and chase lights around the cabinet bezel.

## Play

Open `index.html` in any modern browser. There's no build step and no server to run, and it works offline because the font is bundled.

| Player | Controls |
| --- | --- |
| Pac-Man (P1) | `W` `A` `S` `D` |
| Ghost (P2) | Arrow keys |
| Both | `P` / `Esc` pause, `M` mute, `F` fullscreen, `Enter` start / rematch |

Turns are buffered, so you can press a direction early and the character takes it at the next opening.

## Rules

- **Endless (default).** Levels never stop. The ghost's job is to end the run, and Pac-Man's is to get as far as possible. The results screen shows the level reached and your best ever. Unlike the arcade, there's no level-256 "split screen" crash, so the game keeps going.
- **Level goal (optional).** Set 1–10 levels on the title screen for a head-to-head match. Pac-Man wins by clearing that many levels, and the ghost wins by taking all his lives. These matches count toward the series score.
- The player ghost is faster than Pac-Man by a configurable margin (default +15%). It is slowed in the side tunnels, as in the arcade.
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
- **The board fills the window** and stays sharp at any size. Press F for fullscreen.

## Options (title screen)

| Option | Values |
| --- | --- |
| AI Ghosts | 0–3 extra arcade-AI ghosts (Pinky, Inky, Clyde) |
| Ghost Speed | +5% to +30% over Pac-Man |
| Lives | 1–5 |
| Level Goal | Endless, or 1, 2, 3, 5, 10 levels |
| Bonus Treats | On / Off |

Settings and the high score are saved in `localStorage`.

## Files

- `js/data.js`: the maze layout and the arcade's per-level tables
- `js/actors.js`: maze, grid movement, Pac-Man, ghosts and treats
- `js/cutscenes.js`: the three intermission acts
- `js/game.js`: rules, game states, rendering and input
- `js/sprites.js`: pixel-art sprites at native arcade resolution
- `js/audio.js`: synthesized Web Audio sound effects and an original chiptune jingle
- `fonts/`: Press Start 2P (SIL Open Font License, see `fonts/OFL.txt`)

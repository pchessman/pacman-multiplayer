# Pac-Man Versus

A two-player, one-keyboard take on the 1980 arcade classic. One player is Pac-Man, the other plays Blinky the ghost. Everything is drawn in 8-bit pixel art on the original 28×31 maze, with flashing power pellets, blue frightened ghosts, a flashing maze when a level is cleared, and chase lights around the cabinet bezel.

## Play

Open `index.html` in any modern browser. There's no build step and no server to run, and it works offline because the font is bundled.

| Player | Controls |
| --- | --- |
| Pac-Man (P1) | `W` `A` `S` `D` |
| Ghost (P2) | Arrow keys |
| Both | `P` / `Esc` pause, `M` mute, `Enter` start / rematch |

Turns are buffered, so you can press a direction early and the character takes it at the next opening.

## Rules

- **Pac-Man wins** by clearing the set number of levels before running out of lives.
- **The ghost wins** by catching Pac-Man until all lives are gone.
- The player ghost is faster than Pac-Man by a configurable margin (default +15%). It is slowed in the side tunnels, as in the arcade.
- Power pellets turn ghosts blue and slow them down. Eaten ghosts float back to the house as eyes and respawn, and the player regains control once Blinky exits.
- Dots are 10 points, pellets 50, ghosts 200 / 400 / 800 / 1600 in a chain, and fruit shows up twice per level. You get one extra life at 10,000 points.

## Options (title screen)

| Option | Values |
| --- | --- |
| AI Ghosts | 0–3 extra arcade-AI ghosts (Pinky, Inky, Clyde) with the classic scatter/chase targeting |
| Ghost Speed | +5% to +30% over Pac-Man |
| Lives | 1–5 |
| Levels to Win | 1, 2, 3, 5 or Endless |

Settings and the high score are saved in `localStorage`.

## Files

- `js/game.js`: maze, movement, ghost AI, game states, rendering, input
- `js/sprites.js`: pixel-art sprites at native arcade resolution
- `js/audio.js`: synthesized Web Audio sound effects and an original chiptune jingle
- `fonts/`: Press Start 2P (SIL Open Font License, see `fonts/OFL.txt`)

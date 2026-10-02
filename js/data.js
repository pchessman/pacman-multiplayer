/* Pac-Man Versus — constants, the arcade maze and the arcade's per-level tables. */
'use strict';

const COLS = 28, ROWS = 36, MAZE_ROWS = 31, TOP = 3;
const WIDTH = COLS * T, HEIGHT = ROWS * T;
const BASE_SPEED = 9.47;  // tiles/sec at the arcade's "100%" speed (75.75 px/s)
const HIT_RADIUS = 0.55;  // tiles between centers that counts as contact
const SUBSTEP = 1 / 240;

// The 1980 arcade maze, tile for tile.
// '#' wall, '.' dot, 'o' power pellet, ' ' empty path, '-' ghost door, '_' void
const LAYOUT = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '_____#.##### ## #####.#_____',
  '_____#.##          ##.#_____',
  '_____#.## ###--### ##.#_____',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '_____#.## ######## ##.#_____',
  '_____#.##          ##.#_____',
  '_____#.## ######## ##.#_____',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];

// Arcade rule: ghosts may not turn upward on these four tiles (above and below
// the ghost house) unless they are frightened.
const NO_UP_TILES = new Set(['12,11', '15,11', '12,23', '15,23']);

const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 }, LEFT = { x: -1, y: 0 }, RIGHT = { x: 1, y: 0 };
const DIR_ORDER = [UP, LEFT, DOWN, RIGHT]; // arcade tie-break order
const OPP = new Map([[UP, DOWN], [DOWN, UP], [LEFT, RIGHT], [RIGHT, LEFT]]);
const wrapCol = c => ((c % COLS) + COLS) % COLS;

const PAC_KEYS = { KeyW: UP, KeyA: LEFT, KeyS: DOWN, KeyD: RIGHT };
const GHOST_KEYS = { ArrowUp: UP, ArrowLeft: LEFT, ArrowDown: DOWN, ArrowRight: RIGHT };

const DOOR = { x: 14, y: 11.5 };  // spot just above the ghost-house door
const HOUSE_Y = 14.5;
const FRUIT_SPOT = { x: 14, y: 17.5 };

const GHOSTS = {
  blinky: { color: '#FF0000', nick: 'SHADOW',  start: { x: 14, y: 11.5 }, dir: LEFT, corner: { x: 25, y: -4 } },
  pinky:  { color: '#FFB8FF', nick: 'SPEEDY',  start: { x: 14, y: 14.5 }, dir: DOWN, corner: { x: 2, y: -4 } },
  inky:   { color: '#00FFFF', nick: 'BASHFUL', start: { x: 12, y: 14.5 }, dir: UP,   corner: { x: 27, y: 31 } },
  clyde:  { color: '#FFB852', nick: 'POKEY',   start: { x: 16, y: 14.5 }, dir: UP,   corner: { x: 0, y: 31 } },
};
const GHOST_ORDER = ['blinky', 'pinky', 'inky', 'clyde'];

/* ---------- arcade level tables (index = level - 1, last entry repeats) ---------- */

const FRUITS = {
  cherry:     { pts: 100,  name: 'CHERRY' },
  strawberry: { pts: 300,  name: 'STRAWBERRY' },
  orange:     { pts: 500,  name: 'ORANGE' },
  apple:      { pts: 700,  name: 'APPLE' },
  melon:      { pts: 1000, name: 'MELON' },
  galaxian:   { pts: 2000, name: 'GALAXIAN' },
  bell:       { pts: 3000, name: 'BELL' },
  key:        { pts: 5000, name: 'KEY' },
};
const FRUIT_ORDER = Object.keys(FRUITS);
const FRUIT_BY_LEVEL = ['cherry', 'strawberry', 'orange', 'orange', 'apple', 'apple', 'melon', 'melon',
  'galaxian', 'galaxian', 'bell', 'bell', 'key'];

const FRIGHT_TIME = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1, 0];
const FRIGHT_FLASHES = [5, 5, 5, 5, 5, 5, 5, 5, 3, 5, 5, 3, 3, 5, 3, 3, 0, 3, 0];
const ELROY_DOTS = [20, 30, 40, 40, 40, 50, 50, 50, 60, 60, 60, 80, 80, 80, 100, 100, 100, 100, 120];

// Scatter / chase alternation (seconds), starting with scatter.
const MODE_TIMES = [
  [7, 20, 7, 20, 5, 20, 5, Infinity],
  [7, 20, 7, 20, 5, 1033, 1 / 60, Infinity],
  [5, 20, 5, 20, 5, 1037, 1 / 60, Infinity],
];

// Ghost-house release: personal dot limits for pinky/inky/clyde, and the global
// counter values used after Pac-Man loses a life.
const HOUSE_DOT_LIMITS = [{ pinky: 0, inky: 30, clyde: 60 }, { pinky: 0, inky: 0, clyde: 50 }, { pinky: 0, inky: 0, clyde: 0 }];
const HOUSE_GLOBAL_LIMITS = { pinky: 7, inky: 17, clyde: 32 };

// Levels after which the arcade plays an intermission, and which act.
const INTERMISSIONS = { 2: 1, 5: 2, 9: 3, 13: 3, 17: 3 };

const byLevel = (table, level) => table[Math.min(level, table.length) - 1];
// Arcade rule: each level has one fixed bonus fruit. A new kind first shows up
// on levels 1, 2, 3, 5, 7, 9, 11 and 13; in between, the previous one repeats.
const fruitForLevel = level => byLevel(FRUIT_BY_LEVEL, level);
const fruitUnlockLevel = kind => FRUIT_BY_LEVEL.indexOf(kind) + 1;
const modeTimesFor = level => MODE_TIMES[level === 1 ? 0 : level < 5 ? 1 : 2];
const houseLimitsFor = level => HOUSE_DOT_LIMITS[Math.min(level, 3) - 1];

function computeSpeeds(level, boost) {
  const tier = (a, b, c, d = c) => (level === 1 ? a : level < 5 ? b : level < 21 ? c : d) * BASE_SPEED;
  const pac = tier(0.80, 0.90, 1.00, 0.90);
  const ghost = tier(0.75, 0.85, 0.95);
  const player = pac * (1 + boost);
  return {
    pac,
    pacFright: tier(0.90, 0.95, 1.00),
    ai: ghost,
    fright: tier(0.50, 0.55, 0.60),
    tunnel: tier(0.40, 0.45, 0.50),
    player,
    // Cruise Elroy multipliers relative to normal ghost speed (arcade: +5% / +10% of full speed)
    elroy1: (ghost + 0.05 * BASE_SPEED) / ghost,
    elroy2: (ghost + 0.10 * BASE_SPEED) / ghost,
    eyes: 1.6 * BASE_SPEED,
    house: 0.45 * BASE_SPEED,
    treat: 0.42 * BASE_SPEED,
    bob: 2,
  };
}

/* ---------- bonus treats (not in the arcade original) ---------- */

const TREATS = {
  icecream: { pts: 800,  name: 'ICE CREAM' },
  cupcake:  { pts: 1200, name: 'CUPCAKE' },
  donut:    { pts: 1600, name: 'DONUT' },
  lollipop: { pts: 2000, name: 'LOLLIPOP' },
};
const TREAT_ORDER = Object.keys(TREATS);
const TREAT_DOTS = [120, 200];   // dots eaten when a treat wanders in
const SUGAR_RUSH = { time: 4, mult: 1.25 };

/* ---------- options ---------- */

const OPTIONS = [
  { key: 'ai',     label: 'AI GHOSTS',     values: [0, 1, 2, 3],                      fmt: v => String(v) },
  { key: 'boost',  label: 'GHOST SPEED',   values: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3], fmt: v => '+' + Math.round(v * 100) + '%' },
  { key: 'lives',  label: 'LIVES',         values: [1, 2, 3, 4, 5],                   fmt: v => String(v) },
  { key: 'goal',   label: 'LEVEL GOAL',    values: [0, 1, 2, 3, 5, 10],               fmt: v => (v ? String(v) : 'ENDLESS') },
  { key: 'treats', label: 'BONUS TREATS',  values: [true, false],                     fmt: v => (v ? 'ON' : 'OFF') },
];
const DEFAULT_SETTINGS = { ai: 0, boost: 0.15, lives: 3, goal: 0, treats: true };
const SETTINGS_KEY = 'pacvs-settings-v2';

const MOUTHS = [0, 0.16, 0.3, 0.16].map(m => m * Math.PI);

const COLOR = {
  wall: '#2121DE', text: '#DEDEDE', pac: '#FFFF00', red: '#FF0000',
  cyan: '#00FFFF', pink: '#FFB8FF', door: '#FFB8FF', grey: '#8888AA', orange: '#FFB852',
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

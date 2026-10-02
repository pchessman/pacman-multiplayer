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
  // Optional 5th ghost (not in the arcade): slips in through a side tunnel a few
  // seconds into each round and tries to cut Pac-Man off from behind.
  funky:  { color: '#3CFF6E', nick: 'SNEAKY',  start: { x: 0.5, y: 14.5 }, dir: RIGHT, corner: { x: 14, y: 34 }, spawnDelay: 8 },
};
const GHOST_ORDER = ['blinky', 'pinky', 'inky', 'clyde'];

// Pac-Man's arcade start, and the two co-op spots either side of it.
const PAC_STARTS = {
  versus: [{ who: 'pac', x: 14, y: 23.5, dir: LEFT }],
  coop: [{ who: 'pac', x: 13, y: 23.5, dir: LEFT }, { who: 'ms', x: 15, y: 23.5, dir: RIGHT }],
};

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

// boost: player ghost vs Pac-Man (versus). aiSpeed: AI ghosts vs arcade speed.
function computeSpeeds(level, boost, aiSpeed = 0) {
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
    aiMult: 1 + aiSpeed,
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

const speedFmt = v => (v === 0 ? 'NORMAL' : (v > 0 ? '+' : '-') + Math.round(Math.abs(v) * 100) + '%');
const onOff = v => (v ? 'ON' : 'OFF');
const versus = s => s.mode === 'versus';
const coop = s => s.mode === 'coop';
const always = () => true;

// Title-screen options. `show` hides the ones that don't apply to the chosen mode.
const OPTIONS = [
  { key: 'mode',       label: 'MODE',         values: ['versus', 'coop'],           fmt: v => (v === 'coop' ? 'CO-OP' : 'VS GHOST'), show: always },
  { key: 'boost',      label: 'GHOST SPEED',  values: [-0.3, -0.2, -0.1, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5], fmt: speedFmt, show: versus },
  { key: 'aiSpeed',    label: 'GHOST SPEED',  values: [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5], fmt: speedFmt, show: coop },
  { key: 'ai',         label: 'AI GHOSTS',    values: [0, 1, 2, 3],                 fmt: String, show: versus },
  { key: 'coopGhosts', label: 'GHOSTS',       values: [1, 2, 3, 4],                 fmt: String, show: coop },
  { key: 'extra',      label: 'EXTRA GHOST',  values: [false, true],                fmt: onOff, show: always },
  { key: 'lives',      label: 'LIVES',        values: [1, 2, 3, 4, 5],              fmt: String, show: always },
  { key: 'livesMode',  label: 'LIVES POOL',   values: ['separate', 'shared'],       fmt: v => v.toUpperCase(), show: coop },
  { key: 'scoreMode',  label: 'POINTS',       values: ['separate', 'shared'],       fmt: v => v.toUpperCase(), show: coop },
  { key: 'goal',       label: 'LEVEL GOAL',   values: [0, 1, 2, 3, 5, 10],          fmt: v => (v ? String(v) : 'ENDLESS'), show: always },
  { key: 'treats',     label: 'BONUS TREATS', values: [true, false],                fmt: onOff, show: always },
];
const DEFAULT_SETTINGS = {
  mode: 'versus', boost: 0.15, aiSpeed: 0, ai: 0, coopGhosts: 4, extra: false,
  lives: 3, livesMode: 'separate', scoreMode: 'separate', goal: 0, treats: true,
};
const SETTINGS_KEY = 'pacvs-settings-v3';
const LEGACY_SETTINGS_KEY = 'pacvs-settings-v2';

// Saved data is untrusted: keep only values the game actually offers.
function sanitizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const o of OPTIONS) {
      if (Object.prototype.hasOwnProperty.call(raw, o.key) && o.values.includes(raw[o.key])) out[o.key] = raw[o.key];
    }
  }
  return out;
}

function safeInt(v, min, max, fallback) {
  return Number.isSafeInteger(v) && v >= min && v <= max ? v : fallback;
}

const MOUTHS = [0, 0.16, 0.3, 0.16].map(m => m * Math.PI);

const COLOR = {
  wall: '#2121DE', text: '#DEDEDE', pac: '#FFFF00', red: '#FF0000',
  cyan: '#00FFFF', pink: '#FFB8FF', door: '#FFB8FF', grey: '#8888AA', orange: '#FFB852',
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// Lock the shared tables so nothing can rewrite the rules at runtime.
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
[LAYOUT, GHOSTS, GHOST_ORDER, PAC_STARTS, FRUITS, FRUIT_ORDER, FRUIT_BY_LEVEL, FRIGHT_TIME, FRIGHT_FLASHES, ELROY_DOTS,
  MODE_TIMES, HOUSE_DOT_LIMITS, HOUSE_GLOBAL_LIMITS, INTERMISSIONS, TREATS, TREAT_ORDER, TREAT_DOTS, SUGAR_RUSH,
  OPTIONS, DEFAULT_SETTINGS, MOUTHS, COLOR, PAC_KEYS, GHOST_KEYS, DOOR, FRUIT_SPOT, DIR_ORDER].forEach(deepFreeze);

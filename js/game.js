/* Pac-Man Versus — game logic, rendering and input.
   Player 1 is Pac-Man (WASD), player 2 is Blinky the ghost (arrow keys). */
'use strict';

/* ================================================================
   Constants
   ================================================================ */

const COLS = 28, ROWS = 36, MAZE_ROWS = 31, TOP = 3;
const WIDTH = COLS * T, HEIGHT = ROWS * T;
const BASE_SPEED = 9.47;  // tiles/sec at the arcade's "100%" speed (75.75 px/s)
const HIT_RADIUS = 0.55;  // tiles between centers that counts as contact
const SUBSTEP = 1 / 240;

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

const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 }, LEFT = { x: -1, y: 0 }, RIGHT = { x: 1, y: 0 };
const DIR_ORDER = [UP, LEFT, DOWN, RIGHT]; // arcade tie-break order
const OPP = new Map([[UP, DOWN], [DOWN, UP], [LEFT, RIGHT], [RIGHT, LEFT]]);
const wrapCol = c => ((c % COLS) + COLS) % COLS;

const PAC_KEYS = { KeyW: UP, KeyA: LEFT, KeyS: DOWN, KeyD: RIGHT };
const GHOST_KEYS = { ArrowUp: UP, ArrowLeft: LEFT, ArrowDown: DOWN, ArrowRight: RIGHT };

const DOOR = { x: 14, y: 11.5 };  // spot just above the ghost-house door
const HOUSE_Y = 14.5;

const GHOSTS = {
  blinky: { color: '#FF0000', nick: 'SHADOW',  start: { x: 14, y: 11.5 }, dir: LEFT, corner: { x: 25, y: -4 }, release: 0 },
  pinky:  { color: '#FFB8FF', nick: 'SPEEDY',  start: { x: 14, y: 14.5 }, dir: DOWN, corner: { x: 2, y: -4 },  release: 1 },
  inky:   { color: '#00FFFF', nick: 'BASHFUL', start: { x: 12, y: 14.5 }, dir: UP,   corner: { x: 27, y: 31 }, release: 4 },
  clyde:  { color: '#FFB852', nick: 'POKEY',   start: { x: 16, y: 14.5 }, dir: UP,   corner: { x: 0, y: 31 },  release: 8 },
};
const GHOST_ORDER = ['blinky', 'pinky', 'inky', 'clyde'];

const FRUITS = [
  { kind: 'cherry', pts: 100 },
  { kind: 'strawberry', pts: 300 },
  { kind: 'orange', pts: 500 },
  { kind: 'apple', pts: 700 },
  { kind: 'melon', pts: 1000 },
];
const fruitForLevel = l => FRUITS[[0, 1, 2, 2, 3, 3, 4][Math.min(l - 1, 6)]];

const MODE_TIMES = [7, 20, 7, 20, 5, 20, 5, Infinity]; // scatter, chase, scatter, ...
const MOUTHS = [0, 0.16, 0.3, 0.16].map(m => m * Math.PI);

const OPTIONS = [
  { key: 'ai',    label: 'AI GHOSTS',     values: [0, 1, 2, 3],                        fmt: v => String(v) },
  { key: 'boost', label: 'GHOST SPEED',   values: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3],   fmt: v => '+' + Math.round(v * 100) + '%' },
  { key: 'lives', label: 'LIVES',         values: [1, 2, 3, 4, 5],                     fmt: v => String(v) },
  { key: 'goal',  label: 'LEVELS TO WIN', values: [1, 2, 3, 5, 0],                     fmt: v => (v ? String(v) : 'ENDLESS') },
];
const DEFAULT_SETTINGS = { ai: 0, boost: 0.15, lives: 3, goal: 3 };

const COLOR = {
  wall: '#2121DE', text: '#DEDEDE', pac: '#FFFF00', red: '#FF0000',
  cyan: '#00FFFF', pink: '#FFB8FF', door: '#FFB8FF', grey: '#8888AA',
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

function computeSpeeds(level, boost) {
  const tier = (a, b, c) => (level === 1 ? a : level < 5 ? b : c) * BASE_SPEED;
  const pac = tier(0.80, 0.90, 1.00);
  const player = pac * (1 + boost);
  return {
    pac,
    pacFright: tier(0.90, 0.95, 1.00),
    ai: tier(0.75, 0.85, 0.95),
    fright: tier(0.50, 0.55, 0.60),
    tunnel: tier(0.40, 0.45, 0.50),
    player,
    playerTunnel: player * 0.6,
    eyes: 1.6 * BASE_SPEED,
    house: 0.45 * BASE_SPEED,
    bob: 2,
  };
}

const frightDuration = level => Math.max(3, 7 - level);

/* ================================================================
   Maze
   ================================================================ */

class Maze {
  constructor() { this.reset(); }

  reset() {
    this.grid = LAYOUT.map(r => r.split(''));
    this.total = 0;
    for (const row of this.grid) for (const ch of row) if (ch === '.' || ch === 'o') this.total++;
    this.left = this.total;
  }

  cell(c, r) {
    if (r < 0 || r >= MAZE_ROWS) return '_';
    return this.grid[r][wrapCol(c)];
  }

  walkable(c, r) {
    const ch = this.cell(c, r);
    return ch === '.' || ch === 'o' || ch === ' ';
  }

  take(c, r) {
    const ch = this.cell(c, r);
    if (ch !== '.' && ch !== 'o') return null;
    this.grid[r][wrapCol(c)] = ' ';
    this.left--;
    return ch;
  }
}

// Breadth-first distances from a tile, used to steer returning ghost eyes home.
function distanceMap(maze, tc, tr) {
  const dist = LAYOUT.map(row => new Array(row.length).fill(Infinity));
  const queue = [[tc, tr]];
  dist[tr][tc] = 0;
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const d of DIR_ORDER) {
      const nc = wrapCol(c + d.x), nr = r + d.y;
      if (!maze.walkable(nc, nr) || dist[nr][nc] !== Infinity) continue;
      dist[nr][nc] = dist[r][c] + 1;
      queue.push([nc, nr]);
    }
  }
  return dist;
}

// Pre-render the arcade-style outlined walls (rounded corners, double lines on thin walls).
function renderWalls(color) {
  const c = document.createElement('canvas');
  c.width = COLS * T;
  c.height = MAZE_ROWS * T;
  const g = c.getContext('2d');
  const wall = (x, y) => x >= 0 && x < COLS && y >= 0 && y < MAZE_ROWS && LAYOUT[y][x] === '#';
  const D = 5; // line inset from the tile edge facing a corridor
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.beginPath();
  const seg = (x0, y0, x1, y1) => { g.moveTo(x0, y0); g.lineTo(x1, y1); };
  const arc = (cx, cy, r, a0, a1) => { g.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0)); g.arc(cx, cy, r, a0, a1); };
  const HP = Math.PI / 2;

  for (let y = 0; y < MAZE_ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!wall(x, y)) continue;
      const ox = x * T, oy = y * T;
      const n = wall(x, y - 1), s = wall(x, y + 1), w = wall(x - 1, y), e = wall(x + 1, y);
      const R = (!w && !e) || (!n && !s) ? 3 : 6;
      if (!n) seg(ox + (w ? 0 : D + R), oy + D, ox + (e ? T : T - D - R), oy + D);
      if (!s) seg(ox + (w ? 0 : D + R), oy + T - D, ox + (e ? T : T - D - R), oy + T - D);
      if (!w) seg(ox + D, oy + (n ? 0 : D + R), ox + D, oy + (s ? T : T - D - R));
      if (!e) seg(ox + T - D, oy + (n ? 0 : D + R), ox + T - D, oy + (s ? T : T - D - R));
      // convex corners
      if (!n && !w) arc(ox + D + R, oy + D + R, R, 2 * HP, 3 * HP);
      if (!n && !e) arc(ox + T - D - R, oy + D + R, R, 3 * HP, 4 * HP);
      if (!s && !e) arc(ox + T - D - R, oy + T - D - R, R, 0, HP);
      if (!s && !w) arc(ox + D + R, oy + T - D - R, R, HP, 2 * HP);
      // concave corners
      if (n && w && !wall(x - 1, y - 1)) arc(ox, oy, D, 0, HP);
      if (n && e && !wall(x + 1, y - 1)) arc(ox + T, oy, D, HP, 2 * HP);
      if (s && e && !wall(x + 1, y + 1)) arc(ox + T, oy + T, D, 2 * HP, 3 * HP);
      if (s && w && !wall(x - 1, y + 1)) arc(ox, oy + T, D, 3 * HP, 4 * HP);
    }
  }
  g.stroke();

  // ghost-house door
  g.fillStyle = COLOR.door;
  for (let x = 0; x < COLS; x++) if (LAYOUT[12][x] === '-') g.fillRect(x * T, 12 * T + 6, T, 4);
  return c;
}

/* ================================================================
   Movement
   ================================================================ */

// Moves an actor along the tile grid. Whenever it lands exactly on a tile
// center, onCenter(actor) decides the next direction (or stops it).
function moveActor(a, dist, onCenter) {
  let moved = 0, guard = 0;
  while (dist > 1e-6 && guard++ < 16) {
    if (!a.moving) {
      onCenter(a);
      if (!a.moving) break;
    }
    const horiz = a.dir.x !== 0;
    const sign = horiz ? a.dir.x : a.dir.y;
    const pos = horiz ? a.x : a.y;
    // Tile centers sit at k + 0.5, which floats represent exactly. Arrival is
    // "reached or crossed the next center", then we snap onto it, so rounding
    // can never carry an actor past a center without a turn/wall check.
    const next = sign > 0 ? Math.floor(pos - 0.5) + 1.5 : Math.ceil(pos - 0.5) - 0.5;
    const gap = Math.abs(next - pos);
    let to = pos + sign * dist;
    const arrived = sign > 0 ? to >= next : to <= next;
    if (arrived) to = next;
    const step = arrived ? gap : dist;
    if (horiz) a.x = to; else a.y = to;
    dist -= step;
    moved += step;
    if (a.x < 0) a.x += COLS; else if (a.x >= COLS) a.x -= COLS;
    if (arrived) {
      if (horiz) a.y = Math.floor(a.y) + 0.5; else a.x = Math.floor(a.x) + 0.5;
      onCenter(a);
    }
  }
  return moved;
}

// Turn around on the spot. Mid-tile that's always safe (we came from behind);
// exactly on a center the actor may have just turned, so check the way is open.
function reverseIfOpen(a, maze, dir = OPP.get(a.dir)) {
  const pos = a.dir.x ? a.x : a.y;
  const centered = pos - 0.5 === Math.floor(pos - 0.5);
  if (!centered || maze.walkable(Math.floor(a.x) + dir.x, Math.floor(a.y) + dir.y)) a.dir = dir;
}

function tileDist(a, b) {
  let dx = Math.abs(a.x - b.x);
  dx = Math.min(dx, COLS - dx);
  return Math.hypot(dx, a.y - b.y);
}

/* ================================================================
   Actors
   ================================================================ */

class Pacman {
  constructor(game) { this.game = game; this.reset(); }

  reset() {
    this.x = 14;
    this.y = 23.5;
    this.dir = LEFT;
    this.want = null;
    this.moving = true;
    this.anim = 0;
  }

  update(dt, speed) {
    if (this.want && this.moving && this.want === OPP.get(this.dir)) reverseIfOpen(this, this.game.maze, this.want);
    this.anim += moveActor(this, speed * dt, this.game.playerCenter);
  }

  get mouth() { return MOUTHS[Math.floor(this.anim * 4) % 4]; }
}

class Ghost {
  constructor(game, kind, isPlayer) {
    this.game = game;
    this.kind = kind;
    this.isPlayer = isPlayer;
    this.info = GHOSTS[kind];
    this.reset();
  }

  reset() {
    const i = this.info;
    this.x = i.start.x;
    this.y = i.start.y;
    this.dir = i.dir;
    this.want = null;
    this.moving = true;
    this.frightened = false;
    this.path = null;
    this.state = this.kind === 'blinky' ? 'active' : 'house';
    this.houseTimer = i.release;
    this.bobDir = this.dir === UP ? -1 : 1;
  }

  get isEyes() { return this.state === 'eyes' || this.state === 'entering'; }

  update(dt) {
    const g = this.game, sp = g.speeds;
    switch (this.state) {
      case 'house':
        this.houseTimer -= dt;
        this.y += this.bobDir * sp.bob * dt;
        if (this.y <= 14) { this.y = 14; this.bobDir = 1; }
        else if (this.y >= 15) { this.y = 15; this.bobDir = -1; }
        this.dir = this.bobDir < 0 ? UP : DOWN;
        if (this.houseTimer <= 0) {
          this.state = 'exiting';
          this.path = [{ x: this.x, y: HOUSE_Y }, { x: DOOR.x, y: HOUSE_Y }, { x: DOOR.x, y: DOOR.y }];
        }
        break;
      case 'exiting':
        this.follow(sp.house * dt);
        break;
      case 'entering':
        this.follow(sp.eyes * dt);
        break;
      case 'eyes':
        moveActor(this, sp.eyes * dt, () => this.eyesCenter());
        break;
      case 'active':
        if (this.isPlayer && this.want && this.moving && this.want === OPP.get(this.dir)) reverseIfOpen(this, g.maze, this.want);
        moveActor(this, g.ghostSpeed(this) * dt, this.isPlayer ? g.playerCenter : () => this.aiCenter());
        break;
    }
  }

  // Scripted movement in and out of the ghost house.
  follow(dist) {
    while (dist > 1e-6 && this.path && this.path.length) {
      const p = this.path[0];
      const dx = p.x - this.x, dy = p.y - this.y, len = Math.hypot(dx, dy);
      if (len > 1e-6) this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP);
      if (len <= dist) {
        this.x = p.x;
        this.y = p.y;
        dist -= len;
        this.path.shift();
      } else {
        this.x += (dx / len) * dist;
        this.y += (dy / len) * dist;
        dist = 0;
      }
    }
    if (this.path && !this.path.length) {
      this.path = null;
      if (this.state === 'entering') {
        this.frightened = false;
        this.state = 'exiting';
        this.path = [{ x: DOOR.x, y: DOOR.y }];
      } else {
        this.state = 'active';
        this.moving = true;
        this.dir = this.isPlayer && this.want === RIGHT ? RIGHT : LEFT;
      }
    }
  }

  eyesCenter() {
    const c = Math.floor(this.x), r = Math.floor(this.y);
    if (r === 11 && (c === 13 || c === 14)) {
      this.state = 'entering';
      this.moving = false;
      this.path = [{ x: DOOR.x, y: DOOR.y }, { x: DOOR.x, y: HOUSE_Y }];
      return;
    }
    const map = this.game.eyesMap, maze = this.game.maze;
    let best = null, bestDist = Infinity;
    for (const d of DIR_ORDER) {
      const nc = wrapCol(c + d.x), nr = r + d.y;
      if (!maze.walkable(nc, nr)) continue;
      if (map[nr][nc] < bestDist) { bestDist = map[nr][nc]; best = d; }
    }
    this.moving = !!best;
    if (best) this.dir = best;
  }

  aiCenter() {
    const g = this.game, maze = g.maze;
    const c = Math.floor(this.x), r = Math.floor(this.y);
    const back = OPP.get(this.dir);
    const opts = DIR_ORDER.filter(d => d !== back && maze.walkable(c + d.x, r + d.y));
    this.moving = true;
    if (!opts.length) { this.dir = back; return; }
    if (this.frightened) { this.dir = opts[(Math.random() * opts.length) | 0]; return; }
    const t = g.targetFor(this);
    let best = opts[0], bestDist = Infinity;
    for (const d of opts) {
      const dx = c + d.x - t.x, dy = r + d.y - t.y, v = dx * dx + dy * dy;
      if (v < bestDist) { bestDist = v; best = d; }
    }
    this.dir = best;
  }
}

/* ================================================================
   Game
   ================================================================ */

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.maze = new Maze();
    this.eyesMap = distanceMap(this.maze, 13, 11);
    this.wallsBlue = renderWalls(COLOR.wall);
    this.wallsWhite = renderWalls('#FFFFFF');
    this.settings = Object.assign({}, DEFAULT_SETTINGS, store.get('pacvs-settings', {}));
    this.hiscore = store.get('pacvs-hiscore', 0);
    this.menuIndex = 0;
    this.time = 0;
    this.paused = false;
    this.lights = '';
    this.pac = new Pacman(this);
    this.ghosts = [];
    this.popups = [];
    this.score = 0;
    this.catches = 0;
    this.level = 1;
    this.speeds = computeSpeeds(1, this.settings.boost);

    // Shared turn logic for both human players.
    this.playerCenter = a => {
      const c = Math.floor(a.x), r = Math.floor(a.y);
      if (a.want && this.maze.walkable(c + a.want.x, r + a.want.y)) {
        a.dir = a.want;
        a.moving = true;
      } else {
        a.moving = this.maze.walkable(c + a.dir.x, r + a.dir.y);
      }
    };

    this.state = 'title';
  }

  /* ---------- flow ---------- */

  newMatch() {
    this.level = 1;
    this.score = 0;
    this.catches = 0;
    this.lives = this.settings.lives;
    this.extraGiven = false;
    this.levelsCleared = 0;
    this.winner = null;
    this.startLevel(true);
  }

  startLevel(first) {
    this.maze.reset();
    this.dotsEaten = 0;
    this.speeds = computeSpeeds(this.level, this.settings.boost);
    this.resetActors();
    this.state = 'ready';
    this.readyTimer = first ? 4.3 : 3;
    if (first) Sound.intro();
  }

  resetActors() {
    this.pac.reset();
    this.ghosts = GHOST_ORDER.slice(0, 1 + this.settings.ai).map((k, i) => new Ghost(this, k, i === 0));
    this.powerTime = 0;
    this.chain = 0;
    this.modeIndex = 0;
    this.modeTimer = MODE_TIMES[0];
    this.popups = [];
    this.fruit = null;
  }

  gameOver(winner) {
    this.state = 'over';
    this.winner = winner;
    this.overTimer = 0;
    store.set('pacvs-hiscore', this.hiscore);
    if (winner === 'pac') Sound.win(); else Sound.lose();
  }

  addScore(n) {
    this.score += n;
    if (!this.extraGiven && this.score >= 10000) {
      this.extraGiven = true;
      this.lives++;
      Sound.extraLife();
    }
    if (this.score > this.hiscore) this.hiscore = this.score;
  }

  /* ---------- update ---------- */

  update(dt) {
    if (this.paused) { this.setLights('pause'); return; }
    this.time += dt;
    switch (this.state) {
      case 'ready':
        this.readyTimer -= dt;
        if (this.readyTimer <= 0) this.state = 'play';
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      case 'freeze':
        this.freezeTimer -= dt;
        this.updatePopups(dt);
        if (this.freezeTimer <= 0) this.state = 'play';
        break;
      case 'dying':
        this.dieTimer += dt;
        if (this.dieTimer >= 1 && !this.deathSfx) { this.deathSfx = true; Sound.death(); }
        if (this.dieTimer >= 3) {
          this.lives--;
          if (this.lives > 0) {
            this.resetActors();
            this.state = 'ready';
            this.readyTimer = 2;
          } else {
            this.gameOver('ghost');
          }
        }
        break;
      case 'clear':
        this.clearTimer += dt;
        if (this.clearTimer >= 3) {
          if (this.settings.goal && this.levelsCleared >= this.settings.goal) {
            this.gameOver('pac');
          } else {
            this.level++;
            this.startLevel(false);
          }
        }
        break;
      case 'over':
        this.overTimer += dt;
        break;
    }
    this.updateSiren();
    this.setLights(this.lightMode());
  }

  updatePlay(dt) {
    if (this.powerTime > 0) {
      this.powerTime -= dt;
      if (this.powerTime <= 0) {
        this.powerTime = 0;
        for (const g of this.ghosts) g.frightened = false;
      }
    } else {
      this.modeTimer -= dt;
      if (this.modeTimer <= 0) {
        this.modeIndex++;
        this.modeTimer = MODE_TIMES[this.modeIndex];
        for (const g of this.ghosts) if (!g.isPlayer && g.state === 'active') reverseIfOpen(g, this.maze);
      }
    }

    if (this.fruit) {
      this.fruit.life -= dt;
      if (this.fruit.life <= 0) this.fruit = null;
    }
    this.updatePopups(dt);

    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    for (let i = 0; i < steps && this.state === 'play'; i++) {
      this.pac.update(h, this.powerTime > 0 ? this.speeds.pacFright : this.speeds.pac);
      this.eat();
      if (this.state !== 'play') break;
      for (const g of this.ghosts) g.update(h);
      this.checkCollisions();
    }
  }

  updatePopups(dt) {
    for (const p of this.popups) p.life -= dt;
    this.popups = this.popups.filter(p => p.life > 0);
  }

  eat() {
    const c = Math.floor(this.pac.x), r = Math.floor(this.pac.y);
    const got = this.maze.take(c, r);
    if (got) {
      this.dotsEaten++;
      if (got === '.') {
        this.addScore(10);
        Sound.waka();
      } else {
        this.addScore(50);
        this.frighten();
      }
      if (this.dotsEaten === 70 || this.dotsEaten === 170) {
        const f = fruitForLevel(this.level);
        this.fruit = { kind: f.kind, pts: f.pts, x: 14, y: 17.5, life: 9.5 };
      }
      if (this.maze.left === 0) {
        this.state = 'clear';
        this.clearTimer = 0;
        this.levelsCleared++;
        return;
      }
    }
    if (this.fruit && tileDist(this.pac, this.fruit) < 0.7) {
      this.addScore(this.fruit.pts);
      this.popups.push({ x: this.fruit.x, y: this.fruit.y, text: String(this.fruit.pts), color: COLOR.pink, life: 2 });
      this.fruit = null;
      Sound.fruit();
    }
  }

  frighten() {
    this.powerTime = frightDuration(this.level);
    this.chain = 0;
    for (const g of this.ghosts) {
      if (g.isEyes) continue;
      g.frightened = true;
      if (!g.isPlayer && g.state === 'active') reverseIfOpen(g, this.maze);
    }
  }

  checkCollisions() {
    for (const g of this.ghosts) {
      if (g.state !== 'active' || tileDist(this.pac, g) >= HIT_RADIUS) continue;
      if (g.frightened) {
        const pts = 200 * 2 ** Math.min(this.chain, 3);
        this.chain++;
        this.addScore(pts);
        g.frightened = false;
        g.state = 'eyes';
        this.popups.push({ x: g.x, y: g.y, text: String(pts), color: COLOR.cyan, life: 0.8 });
        this.state = 'freeze';
        this.freezeTimer = 0.8;
        this.eatenGhost = g;
        Sound.eatGhost();
      } else {
        this.state = 'dying';
        this.dieTimer = 0;
        this.deathSfx = false;
        this.catches++;
      }
      return;
    }
  }

  ghostSpeed(g) {
    if (g.frightened) return this.speeds.fright;
    const inTunnel = Math.floor(g.y) === 14 && (g.x < 6 || g.x >= 22);
    if (g.isPlayer) return inTunnel ? this.speeds.playerTunnel : this.speeds.player;
    return inTunnel ? this.speeds.tunnel : this.speeds.ai;
  }

  // Classic arcade targeting for the AI-controlled ghosts.
  targetFor(g) {
    if (this.modeIndex % 2 === 0) return g.info.corner;
    const p = this.pac, pc = Math.floor(p.x), pr = Math.floor(p.y), d = p.dir;
    switch (g.kind) {
      case 'pinky':
        return { x: pc + 4 * d.x, y: pr + 4 * d.y };
      case 'inky': {
        const b = this.ghosts[0];
        const ax = pc + 2 * d.x, ay = pr + 2 * d.y;
        return { x: 2 * ax - Math.floor(b.x), y: 2 * ay - Math.floor(b.y) };
      }
      case 'clyde': {
        const dx = Math.floor(g.x) - pc, dy = Math.floor(g.y) - pr;
        return dx * dx + dy * dy > 64 ? { x: pc, y: pr } : g.info.corner;
      }
      default:
        return { x: pc, y: pr };
    }
  }

  updateSiren() {
    if (this.paused || this.state !== 'play') { Sound.setSiren('off'); return; }
    if (this.ghosts.some(g => g.isEyes)) Sound.setSiren('eyes');
    else if (this.powerTime > 0) Sound.setSiren('fright');
    else Sound.setSiren('normal', this.dotsEaten / this.maze.total);
  }

  lightMode() {
    switch (this.state) {
      case 'title': return 'idle';
      case 'play': return this.powerTime > 0 ? 'fright' : 'play';
      case 'freeze': return 'fright';
      case 'dying': return 'dead';
      case 'clear': return 'clear';
      case 'over': return this.winner === 'pac' ? 'win-pac' : 'win-ghost';
      default: return 'play';
    }
  }

  setLights(mode) {
    if (mode === this.lights) return;
    this.lights = mode;
    document.body.dataset.lights = mode;
  }

  /* ---------- input ---------- */

  onKey(code, repeat) {
    if (code === 'KeyM') { if (!repeat) Sound.toggleMute(); return; }
    const isStart = code === 'Enter' || code === 'NumpadEnter' || code === 'Space';

    if (this.state === 'title') {
      const dir = GHOST_KEYS[code] || PAC_KEYS[code];
      if (dir === UP || dir === DOWN) {
        this.menuIndex = (this.menuIndex + dir.y + OPTIONS.length) % OPTIONS.length;
        Sound.menu();
      } else if (dir) {
        const o = OPTIONS[this.menuIndex];
        const i = o.values.indexOf(this.settings[o.key]);
        this.settings[o.key] = o.values[(i + dir.x + o.values.length) % o.values.length];
        store.set('pacvs-settings', this.settings);
        Sound.menu();
      } else if (isStart && !repeat) {
        this.newMatch();
      }
      return;
    }

    if (this.state === 'over') {
      if (this.overTimer < 1) return;
      if (isStart && !repeat) this.newMatch();
      else if (code === 'Escape') this.toTitle();
      return;
    }

    if ((code === 'KeyP' || code === 'Escape') && !repeat) {
      this.paused = !this.paused;
      if (this.paused) Sound.setSiren('off');
      return;
    }
    if (this.paused) {
      if (code === 'KeyQ') this.toTitle();
      return;
    }
    if (PAC_KEYS[code]) this.pac.want = PAC_KEYS[code];
    if (GHOST_KEYS[code] && this.ghosts[0]) this.ghosts[0].want = GHOST_KEYS[code];
  }

  toTitle() {
    this.paused = false;
    this.state = 'title';
    store.set('pacvs-hiscore', this.hiscore);
    Sound.setSiren('off');
  }

  pauseIfActive() {
    if (!['title', 'over'].includes(this.state) && !this.paused) {
      this.paused = true;
      Sound.setSiren('off');
    }
  }

  /* ---------- rendering ---------- */

  text(str, x, y, color, size = 16, align = 'left') {
    const c = this.ctx;
    c.font = `${size}px "Press Start 2P", monospace`;
    c.textAlign = align;
    c.textBaseline = 'top';
    c.fillStyle = color;
    c.fillText(str, x, y);
  }

  blit(img, cx, cy) {
    this.ctx.drawImage(img, Math.round((cx - img.width / 2) / PX) * PX, Math.round((cy - img.height / 2) / PX) * PX);
  }

  pos(a) { return [a.x * T, (a.y + TOP) * T]; }

  render() {
    const c = this.ctx;
    c.fillStyle = '#000';
    c.fillRect(0, 0, WIDTH, HEIGHT);
    this.drawHUD();
    if (this.state === 'title') {
      this.drawTitle();
    } else {
      this.drawMaze();
      this.drawActors();
      this.drawMessages();
    }
    if (this.paused) this.drawPause();
  }

  drawHUD() {
    const playing = this.state === 'play' || this.state === 'freeze';
    if (!playing || Math.floor(this.time * 3.5) % 2 === 0) this.text('PAC-MAN', T, 0, COLOR.pac);
    this.text('HIGH SCORE', 9 * T, 0, COLOR.text);
    this.text('GHOST', 27 * T, 0, COLOR.red, 16, 'right');
    this.text(this.score ? String(this.score) : '00', 8 * T, T, COLOR.text, 16, 'right');
    this.text(this.hiscore ? String(this.hiscore) : '00', 17 * T, T, COLOR.text, 16, 'right');
    this.text(String(this.catches), 27 * T, T, COLOR.text, 16, 'right');

    if (this.state === 'title') return;
    const icons = Math.min(Math.max(this.lives - 1, 0), 4);
    for (let i = 0; i < icons; i++) this.blit(Sprites.pac(Math.PI, MOUTHS[2]), (2 + 2 * i) * T, 35 * T);
    const goal = this.settings.goal;
    this.text(`LV ${this.level}${goal ? '/' + goal : ''}`, 14 * T, 34.5 * T, COLOR.text, 16, 'center');
    const shown = Math.min(this.level, 4);
    for (let k = 0; k < shown; k++) this.blit(Sprites.fruit(fruitForLevel(this.level - k).kind), (26 - 2 * k) * T, 35 * T);
  }

  drawMaze() {
    const c = this.ctx;
    let walls = this.wallsBlue;
    if (this.state === 'clear' && this.clearTimer > 1 && this.clearTimer < 2.6) {
      if (Math.floor((this.clearTimer - 1) / 0.2) % 2 === 0) walls = this.wallsWhite;
    }
    c.drawImage(walls, 0, TOP * T);
    if (this.state === 'clear' || this.state === 'over') return;

    const blinkOn = this.state !== 'play' || Math.floor(this.time * 6) % 2 === 0;
    const dot = Sprites.dot(), pellet = Sprites.pellet();
    const grid = this.maze.grid;
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const ch = grid[r][col];
        if (ch === '.') this.blit(dot, col * T + T / 2, (r + TOP) * T + T / 2);
        else if (ch === 'o' && blinkOn) this.blit(pellet, col * T + T / 2, (r + TOP) * T + T / 2);
      }
    }
    if (this.fruit) this.blit(Sprites.fruit(this.fruit.kind), ...this.pos(this.fruit));
  }

  drawActors() {
    const s = this.state;
    if (s === 'over') return;
    const intro = s === 'ready' && this.readyTimer > 2;
    const dyingLate = s === 'dying' && this.dieTimer >= 1;
    const frame = Math.floor(this.time * 7.5) % 2;

    if (!intro && !dyingLate && s !== 'clear') {
      for (const g of this.ghosts) {
        if (s === 'freeze' && g === this.eatenGhost) continue;
        let spr;
        if (g.isEyes) spr = Sprites.ghostEyes(g.dir);
        else if (g.frightened) {
          const flash = this.powerTime < 2 && Math.floor(this.powerTime / 0.2) % 2 === 0;
          spr = Sprites.frightGhost(frame, flash);
        } else spr = Sprites.ghost(g.info.color, frame, g.dir);
        this.blit(spr, ...this.pos(g));
      }
    }

    if (!intro && s !== 'freeze') {
      const [px, py] = this.pos(this.pac);
      if (dyingLate) {
        const p = (this.dieTimer - 1) / 1.3;
        if (p < 1) {
          const step = Math.round(Math.max(0.05, p) * 12) / 12;
          this.blit(Sprites.pac(-Math.PI / 2, step * Math.PI), px, py);
        } else if (p < 1.25) {
          this.drawPop(px, py);
        }
      } else {
        const mouth = s === 'ready' || s === 'clear' ? 0 : this.pac.mouth;
        this.blit(Sprites.pac(Math.atan2(this.pac.dir.y, this.pac.dir.x), mouth), px, py);
      }
    }

    for (const p of this.popups) {
      const [x, y] = this.pos(p);
      this.text(p.text, x, y - 4, p.color, 8, 'center');
    }

    if (s === 'ready' && !intro) {
      const [px, py] = this.pos(this.pac);
      this.text('P1', px, py - 26, COLOR.pac, 8, 'center');
      const [gx, gy] = this.pos(this.ghosts[0]);
      this.text('P2', gx, gy - 26, COLOR.red, 8, 'center');
    }
  }

  drawPop(x, y) {
    const c = this.ctx;
    c.fillStyle = COLOR.pac;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      for (let r = 6; r < 12; r += 2) c.fillRect(Math.round(x + Math.cos(a) * r) - 1, Math.round(y + Math.sin(a) * r) - 1, 2, 2);
    }
  }

  drawMessages() {
    const mid = WIDTH / 2;
    if (this.state === 'ready') {
      if (this.readyTimer > 2) this.text(`LEVEL ${this.level}`, mid, 14 * T, COLOR.cyan, 16, 'center');
      this.text('READY!', mid, 20 * T, COLOR.pac, 16, 'center');
    }
    if (this.state === 'over') {
      if (this.overTimer > 1) this.drawWinner();
      else this.text('GAME  OVER', mid, 20 * T, COLOR.red, 16, 'center');
    }
  }

  drawWinner() {
    const c = this.ctx, mid = WIDTH / 2;
    const x = 2 * T, y = 9 * T, w = 24 * T, h = 15 * T;
    c.fillStyle = 'rgba(0,0,0,0.92)';
    c.fillRect(x, y, w, h);
    c.strokeStyle = COLOR.wall;
    c.lineWidth = 2;
    c.strokeRect(x + 3, y + 3, w - 6, h - 6);
    c.strokeRect(x + 9, y + 9, w - 18, h - 18);

    const pacWon = this.winner === 'pac';
    const flash = Math.floor(this.time * 4) % 2 === 0;
    this.text(pacWon ? 'PAC-MAN WINS!' : 'GHOST WINS!', mid, y + 2 * T, flash ? (pacWon ? COLOR.pac : COLOR.red) : '#FFFFFF', 16, 'center');
    if (pacWon) this.blit(Sprites.pac(0, MOUTHS[Math.floor(this.time * 15) % 4]), mid, y + 5 * T);
    else this.blit(Sprites.ghost(GHOSTS.blinky.color, Math.floor(this.time * 7.5) % 2, LEFT), mid, y + 5 * T);

    const goal = this.settings.goal;
    this.text(`SCORE     ${String(this.score).padStart(7)}`, mid, y + 7 * T, COLOR.text, 16, 'center');
    this.text(`LEVELS    ${String(this.levelsCleared + (goal ? '/' + goal : '')).padStart(7)}`, mid, y + 8.5 * T, COLOR.text, 16, 'center');
    this.text(`CATCHES   ${String(this.catches).padStart(7)}`, mid, y + 10 * T, COLOR.text, 16, 'center');
    if (this.overTimer > 1.5 && flash) this.text('ENTER  REMATCH', mid, y + 12 * T, COLOR.pac, 16, 'center');
    this.text('ESC  MENU', mid, y + 13.3 * T, COLOR.grey, 8, 'center');
  }

  drawPause() {
    const c = this.ctx, mid = WIDTH / 2;
    c.fillStyle = 'rgba(0,0,0,0.65)';
    c.fillRect(0, 2 * T, WIDTH, HEIGHT - 4 * T);
    if (Math.floor(performance.now() / 400) % 2 === 0) this.text('PAUSED', mid, 16 * T, COLOR.pac, 16, 'center');
    this.text('P  RESUME', mid, 19 * T, COLOR.text, 8, 'center');
    this.text('Q  QUIT TO MENU', mid, 20.5 * T, COLOR.text, 8, 'center');
  }

  drawTitle() {
    const c = this.ctx, t = this.time, mid = WIDTH / 2;
    c.font = '32px "Press Start 2P", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillStyle = '#DE5000';
    c.fillText('PAC-MAN', mid + 4, 3 * T + 4);
    c.fillStyle = COLOR.pac;
    c.fillText('PAC-MAN', mid, 3 * T);

    const cycle = [COLOR.red, COLOR.pink, COLOR.cyan, '#FFB852'][Math.floor(t * 2) % 4];
    this.text('- VERSUS EDITION -', mid, 6 * T, cycle, 16, 'center');
    this.text('CHARACTER / NICKNAME', mid, 8 * T, COLOR.text, 16, 'center');

    const frame = Math.floor(t * 7.5) % 2;
    GHOST_ORDER.forEach((k, i) => {
      const row = 10 + i * 2, info = GHOSTS[k];
      this.blit(Sprites.ghost(info.color, frame, RIGHT), 3.5 * T, row * T + T / 2);
      this.text(('-' + info.nick).padEnd(9) + '"' + k.toUpperCase() + '"', 6 * T, row * T, info.color);
    });

    this.blit(Sprites.dot(), 5.5 * T, 18.5 * T);
    this.text('10 PTS', 7 * T, 18 * T, COLOR.text);
    if (Math.floor(t * 3) % 2 === 0) this.blit(Sprites.pellet(), 15.5 * T, 18.5 * T);
    this.text('50 PTS', 17 * T, 18 * T, COLOR.text);

    this.drawAttract(t);

    OPTIONS.forEach((o, i) => {
      const row = 22.4 + i * 1.35, sel = i === this.menuIndex, col = sel ? COLOR.pac : COLOR.text;
      if (sel && Math.floor(t * 4) % 2 === 0) this.text('>', 2 * T, row * T, COLOR.pac);
      this.text(o.label, 4 * T, row * T, col);
      this.text(o.fmt(this.settings[o.key]), 25 * T, row * T, col, 16, 'right');
    });
    this.text('UP/DOWN SELECT   LEFT/RIGHT CHANGE', mid, 27.9 * T, COLOR.grey, 8, 'center');

    this.text('PAC-MAN', 4 * T, 29.4 * T, COLOR.pac);
    this.text('W A S D', 16 * T, 29.4 * T, COLOR.pac);
    this.text('GHOST', 4 * T, 30.8 * T, COLOR.red);
    this.text('ARROWS', 16 * T, 30.8 * T, COLOR.red);
    if (Math.floor(t * 2.5) % 2 === 0) this.text('PRESS ENTER TO START', mid, 32.6 * T, COLOR.text, 16, 'center');
    this.text('P PAUSE    M MUTE', mid, 34.5 * T, COLOR.grey, 8, 'center');
  }

  // Attract-mode chase: Pac-Man runs from the ghosts, grabs a pellet, turns the tables.
  drawAttract(t) {
    const cy = 20.5 * T, tt = t % 11, mouth = MOUTHS[Math.floor(t * 15) % 4];
    if (tt < 5) {
      const px = 29 - tt * 5.5;
      if (Math.floor(t * 3) % 2 === 0) this.blit(Sprites.pellet(), 1.5 * T, cy);
      this.blit(Sprites.pac(Math.PI, mouth), px * T, cy);
      GHOST_ORDER.forEach((k, i) => {
        this.blit(Sprites.ghost(GHOSTS[k].color, Math.floor(t * 7.5) % 2, LEFT), (px + 2.5 + 2 * i) * T, cy);
      });
    } else if (tt < 10.5) {
      const tb = tt - 5, px = 1.5 + tb * 5.5;
      GHOST_ORDER.forEach((k, i) => {
        const caught = 1 + 0.8 * i;
        if (tb < caught) {
          const flash = tb > 2.4 && Math.floor(t * 5) % 2 === 0;
          this.blit(Sprites.frightGhost(Math.floor(t * 7.5) % 2, flash), (4 + 2 * i + 3 * tb) * T, cy);
        } else if (tb < caught + 0.8) {
          this.text(String(200 * 2 ** i), (1.5 + caught * 5.5) * T, cy - 4, COLOR.cyan, 8, 'center');
        }
      });
      this.blit(Sprites.pac(0, mouth), px * T, cy);
    }
  }
}

/* ================================================================
   Boot
   ================================================================ */

(function boot() {
  const canvas = document.getElementById('game');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const game = new Game(canvas);
  window.game = game;

  const bezel = document.getElementById('bezel');
  const lights = document.getElementById('lights');
  const BULB_COLORS = ['#FF0000', '#FFB8FF', '#00FFFF', '#FFB852', '#FFFF00'];

  function layoutBulbs() {
    lights.innerHTML = '';
    const w = bezel.clientWidth, h = bezel.clientHeight, inset = 11, gap = 22;
    const pts = [];
    const nx = Math.max(2, Math.round((w - 2 * inset) / gap));
    const ny = Math.max(2, Math.round((h - 2 * inset) / gap));
    for (let i = 0; i < nx; i++) pts.push([inset + (i * (w - 2 * inset)) / nx, inset]);
    for (let i = 0; i < ny; i++) pts.push([w - inset, inset + (i * (h - 2 * inset)) / ny]);
    for (let i = 0; i < nx; i++) pts.push([w - inset - (i * (w - 2 * inset)) / nx, h - inset]);
    for (let i = 0; i < ny; i++) pts.push([inset, h - inset - (i * (h - 2 * inset)) / ny]);
    const frag = document.createDocumentFragment();
    pts.forEach(([x, y], i) => {
      const b = document.createElement('span');
      b.className = 'bulb p' + (i % 3);
      b.style.left = x + 'px';
      b.style.top = y + 'px';
      b.style.setProperty('--c', BULB_COLORS[i % BULB_COLORS.length]);
      frag.appendChild(b);
    });
    lights.appendChild(frag);
  }

  function fit() {
    const help = document.getElementById('help');
    const availW = window.innerWidth - 60;
    const availH = window.innerHeight - help.offsetHeight - 80;
    let s = Math.min(availW / WIDTH, availH / HEIGHT);
    if (s >= 1) s = Math.floor(s * 2) / 2; // keep native pixels whole
    canvas.style.width = Math.floor(WIDTH * s) + 'px';
    canvas.style.height = Math.floor(HEIGHT * s) + 'px';
    layoutBulbs();
  }
  window.addEventListener('resize', fit);
  fit();

  window.addEventListener('keydown', e => {
    Sound.init();
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    game.onKey(e.code, e.repeat);
  });
  window.addEventListener('blur', () => game.pauseIfActive());
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pauseIfActive(); });

  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    game.update(dt);
    game.render();
    requestAnimationFrame(frame);
  }

  const fontReady = document.fonts ? document.fonts.load('16px "Press Start 2P"') : Promise.resolve();
  Promise.race([fontReady, new Promise(r => setTimeout(r, 2000))]).finally(() => {
    last = performance.now();
    requestAnimationFrame(frame);
  });
})();

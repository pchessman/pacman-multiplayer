/* Pac-Man Versus — maze, grid movement and the actors (Pac-Man, ghosts, treats). */
'use strict';

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

// Breadth-first distances from one or more tiles over the walkable maze.
function distanceMap(maze, sources) {
  const dist = LAYOUT.map(row => new Array(row.length).fill(Infinity));
  const queue = [];
  for (const [c, r] of sources) { dist[r][c] = 0; queue.push([c, r]); }
  for (let i = 0; i < queue.length; i++) {
    const [c, r] = queue[i];
    for (const d of DIR_ORDER) {
      const nc = wrapCol(c + d.x), nr = r + d.y;
      if (!maze.walkable(nc, nr) || dist[nr][nc] !== Infinity) continue;
      dist[nr][nc] = dist[r][c] + 1;
      queue.push([nc, nr]);
    }
  }
  return dist;
}

// Pre-render the arcade-style outlined walls (rounded corners, double lines on
// thin walls) at `scale` device pixels per canvas unit.
function renderWalls(color, scale) {
  const c = document.createElement('canvas');
  c.width = Math.round(COLS * T * scale);
  c.height = Math.round(MAZE_ROWS * T * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
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

const isCentered = v => v - 0.5 === Math.floor(v - 0.5);

// Turn around on the spot. Mid-tile that's always safe (we came from behind);
// exactly on a center the actor may have just turned, so check the way is open.
function reverseIfOpen(a, maze, dir = OPP.get(a.dir)) {
  const centered = isCentered(a.dir.x ? a.x : a.y);
  if (!centered || maze.walkable(Math.floor(a.x) + dir.x, Math.floor(a.y) + dir.y)) a.dir = dir;
}

function tileDist(a, b) {
  let dx = Math.abs(a.x - b.x);
  dx = Math.min(dx, COLS - dx);
  return Math.hypot(dx, a.y - b.y);
}

/* ================================================================
   Pac-Man
   ================================================================ */

const CORNER_WINDOW = 0.4; // tiles either side of a center where Pac-Man may cut the corner

class Pacman {
  constructor(game) { this.game = game; this.reset(); }

  reset() {
    this.x = 14;
    this.y = 23.5;
    this.dir = LEFT;
    this.want = null;
    this.moving = true;
    this.anim = 0;
    this.stall = 0;     // arcade: Pac-Man pauses briefly for every dot he eats
    this.corner = null; // pending diagonal catch-up while cornering
  }

  update(dt, speed) {
    if (this.stall > 0) {
      const s = Math.min(this.stall, dt);
      this.stall -= s;
      dt -= s;
      if (dt <= 0) return;
    }
    const maze = this.game.maze;
    if (this.want && this.moving) {
      if (this.want === OPP.get(this.dir)) reverseIfOpen(this, maze, this.want);
      else if (this.want !== this.dir && !this.corner) this.tryCorner(maze);
    }
    const moved = moveActor(this, speed * dt, this.game.playerCenter);
    this.anim += moved;
    if (this.corner) {
      const ax = this.corner.axis, d = this.corner.target - this[ax];
      if (Math.abs(d) <= moved) { this[ax] = this.corner.target; this.corner = null; }
      else this[ax] += Math.sign(d) * moved;
    }
  }

  // Arcade cornering: turn up to a few pixels before or after a tile center,
  // sliding diagonally onto the new lane.
  tryCorner(maze) {
    const horiz = this.dir.x !== 0;
    const pos = horiz ? this.x : this.y;
    const center = Math.floor(pos) + 0.5;
    const off = pos - center;
    if (off === 0 || Math.abs(off) > CORNER_WINDOW) return;
    if (!maze.walkable(Math.floor(this.x) + this.want.x, Math.floor(this.y) + this.want.y)) return;
    this.corner = { axis: horiz ? 'x' : 'y', target: center };
    this.dir = this.want;
  }

  get mouth() { return MOUTHS[Math.floor(this.anim * 4) % 4]; }
}

/* ================================================================
   Ghosts
   ================================================================ */

class Ghost {
  constructor(game, kind, isPlayer) {
    this.game = game;
    this.kind = kind;
    this.isPlayer = isPlayer;
    this.info = GHOSTS[kind];
    const i = this.info;
    this.x = i.start.x;
    this.y = i.start.y;
    this.dir = i.dir;
    this.want = null;
    this.moving = true;
    this.frightened = false;
    this.path = null;
    this.state = kind === 'blinky' ? 'active' : 'house';
    this.bobDir = this.dir === UP ? -1 : 1;
    this.rush = 0;    // sugar-rush seconds left
    this.trail = [];  // recent positions, drawn as afterimages during a sugar rush
  }

  get isEyes() { return this.state === 'eyes' || this.state === 'entering'; }

  noUp(c, r) { return !this.frightened && NO_UP_TILES.has(`${c},${r}`); }

  release() {
    if (this.state !== 'house') return;
    this.state = 'exiting';
    this.path = [{ x: this.x, y: HOUSE_Y }, { x: DOOR.x, y: HOUSE_Y }, { x: DOOR.x, y: DOOR.y }];
  }

  update(dt) {
    const g = this.game, sp = g.speeds;
    if (this.rush > 0) this.rush = Math.max(0, this.rush - dt);
    switch (this.state) {
      case 'house':
        this.y += this.bobDir * sp.bob * dt;
        if (this.y <= 14) { this.y = 14; this.bobDir = 1; }
        else if (this.y >= 15) { this.y = 15; this.bobDir = -1; }
        this.dir = this.bobDir < 0 ? UP : DOWN;
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
        moveActor(this, g.ghostSpeed(this) * dt, () => (this.isPlayer ? this.playerCenter() : this.aiCenter()));
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

  playerCenter() {
    const maze = this.game.maze, c = Math.floor(this.x), r = Math.floor(this.y);
    const w = this.want;
    if (w && maze.walkable(c + w.x, r + w.y) && !(w === UP && this.noUp(c, r))) {
      this.dir = w;
      this.moving = true;
    } else {
      this.moving = maze.walkable(c + this.dir.x, r + this.dir.y);
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
    const opts = DIR_ORDER.filter(d => d !== back && maze.walkable(c + d.x, r + d.y) && !(d === UP && this.noUp(c, r)));
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
   Bonus treats: wander in through a tunnel, roam, then leave
   ================================================================ */

class Treat {
  constructor(game, kind) {
    this.game = game;
    this.kind = kind;
    this.pts = TREATS[kind].pts;
    const fromLeft = Math.random() < 0.5;
    this.x = fromLeft ? 0.5 : 27.5;
    this.y = 14.5;
    this.dir = fromLeft ? RIGHT : LEFT;
    this.moving = true;
    this.life = 18 + Math.random() * 4;
    this.leaving = false;
    this.gone = false;
    this.age = 0;
  }

  update(dt) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) this.leaving = true;
    moveActor(this, this.game.speeds.treat * dt, () => this.center());
  }

  center() {
    const g = this.game, maze = g.maze, c = Math.floor(this.x), r = Math.floor(this.y);
    if (this.leaving && r === 14 && (c === 0 || c === COLS - 1) && this.age > 2) {
      this.gone = true;
      this.moving = false;
      return;
    }
    const back = OPP.get(this.dir);
    let opts = DIR_ORDER.filter(d => d !== back && maze.walkable(c + d.x, r + d.y));
    if (!opts.length) opts = [back];
    this.moving = true;
    if (!this.leaving) { this.dir = opts[(Math.random() * opts.length) | 0]; return; }
    let best = opts[0], bestDist = Infinity;
    for (const d of opts) {
      const v = g.exitMap[r + d.y][wrapCol(c + d.x)];
      if (v < bestDist) { bestDist = v; best = d; }
    }
    this.dir = best;
  }

  // Little hop, like the bouncing fruit in Ms. Pac-Man.
  get hop() { return -Math.abs(Math.sin(this.age * 7)) * 4; }
}

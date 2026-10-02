/* Pac-Man Versus — game flow, rules, rendering and input.
   Player 1 is Pac-Man (WASD), player 2 is Blinky the ghost (arrow keys). */
'use strict';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.k = 0;
    this.maze = new Maze();
    this.eyesMap = distanceMap(this.maze, [[13, 11]]);
    this.exitMap = distanceMap(this.maze, [[0, 14], [COLS - 1, 14]]);
    this.settings = Object.assign({}, DEFAULT_SETTINGS, store.get('pacvs-settings', {}));
    this.hiscore = store.get('pacvs-hiscore', 0);
    this.series = { pac: 0, ghost: 0 };
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
    this.lives = 0;
    this.speeds = computeSpeeds(1, this.settings.boost);

    // Pac-Man's turn logic (the player ghost has its own, with the no-up rule).
    this.playerCenter = a => {
      const c = Math.floor(a.x), r = Math.floor(a.y);
      if (a.want && this.maze.walkable(c + a.want.x, r + a.want.y)) {
        a.dir = a.want;
        a.moving = true;
      } else {
        a.moving = this.maze.walkable(c + a.dir.x, r + a.dir.y);
      }
    };

    this.setScale(1);
    this.state = 'title';
  }

  // Render at `k` device pixels per canvas unit so the board stays sharp at any size.
  setScale(k) {
    if (k === this.k) return;
    this.k = k;
    this.canvas.width = WIDTH * k;
    this.canvas.height = HEIGHT * k;
    this.wallsBlue = renderWalls(COLOR.wall, k);
    this.wallsWhite = renderWalls('#FFFFFF', k);
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
    this.stats = { ghosts: 0, fruit: 0, treats: 0, rushes: 0 };
    this.startLevel(true);
  }

  startLevel(first) {
    this.maze.reset();
    this.dotsEaten = 0;
    this.speeds = computeSpeeds(this.level, this.settings.boost);
    this.houseDots = { pinky: 0, inky: 0, clyde: 0 };
    this.globalCounter = null;
    this.elroySuspended = false;
    this.elroyShown = 0;
    this.resetActors();
    this.state = 'ready';
    this.readyTimer = first ? 4.3 : 3;
    if (first) Sound.intro();
  }

  resetActors() {
    this.pac.reset();
    this.ghosts = GHOST_ORDER.slice(0, 1 + this.settings.ai).map((k, i) => new Ghost(this, k, i === 0));
    this.powerTime = 0;
    this.flashes = 0;
    this.chain = 0;
    this.modeIndex = 0;
    this.modeTimer = modeTimesFor(this.level)[0];
    this.houseIdle = 0;
    this.popups = [];
    this.fruit = null;
    this.treat = null;
  }

  gameOver(winner) {
    this.state = 'over';
    this.winner = winner;
    this.overTimer = 0;
    this.series[winner]++;
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

  popup(x, y, text, color, life) {
    this.popups.push({ x, y, text, color, life });
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
            this.globalCounter = 0; // arcade: after a death the house uses one shared dot counter
            this.elroySuspended = this.ghosts.some(g => g.kind === 'clyde');
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
          const act = INTERMISSIONS[this.level];
          if (this.settings.goal && this.levelsCleared >= this.settings.goal) this.gameOver('pac');
          else if (act) { this.state = 'cutscene'; this.cutscene = new Intermission(this, act); }
          else this.nextLevel();
        }
        break;
      case 'cutscene':
        this.cutscene.update(dt);
        if (this.cutscene.done) this.nextLevel();
        break;
      case 'over':
        this.overTimer += dt;
        break;
    }
    this.updateSiren();
    this.setLights(this.lightMode());
  }

  nextLevel() {
    this.cutscene = null;
    this.level++;
    this.startLevel(false);
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
        this.modeTimer = modeTimesFor(this.level)[this.modeIndex];
        for (const g of this.ghosts) if (!g.isPlayer && g.state === 'active') reverseIfOpen(g, this.maze);
      }
    }

    if (this.fruit) {
      this.fruit.life -= dt;
      if (this.fruit.life <= 0) this.fruit = null;
    }
    this.updatePopups(dt);
    this.updateHouse(dt);
    this.updateElroy();

    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    for (let i = 0; i < steps && this.state === 'play'; i++) {
      this.pac.update(h, this.powerTime > 0 ? this.speeds.pacFright : this.speeds.pac);
      this.eat();
      if (this.state !== 'play') break;
      for (const g of this.ghosts) g.update(h);
      if (this.treat) this.treat.update(h);
      this.checkTreat();
      this.checkCollisions();
    }

    const pg = this.ghosts[0];
    if (pg.rush > 0 && pg.state === 'active') {
      pg.trail.unshift({ x: pg.x, y: pg.y });
      pg.trail.length = Math.min(pg.trail.length, 12);
    } else {
      pg.trail = [];
    }
  }

  updatePopups(dt) {
    for (const p of this.popups) p.life -= dt;
    this.popups = this.popups.filter(p => p.life > 0);
  }

  // Arcade ghost-house release: dot counters, plus a timer if Pac-Man stops eating.
  updateHouse(dt) {
    const waiting = this.ghosts.filter(g => g.state === 'house');
    if (this.elroySuspended && !this.ghosts.some(g => g.kind === 'clyde' && g.state === 'house')) this.elroySuspended = false;
    if (!waiting.length) return;
    const next = waiting[0];
    this.houseIdle += dt;
    let go;
    if (this.globalCounter !== null) {
      go = this.globalCounter >= HOUSE_GLOBAL_LIMITS[next.kind];
      if (go && next.kind === 'clyde') this.globalCounter = null;
    } else {
      go = this.houseDots[next.kind] >= houseLimitsFor(this.level)[next.kind];
    }
    if (this.houseIdle >= (this.level < 5 ? 4 : 3)) { go = true; this.houseIdle = 0; }
    if (go) next.release();
  }

  onDotForHouse() {
    this.houseIdle = 0;
    if (this.globalCounter !== null) { this.globalCounter++; return; }
    const next = this.ghosts.find(g => g.state === 'house');
    if (next) this.houseDots[next.kind]++;
  }

  // Cruise Elroy: Blinky speeds up when few dots remain.
  elroyStage() {
    if (this.elroySuspended || !this.maze.total) return 0;
    const e1 = byLevel(ELROY_DOTS, this.level);
    return this.maze.left <= e1 / 2 ? 2 : this.maze.left <= e1 ? 1 : 0;
  }

  updateElroy() {
    const stage = this.elroyStage();
    if (stage > this.elroyShown) {
      this.elroyShown = stage;
      Sound.elroy();
    }
  }

  eat() {
    const c = Math.floor(this.pac.x), r = Math.floor(this.pac.y);
    const got = this.maze.take(c, r);
    if (got) {
      this.dotsEaten++;
      this.onDotForHouse();
      if (got === '.') {
        this.addScore(10);
        this.pac.stall += 1 / 60;
        Sound.waka();
      } else {
        this.addScore(50);
        this.pac.stall += 3 / 60;
        this.frighten();
      }
      if (this.dotsEaten === 70 || this.dotsEaten === 170) {
        const kind = fruitForLevel(this.level);
        this.fruit = { kind, pts: FRUITS[kind].pts, x: FRUIT_SPOT.x, y: FRUIT_SPOT.y, life: 9.33 + Math.random() * 0.67 };
      }
      const treatIndex = TREAT_DOTS.indexOf(this.dotsEaten);
      if (this.settings.treats && treatIndex >= 0 && !this.treat) {
        this.treat = new Treat(this, TREAT_ORDER[((this.level - 1) * 2 + treatIndex) % TREAT_ORDER.length]);
        Sound.treatAppear();
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
      this.popup(this.fruit.x, this.fruit.y, String(this.fruit.pts), COLOR.pink, 2);
      this.stats.fruit++;
      this.fruit = null;
      Sound.fruit();
    }
  }

  checkTreat() {
    const t = this.treat;
    if (!t) return;
    if (t.gone) { this.treat = null; return; }
    if (tileDist(this.pac, t) < 0.7) {
      this.addScore(t.pts);
      this.popup(t.x, t.y, String(t.pts), COLOR.pink, 2);
      this.stats.treats++;
      this.treat = null;
      Sound.fruit();
      return;
    }
    const pg = this.ghosts[0];
    if (pg.state === 'active' && tileDist(pg, t) < 0.7) {
      pg.rush = SUGAR_RUSH.time;
      this.popup(t.x, t.y - 0.6, 'SUGAR RUSH!', COLOR.red, 1.6);
      this.stats.rushes++;
      this.treat = null;
      Sound.sugarRush();
    }
  }

  frighten() {
    const time = byLevel(FRIGHT_TIME, this.level);
    this.chain = 0;
    for (const g of this.ghosts) if (!g.isPlayer && g.state === 'active') reverseIfOpen(g, this.maze);
    if (time <= 0) return; // from level 17 on, a pellet only turns the ghosts around
    this.powerTime = time;
    this.flashes = byLevel(FRIGHT_FLASHES, this.level);
    for (const g of this.ghosts) if (!g.isEyes) g.frightened = true;
  }

  checkCollisions() {
    for (const g of this.ghosts) {
      if (g.state !== 'active' || tileDist(this.pac, g) >= HIT_RADIUS) continue;
      if (g.frightened) {
        const pts = 200 * 2 ** Math.min(this.chain, 3);
        this.chain++;
        this.addScore(pts);
        this.stats.ghosts++;
        g.frightened = false;
        g.state = 'eyes';
        g.rush = 0;
        this.popup(g.x, g.y, String(pts), COLOR.cyan, 0.8);
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
    const rush = g.rush > 0 ? SUGAR_RUSH.mult : 1;
    if (g.frightened) return this.speeds.fright * rush;
    const inTunnel = Math.floor(g.y) === 14 && (g.x < 6 || g.x >= 22);
    if (!g.isPlayer) return inTunnel ? this.speeds.tunnel : this.speeds.ai;
    const stage = this.elroyStage();
    let v = this.speeds.player * rush;
    if (stage === 1) v *= this.speeds.elroy1;
    else if (stage === 2) v *= this.speeds.elroy2;
    return inTunnel ? v * 0.6 : v;
  }

  // Classic arcade targeting for the AI-controlled ghosts, including the
  // original bug where "ahead" also shifts left when Pac-Man faces up.
  targetFor(g) {
    if (this.modeIndex % 2 === 0) return g.info.corner;
    const p = this.pac, pc = Math.floor(p.x), pr = Math.floor(p.y), d = p.dir;
    const ahead = n => ({ x: pc + n * d.x - (d === UP ? n : 0), y: pr + n * d.y });
    switch (g.kind) {
      case 'pinky':
        return ahead(4);
      case 'inky': {
        const b = this.ghosts[0], a = ahead(2);
        return { x: 2 * a.x - Math.floor(b.x), y: 2 * a.y - Math.floor(b.y) };
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
    else Sound.setSiren('normal', this.dotsEaten / this.maze.total, this.elroyStage());
  }

  lightMode() {
    switch (this.state) {
      case 'title': return 'idle';
      case 'play':
        if (this.powerTime > 0) return 'fright';
        return this.ghosts[0].rush > 0 ? 'rush' : 'play';
      case 'freeze': return 'fright';
      case 'dying': return 'dead';
      case 'clear': return 'clear';
      case 'cutscene': return 'idle';
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
    if (code === 'KeyF') { if (!repeat) toggleFullscreen(); return; }
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

    if (this.state === 'cutscene') {
      if (isStart && !repeat) this.nextLevel();
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
    this.cutscene = null;
    store.set('pacvs-hiscore', this.hiscore);
    Sound.setSiren('off');
  }

  pauseIfActive() {
    if (!['title', 'over', 'cutscene'].includes(this.state) && !this.paused) {
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
    const w = img.width, h = img.height;
    this.ctx.drawImage(img, Math.round((cx - w / 2) / PX) * PX, Math.round((cy - h / 2) / PX) * PX, w, h);
  }

  blitScaled(img, cx, cy, s) {
    const w = img.width * s, h = img.height * s;
    this.ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
  }

  pos(a) { return [a.x * T, (a.y + TOP) * T]; }

  render() {
    const c = this.ctx;
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#000';
    c.fillRect(0, 0, WIDTH, HEIGHT);
    this.drawHUD();
    if (this.state === 'title') {
      this.drawTitle();
    } else if (this.state === 'cutscene') {
      this.cutscene.draw();
    } else {
      this.drawMaze();
      this.drawActors();
      this.drawMessages();
    }
    if (this.paused) this.drawPause();
  }

  drawHUD() {
    const playing = this.state === 'play' || this.state === 'freeze';
    const blink = Math.floor(this.time * 3.5) % 2 === 0;
    if (!playing || blink) this.text('PAC-MAN', T, 0, COLOR.pac);
    this.text('HIGH SCORE', 9 * T, 0, COLOR.text);
    this.text('GHOST', 27 * T, 0, COLOR.red, 16, 'right');
    this.text(this.score ? String(this.score) : '00', 8 * T, T, COLOR.text, 16, 'right');
    this.text(this.hiscore ? String(this.hiscore) : '00', 17 * T, T, COLOR.text, 16, 'right');
    this.text(String(this.catches), 27 * T, T, COLOR.text, 16, 'right');

    if (this.state === 'title') return;
    const goal = this.settings.goal;
    this.text(`LEVEL ${this.level}${goal ? ' OF ' + goal : ''}`, WIDTH / 2, 2 * T + 4, COLOR.grey, 8, 'center');
    if (this.state === 'play' || this.state === 'freeze') {
      const pg = this.ghosts[0];
      if (pg && pg.rush > 0) this.text('SUGAR RUSH', 27 * T, 2 * T + 4, blink ? COLOR.pink : COLOR.red, 8, 'right');
      else if (this.elroyStage()) this.text(this.elroyStage() === 2 ? 'ELROY 2' : 'ELROY', 27 * T, 2 * T + 4, blink ? COLOR.red : COLOR.text, 8, 'right');
    }

    const icons = Math.min(Math.max(this.lives - 1, 0), 5);
    for (let i = 0; i < icons; i++) this.blit(Sprites.pac(Math.PI, MOUTHS[2]), (2 + 2 * i) * T, 35 * T);
    const shown = Math.min(this.level, 7);
    for (let k = 0; k < shown; k++) this.blit(Sprites.fruit(fruitForLevel(this.level - k)), (26 - 2 * k) * T, 35 * T);
  }

  drawMaze() {
    const c = this.ctx;
    let walls = this.wallsBlue;
    if (this.state === 'clear' && this.clearTimer > 1 && this.clearTimer < 2.6) {
      if (Math.floor((this.clearTimer - 1) / 0.2) % 2 === 0) walls = this.wallsWhite;
    }
    c.drawImage(walls, 0, TOP * T, COLS * T, MAZE_ROWS * T);
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

  ghostSprite(g, frame) {
    if (g.isEyes) return Sprites.ghostEyes(g.dir);
    if (g.frightened) {
      const flash = this.powerTime < this.flashes * 0.4 && Math.floor(this.powerTime / 0.2) % 2 === 0;
      return Sprites.frightGhost(frame, flash);
    }
    return Sprites.ghost(g.info.color, frame, g.dir);
  }

  drawActors() {
    const s = this.state, c = this.ctx;
    if (s === 'over') return;
    const intro = s === 'ready' && this.readyTimer > 2;
    const dyingLate = s === 'dying' && this.dieTimer >= 1;
    const frame = Math.floor(this.time * 7.5) % 2;

    if (this.treat && !intro && !dyingLate && s !== 'clear') {
      const [tx, ty] = this.pos(this.treat);
      this.blit(Sprites.treat(this.treat.kind), tx, ty + this.treat.hop);
    }

    if (!intro && !dyingLate && s !== 'clear') {
      for (const g of this.ghosts) {
        if (s === 'freeze' && g === this.eatenGhost) continue;
        const spr = this.ghostSprite(g, frame);
        g.trail.forEach((p, i) => {
          if (i % 3 !== 2) return;
          c.globalAlpha = 0.35 - i * 0.025;
          this.blit(spr, ...this.pos(p));
        });
        c.globalAlpha = 1;
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
    const x = 2 * T, y = 5 * T, w = 24 * T, h = 25 * T;
    c.fillStyle = 'rgba(0,0,0,0.94)';
    c.fillRect(x, y, w, h);
    c.strokeStyle = COLOR.wall;
    c.lineWidth = 2;
    c.strokeRect(x + 3, y + 3, w - 6, h - 6);
    c.strokeRect(x + 9, y + 9, w - 18, h - 18);

    const pacWon = this.winner === 'pac';
    const flash = Math.floor(this.time * 4) % 2 === 0;
    this.text(pacWon ? 'PAC-MAN WINS!' : 'GHOST WINS!', mid, y + 2 * T, flash ? (pacWon ? COLOR.pac : COLOR.red) : '#FFFFFF', 16, 'center');
    if (pacWon) this.blit(Sprites.pac(0, MOUTHS[Math.floor(this.time * 15) % 4]), mid, y + 4.5 * T);
    else this.blit(Sprites.ghost(GHOSTS.blinky.color, Math.floor(this.time * 7.5) % 2, LEFT), mid, y + 4.5 * T);

    const goal = this.settings.goal, st = this.stats;
    const rows = [
      ['SCORE', this.score, COLOR.text],
      ['LEVELS', this.levelsCleared + (goal ? '/' + goal : ''), COLOR.text],
      ['GHOSTS EATEN', st.ghosts, COLOR.cyan],
      ['FRUIT', st.fruit, COLOR.pink],
      ['TREATS', st.treats, COLOR.pink],
      ['CATCHES', this.catches, COLOR.red],
      ['SUGAR RUSHES', st.rushes, COLOR.red],
    ];
    rows.forEach(([label, v, col], i) => {
      const ry = y + (6.5 + i * 1.4) * T;
      this.text(label, x + 2.5 * T, ry, col);
      this.text(String(v), x + w - 2.5 * T, ry, COLOR.text, 16, 'right');
    });

    this.text('SERIES', mid, y + 17 * T, COLOR.grey, 8, 'center');
    this.text(`PAC ${this.series.pac}  -  ${this.series.ghost} GHOST`, mid, y + 18 * T, COLOR.text, 16, 'center');
    if (this.overTimer > 1.5 && flash) this.text('ENTER  REMATCH', mid, y + 20.5 * T, COLOR.pac, 16, 'center');
    this.text('ESC  MENU', mid, y + 22.3 * T, COLOR.grey, 8, 'center');
  }

  drawPause() {
    const c = this.ctx, mid = WIDTH / 2;
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.fillRect(0, 2 * T, WIDTH, HEIGHT - 4 * T);
    if (Math.floor(performance.now() / 400) % 2 === 0) this.text('PAUSED', mid, 14 * T, COLOR.pac, 16, 'center');
    this.text('P  RESUME', mid, 17 * T, COLOR.text, 8, 'center');
    this.text('Q  QUIT TO MENU', mid, 18.5 * T, COLOR.text, 8, 'center');
    this.text('F  FULLSCREEN', mid, 20 * T, COLOR.text, 8, 'center');
    this.text('TIP: GHOSTS CAN\'T TURN UP RIGHT', mid, 23 * T, COLOR.grey, 8, 'center');
    this.text('ABOVE OR BELOW THE GHOST HOUSE', mid, 24 * T, COLOR.grey, 8, 'center');
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
    const cycle = [COLOR.red, COLOR.pink, COLOR.cyan, COLOR.orange][Math.floor(t * 2) % 4];
    this.text('- VERSUS EDITION -', mid, 6 * T, cycle, 16, 'center');

    if (Math.floor(t / 9) % 2 === 0) this.drawTitleCharacters(t);
    else this.drawTitleBonus(t);

    OPTIONS.forEach((o, i) => {
      const row = 22.2 + i * 1.25, sel = i === this.menuIndex, col = sel ? COLOR.pac : COLOR.text;
      if (sel && Math.floor(t * 4) % 2 === 0) this.text('>', 2 * T, row * T, COLOR.pac);
      this.text(o.label, 4 * T, row * T, col);
      this.text(o.fmt(this.settings[o.key]), 25 * T, row * T, col, 16, 'right');
    });
    this.text('UP/DOWN SELECT   LEFT/RIGHT CHANGE', mid, 28.5 * T, COLOR.grey, 8, 'center');

    this.text('PAC-MAN', 4 * T, 29.6 * T, COLOR.pac);
    this.text('W A S D', 16 * T, 29.6 * T, COLOR.pac);
    this.text('GHOST', 4 * T, 30.9 * T, COLOR.red);
    this.text('ARROWS', 16 * T, 30.9 * T, COLOR.red);
    if (Math.floor(t * 2.5) % 2 === 0) this.text('PRESS ENTER TO START', mid, 32.5 * T, COLOR.text, 16, 'center');
    this.text('P PAUSE   M MUTE   F FULLSCREEN', mid, 34.5 * T, COLOR.grey, 8, 'center');
  }

  drawTitleCharacters(t) {
    const mid = WIDTH / 2, frame = Math.floor(t * 7.5) % 2;
    this.text('CHARACTER / NICKNAME', mid, 8 * T, COLOR.text, 16, 'center');
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
  }

  drawTitleBonus(t) {
    const mid = WIDTH / 2;
    this.text('- BONUS FRUIT -', mid, 8 * T, COLOR.text, 16, 'center');
    FRUIT_ORDER.forEach((k, i) => {
      const x = i < 4 ? 3 : 15, row = 10 + (i % 4) * 1.75;
      this.blit(Sprites.fruit(k), (x + 0.5) * T, (row + 0.5) * T);
      this.text(`${FRUITS[k].pts} PTS`, (x + 2) * T, row * T, COLOR.text);
    });
    this.text('TREATS ROAM THE MAZE', mid, 17.4 * T, COLOR.pink, 16, 'center');
    TREAT_ORDER.forEach((k, i) => {
      const x = (4 + i * 6.5) * T;
      const hop = -Math.abs(Math.sin(t * 7 + i)) * 4;
      this.blit(Sprites.treat(k), x, 19.3 * T + hop);
      this.text(String(TREATS[k].pts), x, 20.3 * T, COLOR.text, 8, 'center');
    });
    this.text('GHOST GRABS ONE = SUGAR RUSH', mid, 21.2 * T, COLOR.red, 8, 'center');
  }

  // Attract-mode chase: Pac-Man runs from the ghosts, grabs a pellet, turns the tables.
  drawAttract(t) {
    const cy = 20.5 * T, tt = t % 9, mouth = MOUTHS[Math.floor(t * 15) % 4];
    if (tt < 4.5) {
      const px = 29 - tt * 6.1;
      if (Math.floor(t * 3) % 2 === 0) this.blit(Sprites.pellet(), 1.5 * T, cy);
      this.blit(Sprites.pac(Math.PI, mouth), px * T, cy);
      GHOST_ORDER.forEach((k, i) => {
        this.blit(Sprites.ghost(GHOSTS[k].color, Math.floor(t * 7.5) % 2, LEFT), (px + 2.5 + 2 * i) * T, cy);
      });
    } else {
      const tb = tt - 4.5, px = 1.5 + tb * 5.5;
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

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  } catch { /* fullscreen not available here */ }
}

(function boot() {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  window.game = game;

  const bezel = document.getElementById('bezel');
  const lights = document.getElementById('lights');
  const help = document.getElementById('help');
  const BULB_COLORS = ['#FF0000', '#FFB8FF', '#00FFFF', '#FFB852', '#FFFF00'];

  function layoutBulbs() {
    lights.innerHTML = '';
    const w = bezel.clientWidth, h = bezel.clientHeight, inset = 7, gap = 20;
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

  // Fill as much of the window as the arcade's 7:9 screen allows.
  function fit() {
    document.body.classList.toggle('fullscreen', !!document.fullscreenElement);
    const pad = 2 * 14 + 4; // bezel padding + frame
    const helpH = document.fullscreenElement ? 0 : help.offsetHeight + 10;
    const availW = window.innerWidth - (document.fullscreenElement ? 0 : 32) - pad;
    const availH = window.innerHeight - helpH - pad - 12;
    const s = Math.max(0.3, Math.min(availW / WIDTH, availH / HEIGHT));
    canvas.style.width = Math.floor(WIDTH * s) + 'px';
    canvas.style.height = Math.floor(HEIGHT * s) + 'px';
    game.setScale(Math.min(4, Math.max(1, Math.ceil(s * (window.devicePixelRatio || 1)))));
    layoutBulbs();
  }
  window.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', fit);
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

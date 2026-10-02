/* Pac-Man Versus — game flow, rules, rendering and input.
   VS GHOST: player 1 is Pac-Man (WASD), player 2 is Blinky the ghost (arrows).
   CO-OP:    player 1 is Pac-Man (WASD), player 2 is Ms. Pac-Man (arrows),
             together against the AI ghosts. */
'use strict';

// Set by the Android TV app (index.html?tv=1): controller-first hints, TV-friendly rendering.
const TV_MODE = new URLSearchParams(location.search).get('tv') === '1';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.k = 0;
    this.font = '';
    this.maze = new Maze();
    this.eyesMap = distanceMap(this.maze, [[13, 11]]);
    this.exitMap = distanceMap(this.maze, [[0, 14], [COLS - 1, 14]]);

    // Everything read back from storage is validated before use.
    this.settings = sanitizeSettings(store.get(SETTINGS_KEY, null) || store.get(LEGACY_SETTINGS_KEY, null));
    this.hiscore = safeInt(store.get('pacvs-hiscore', 0), 0, 999999990, 0);
    this.bestLevel = safeInt(store.get('pacvs-best-level', 1), 1, 1000000, 1); // unlocks fruit on the title page
    this.rules = Object.freeze({ ...this.settings }); // the settings a match was started with

    this.fruitNews = null;
    this.series = { pac: 0, ghost: 0 };
    this.duelSeries = { pac: 0, ms: 0 };
    this.menuIndex = 0;
    this.time = 0;
    this.paused = false;
    this.lights = '';
    this.toastText = '';
    this.toastLife = 0;
    this.onModeChange = () => {};
    this.pacs = [new Pacman(this)];
    this.ghosts = [];
    this.playerGhost = null;
    this.blinky = null;
    this.popups = [];
    this.score = 0;
    this.catches = 0;
    this.level = 1;
    this.lives = 0;
    this.stats = { ghosts: 0, fruit: 0, treats: 0, rushes: 0 };
    this.speeds = computeSpeeds(1, this.settings.ghostSpeed);

    // Turn logic for the human-driven Pac-Men (the player ghost has its own, with the no-up rule).
    this.playerCenter = a => {
      const c = Math.floor(a.x), r = Math.floor(a.y);
      if (a.want && this.maze.walkable(c + a.want.x, r + a.want.y)) {
        a.dir = a.want;
        a.moving = true;
      } else {
        a.moving = this.maze.walkable(c + a.dir.x, r + a.dir.y);
      }
    };

    this.wallsBlue = renderWalls(COLOR.wall);
    this.wallsWhite = renderWalls('#FFFFFF');

    // The board (walls + dots) is baked into one layer at device resolution, so
    // each frame is a single straight copy. Eaten dots are erased from it one
    // at a time instead of redrawing ~240 dot sprites every frame.
    this.boardLayer = document.createElement('canvas');
    this.flashLayer = document.createElement('canvas');
    this.pellets = [];
    LAYOUT.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'o') this.pellets.push([c, r]); }));
    this.maze.onTake = (c, r, ch) => {
      if (ch !== '.') return;
      const k = this.k, g = this.boardLayer.getContext('2d');
      g.setTransform(k, 0, 0, k, 0, 0); // set explicitly so the scale is applied exactly once
      g.fillStyle = '#000';
      g.fillRect(c * T + T / 2 - 2, r * T + T / 2 - 2, 4, 4);
    };

    this.setScale(1);
    this.state = 'title';
  }

  get pac() { return this.pacs[0]; }
  get coop() { return this.rules.mode === 'coop'; }
  get duel() { return this.rules.mode === 'duel'; }
  get twoPac() { return this.rules.mode !== 'versus'; }
  // VS GHOST keeps one score and one life count; co-op lets you choose; DUEL is always separate
  get sharedScore() { return this.rules.mode === 'versus' || (this.coop && this.rules.scoreMode === 'shared'); }
  get sharedLives() { return this.rules.mode === 'versus' || (this.coop && this.rules.livesMode === 'shared'); }

  // Render at `k` device pixels per canvas unit so the board stays sharp at any size.
  setScale(k) {
    if (k === this.k) return;
    this.k = k;
    this.font = '';
    this.canvas.width = WIDTH * k;
    this.canvas.height = HEIGHT * k;
    for (const layer of [this.boardLayer, this.flashLayer]) {
      layer.width = COLS * T * k;
      layer.height = MAZE_ROWS * T * k;
    }
    const f = this.flashLayer.getContext('2d', { alpha: false });
    f.imageSmoothingEnabled = false;
    f.fillStyle = '#000';
    f.fillRect(0, 0, f.canvas.width, f.canvas.height);
    f.drawImage(this.wallsWhite, 0, 0, f.canvas.width, f.canvas.height);
    this.drawBoardLayer();
  }

  // Walls plus every dot still on the board, upscaled with hard pixel edges.
  drawBoardLayer() {
    const g = this.boardLayer.getContext('2d', { alpha: false }), k = this.k, dot = Sprites.dot();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.wallsBlue, 0, 0, g.canvas.width, g.canvas.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    this.maze.grid.forEach((row, r) => row.forEach((ch, c) => {
      if (ch === '.') g.drawImage(dot, c * T + T / 2 - 2, r * T + T / 2 - 2);
    }));
  }

  /* ---------- flow ---------- */

  newMatch() {
    this.rules = Object.freeze({ ...this.settings });
    this.pacs = PAC_STARTS[this.rules.mode].map(start => new Pacman(this, start));
    for (const p of this.pacs) p.lives = this.rules.lives;
    // a shared pool holds both players' lives
    this.lives = this.coop && this.sharedLives ? this.rules.lives * 2 : this.rules.lives;
    this.level = 1;
    this.score = 0;
    this.catches = 0;
    this.extraGiven = false;
    this.levelsCleared = 0;
    this.winner = null;
    this.duelEnd = 0;
    this.stats = { ghosts: 0, fruit: 0, treats: 0, rushes: 0 };
    this.startLevel(true);
  }

  startLevel(first) {
    const kind = fruitForLevel(this.level);
    this.fruitNews = null;
    if (fruitUnlockLevel(kind) === this.level) {
      this.fruitNews = { kind, isNew: this.level > this.bestLevel, life: 7 };
    }
    if (this.level > this.bestLevel) {
      this.bestLevel = this.level;
      store.set('pacvs-best-level', this.bestLevel);
    }
    this.maze.reset();
    this.drawBoardLayer();
    this.dotsEaten = 0;
    this.speeds = computeSpeeds(this.level, this.rules.ghostSpeed);
    this.houseDots = { pinky: 0, inky: 0, clyde: 0 };
    this.globalCounter = null;
    this.elroySuspended = false;
    this.elroyShown = 0;
    this.resetActors();
    this.state = 'ready';
    this.readyTimer = first ? 4.3 : 3;
    if (first) {
      if (Sound.hasTheme()) { if (!Sound.themePlaying()) Sound.playTheme(false); }
      else Sound.intro();
    }
  }

  resetActors() {
    for (const p of this.pacs) if (!p.out) p.reset();
    this.buildGhosts();
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

  buildGhosts() {
    const r = this.rules, list = [];
    if (this.twoPac) {
      for (const k of GHOST_ORDER.slice(0, r.coopGhosts)) list.push(new Ghost(this, k, false));
    } else {
      list.push(new Ghost(this, 'blinky', true));
      for (const k of GHOST_ORDER.slice(1, 1 + r.ai)) list.push(new Ghost(this, k, false));
    }
    if (r.extra) list.push(new Ghost(this, 'funky', false));
    this.ghosts = list;
    this.playerGhost = this.twoPac ? null : list[0];
    this.blinky = list.find(g => g.kind === 'blinky') || null;
  }

  gameOver(winner) {
    this.state = 'over';
    this.winner = winner;
    this.overTimer = 0;
    if (this.duel) { if (winner !== 'draw') this.duelSeries[winner]++; }
    else if (!this.coop && this.rules.goal) this.series[winner]++;
    this.save();
    if (winner === 'ghost' || winner === 'ghosts' || winner === 'draw') Sound.lose(); else Sound.win();
  }

  // Points go to the team (shared) or to the Pac-Man who earned them.
  addScore(n, pac) {
    if (this.sharedScore) {
      this.score += n;
      if (!this.extraGiven && this.score >= 10000) { this.extraGiven = true; this.grantLife(null); }
      if (this.score > this.hiscore) this.hiscore = this.score;
    } else {
      pac.score += n;
      if (!pac.extraGiven && pac.score >= 10000) { pac.extraGiven = true; this.grantLife(pac); }
      if (pac.score > this.hiscore) this.hiscore = pac.score;
    }
  }

  grantLife(pac) {
    if (this.sharedLives) this.lives++;
    else if (pac) pac.lives++;
    else for (const p of this.pacs) if (!p.out) p.lives++;
    Sound.extraLife();
  }

  popup(x, y, text, color, life) {
    this.popups.push({ x, y, text, color, life });
  }

  toast(text) {
    this.toastText = String(text).slice(0, 40);
    this.toastLife = 3;
  }

  /* ---------- update ---------- */

  update(dt) {
    if (this.toastLife > 0) this.toastLife -= dt;
    if (this.paused) { this.setLights('pause'); return; }
    this.time += dt;
    if (this.fruitNews && (this.state === 'ready' || this.state === 'play')) {
      this.fruitNews.life -= dt;
      if (this.fruitNews.life <= 0) this.fruitNews = null;
    }
    switch (this.state) {
      case 'ready':
        this.readyTimer -= dt;
        if (this.readyTimer <= 0) {
          this.state = 'play';
          if (Sound.themePlaying()) Sound.fadeTheme();
        }
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
        if (this.dieTimer >= 3) this.afterDeath();
        break;
      case 'clear':
        this.clearTimer += dt;
        if (this.clearTimer >= 3) {
          const act = INTERMISSIONS[this.level];
          if (this.rules.goal && this.levelsCleared >= this.rules.goal) {
            if (this.duel) this.finishDuel(); else this.gameOver(this.coop ? 'team' : 'pac');
          }
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

  afterDeath() {
    let over;
    if (this.sharedLives) {
      this.lives--;
      over = this.lives <= 0;
    } else {
      const p = this.dyingPac;
      p.lives--;
      if (p.lives <= 0) p.out = true;
      over = this.pacs.every(q => q.out);
    }
    if (over) { this.gameOver(this.coop ? 'ghosts' : 'ghost'); return; }
    this.resetActors();
    this.globalCounter = 0; // arcade: after a death the house uses one shared dot counter
    this.elroySuspended = this.ghosts.some(g => g.kind === 'clyde');
    this.state = 'ready';
    this.readyTimer = 2;
  }

  nextLevel() {
    Sound.stopMusic();
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
    if (this.popups.length) this.updatePopups(dt);
    if (this.duel) { this.updateDuel(dt); if (this.state !== 'play') return; }
    this.updateHouse(dt);
    this.updateElroy();

    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    const pacSpeed = this.powerTime > 0 ? this.speeds.pacFright : this.speeds.pac;
    step: for (let i = 0; i < steps && this.state === 'play'; i++) {
      for (const p of this.pacs) {
        if (p.out || p.deadTimer > 0) continue;
        p.update(h, pacSpeed);
        this.eat(p);
        if (this.state !== 'play') break step;
      }
      for (const g of this.ghosts) g.update(h);
      if (this.treat) this.treat.update(h);
      this.checkTreat();
      this.checkCollisions();
    }

    const pg = this.playerGhost;
    if (pg) {
      if (pg.rush > 0 && pg.state === 'active') {
        pg.trail.unshift({ x: pg.x, y: pg.y });
        if (pg.trail.length > 12) pg.trail.length = 12;
      } else if (pg.trail.length) {
        pg.trail = [];
      }
    }
  }

  updatePopups(dt) {
    for (const p of this.popups) p.life -= dt;
    this.popups = this.popups.filter(p => p.life > 0);
  }

  // Arcade ghost-house release: dot counters, plus a timer if Pac-Man stops eating.
  updateHouse(dt) {
    if (this.elroySuspended && !this.ghosts.some(g => g.kind === 'clyde' && g.state === 'house')) this.elroySuspended = false;
    const next = this.ghosts.find(g => g.state === 'house');
    if (!next) return;
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
    if (this.elroySuspended || !this.blinky || !this.maze.total) return 0;
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

  eat(pac) {
    const got = this.maze.take(Math.floor(pac.x), Math.floor(pac.y));
    if (got) {
      this.dotsEaten++;
      this.onDotForHouse();
      if (got === '.') {
        this.addScore(10, pac);
        pac.stall += 1 / 60;
        Sound.waka();
      } else {
        this.addScore(50, pac);
        pac.stall += 3 / 60;
        this.frighten(pac);
      }
      if (this.dotsEaten === 70 || this.dotsEaten === 170) {
        const kind = fruitForLevel(this.level);
        this.fruit = { kind, pts: FRUITS[kind].pts, x: FRUIT_SPOT.x, y: FRUIT_SPOT.y, life: 9.33 + Math.random() * 0.67 };
      }
      const treatIndex = TREAT_DOTS.indexOf(this.dotsEaten);
      if (this.rules.treats && treatIndex >= 0 && !this.treat) {
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
    if (this.fruit && tileDist(pac, this.fruit) < 0.7) {
      this.addScore(this.fruit.pts, pac);
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
    for (const p of this.pacs) {
      if (p.out || p.deadTimer > 0 || tileDist(p, t) >= 0.7) continue;
      this.addScore(t.pts, p);
      this.popup(t.x, t.y, String(t.pts), COLOR.pink, 2);
      this.stats.treats++;
      this.treat = null;
      Sound.fruit();
      return;
    }
    const pg = this.playerGhost;
    if (pg && pg.state === 'active' && tileDist(pg, t) < 0.7) {
      pg.rush = SUGAR_RUSH.time;
      this.popup(t.x, t.y - 0.6, 'SUGAR RUSH!', COLOR.red, 1.6);
      this.stats.rushes++;
      this.treat = null;
      Sound.sugarRush();
    }
  }

  frighten(pac) {
    const time = byLevel(FRIGHT_TIME, this.level);
    this.chain = 0;
    for (const g of this.ghosts) if (!g.isPlayer && g.state === 'active') reverseIfOpen(g, this.maze);
    if (time <= 0) return; // from level 17 on, a pellet only turns the ghosts around
    this.powerTime = time;
    this.flashes = byLevel(FRIGHT_FLASHES, this.level);
    if (this.duel && pac) {
      pac.power = time;
      this.popup(pac.x, pac.y - 1, 'SUPER!', COLOR.pac, 1);
    }
    for (const g of this.ghosts) if (!g.isEyes && g.state !== 'waiting') g.frightened = true;
  }

  checkCollisions() {
    for (const p of this.pacs) {
      if (p.out || p.deadTimer > 0) continue;
      for (const g of this.ghosts) {
        if (g.state !== 'active' || tileDist(p, g) >= HIT_RADIUS) continue;
        if (this.duel && !g.frightened) {
          if (p.safe <= 0) this.duelDeath(p);
          continue;
        }
        if (g.frightened) {
          const pts = 200 * 2 ** Math.min(this.chain, 3);
          this.chain++;
          this.addScore(pts, p);
          this.stats.ghosts++;
          g.frightened = false;
          g.state = 'eyes';
          g.rush = 0;
          this.popup(g.x, g.y, String(pts), COLOR.cyan, 0.8);
          this.state = 'freeze';
          this.freezeTimer = 0.8;
          this.eatenGhost = g;
          this.eaterPac = p;
          Sound.eatGhost();
        } else {
          this.state = 'dying';
          this.dieTimer = 0;
          this.deathSfx = false;
          this.dyingPac = p;
          this.catches++;
        }
        return;
      }
    }
    if (this.duel) this.checkRivals();
  }

  /* ---------- DUEL ---------- */

  updateDuel(dt) {
    for (const p of this.pacs) {
      if (p.out) continue;
      if (p.power > 0) p.power = Math.max(0, p.power - dt);
      if (p.safe > 0) p.safe = Math.max(0, p.safe - dt);
      if (p.deadTimer > 0) {
        p.deadTimer -= dt;
        if (p.deadTimer <= 0) {
          if (p.lives > 0) { p.reset(); p.safe = DUEL.safe; }
          else p.out = true;
        }
      }
    }
    if (this.duelEnd > 0) {
      this.duelEnd -= dt;
      if (this.duelEnd <= 0) this.finishDuel();
    }
  }

  // A ghost catch only costs that player a life; the rival keeps playing.
  duelDeath(p) {
    p.lives--;
    p.deadTimer = DUEL.respawn;
    p.power = 0;
    p.stall = 0;
    this.catches++;
    Sound.death();
    if (p.lives <= 0 && !this.duelEnd) this.duelEnd = DUEL.endDelay;
  }

  // While SUPER you can eat your rival: points for you, a trip home for them.
  checkRivals() {
    const [a, b] = this.pacs;
    if (!a || !b || a.out || b.out || a.deadTimer > 0 || b.deadTimer > 0) return;
    if ((a.power > 0) === (b.power > 0) || tileDist(a, b) >= HIT_RADIUS) return;
    const [winner, loser] = a.power > 0 ? [a, b] : [b, a];
    if (loser.safe > 0) return;
    this.addScore(DUEL.chompPts, winner);
    winner.chomps++;
    this.popup(loser.x, loser.y, 'CHOMP! ' + DUEL.chompPts, winner.who === 'ms' ? COLOR.pink : COLOR.pac, 1.4);
    Sound.eatGhost();
    loser.reset();
    loser.safe = DUEL.safe;
  }

  finishDuel() {
    const [a, b] = this.pacs;
    this.gameOver(a.score === b.score ? 'draw' : a.score > b.score ? 'pac' : 'ms');
  }

  // Same arcade rules for every ghost, whoever is steering it: tunnel slowdown
  // first, then fright, then normal speed (with Cruise Elroy for Blinky).
  ghostSpeed(g) {
    const sp = this.speeds, inTunnel = Math.floor(g.y) === 14 && (g.x < 6 || g.x >= 22);
    const stage = g.kind === 'blinky' ? this.elroyStage() : 0;
    const elroy = stage === 2 ? sp.elroy2 : stage === 1 ? sp.elroy1 : 1;
    const rush = g.rush > 0 ? SUGAR_RUSH.mult : 1;
    return (inTunnel ? sp.tunnel : g.frightened ? sp.fright : sp.ai * elroy) * sp.ghostMult * rush;
  }

  // The Pac-Man an AI ghost is hunting: whichever is closest.
  nearestPac(g) {
    let best = this.pacs[0], bd = Infinity;
    for (const p of this.pacs) {
      if (p.out || p.deadTimer > 0) continue;
      const d = tileDist(p, g);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // Classic arcade targeting for the AI-controlled ghosts, including the
  // original bug where "ahead" also shifts left when Pac-Man faces up.
  targetFor(g) {
    const elroyChase = g.kind === 'blinky' && this.elroyStage() > 0; // Elroy ignores scatter
    if (this.modeIndex % 2 === 0 && !elroyChase) return g.info.corner;
    const p = this.nearestPac(g), pc = Math.floor(p.x), pr = Math.floor(p.y), d = p.dir;
    const ahead = n => ({ x: pc + n * d.x - (d === UP ? n : 0), y: pr + n * d.y });
    switch (g.kind) {
      case 'pinky':
        return ahead(4);
      case 'inky': {
        const b = this.blinky || g, a = ahead(2);
        return { x: 2 * a.x - Math.floor(b.x), y: 2 * a.y - Math.floor(b.y) };
      }
      case 'clyde': {
        const dx = Math.floor(g.x) - pc, dy = Math.floor(g.y) - pr;
        return dx * dx + dy * dy > 64 ? { x: pc, y: pr } : g.info.corner;
      }
      case 'funky': {
        // closes in directly from afar, then aims behind Pac-Man to cut off the retreat
        const dx = Math.floor(g.x) - pc, dy = Math.floor(g.y) - pr;
        return dx * dx + dy * dy > 64 ? { x: pc, y: pr } : { x: pc - 4 * d.x, y: pr - 4 * d.y };
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
        return this.playerGhost && this.playerGhost.rush > 0 ? 'rush' : 'play';
      case 'freeze': return 'fright';
      case 'dying': return 'dead';
      case 'clear': return 'clear';
      case 'cutscene': return 'idle';
      case 'over': return ['pac', 'team', 'ms'].includes(this.winner) ? 'win-pac' : 'win-ghost';
      default: return 'play';
    }
  }

  setLights(mode) {
    if (mode === this.lights) return;
    this.lights = mode;
    document.body.dataset.lights = mode;
  }

  /* ---------- input ---------- */

  visibleOptions() { return OPTIONS.filter(o => o.show(this.settings)); }

  onKey(code, repeat) {
    if (code === 'KeyM') { if (!repeat) Sound.toggleMute(); return; }
    if (code === 'KeyF') { if (!repeat) toggleFullscreen(); return; }
    const isStart = code === 'Enter' || code === 'NumpadEnter' || code === 'Space';

    if (this.state === 'title') {
      const opts = this.visibleOptions();
      this.menuIndex = Math.min(this.menuIndex, opts.length - 1);
      const dir = GHOST_KEYS[code] || PAC_KEYS[code];
      if (dir === UP || dir === DOWN) {
        this.menuIndex = (this.menuIndex + dir.y + opts.length) % opts.length;
        Sound.menu();
      } else if (dir) {
        const o = opts[this.menuIndex];
        const i = o.values.indexOf(this.settings[o.key]);
        this.settings[o.key] = o.values[(i + dir.x + o.values.length) % o.values.length];
        store.set(SETTINGS_KEY, this.settings);
        if (o.key === 'mode') this.onModeChange(this.settings.mode);
        Sound.menu();
      } else if (code === 'KeyT' && !repeat) {
        Theme.pick(msg => this.toast(msg));
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
      Sound.setPaused(this.paused);
      return;
    }
    if (this.paused) {
      if (code === 'KeyQ') this.toTitle();
      return;
    }
    if (PAC_KEYS[code]) this.pacs[0].want = PAC_KEYS[code];
    if (GHOST_KEYS[code]) {
      const p2 = this.twoPac ? this.pacs[1] : this.playerGhost;
      if (p2) p2.want = GHOST_KEYS[code];
    }
  }

  toTitle() {
    this.paused = false;
    Sound.setPaused(false);
    Sound.stopMusic();
    this.state = 'title';
    this.cutscene = null;
    this.save();
    Sound.setSiren('off');
    if (Sound.hasTheme()) Sound.playTheme(true);
  }

  // Controller buttons (see input.js). Directions arrive as the owning player's keys.
  //   A: start / confirm / resume   B: back   MENU: pause   VIEW: mute
  onPadButton(name) {
    const s = this.state;
    if (name === 'view') { this.onKey('KeyM', false); return; }
    if (name === 'menu') { if (!['title', 'over', 'cutscene'].includes(s)) this.onKey('KeyP', false); return; }
    if (name === 'a') { this.onKey(this.paused ? 'KeyP' : 'Enter', false); return; }
    if (name === 'b') this.back();
  }

  // B on a controller, or the TV remote's Back. Returns 'exit' on the title screen
  // so the TV app knows to close.
  back() {
    if (this.state === 'title') return 'exit';
    if (this.paused) this.onKey('KeyQ', false);
    else if (this.state === 'over') this.onKey('Escape', false);
    else if (this.state === 'cutscene') this.onKey('Enter', false);
    else this.onKey('KeyP', false);
    return 'ok';
  }

  pauseIfActive() {
    if (!['title', 'over', 'cutscene'].includes(this.state) && !this.paused) {
      this.paused = true;
      Sound.setPaused(true);
    }
    this.save();
  }

  save() {
    store.set('pacvs-hiscore', this.hiscore);
    store.set('pacvs-best-level', this.bestLevel);
  }

  /* ---------- rendering ---------- */

  text(str, x, y, color, size = 16, align = 'left') {
    const c = this.ctx;
    const font = size === 16 ? '16px "Press Start 2P", monospace' : `${size}px "Press Start 2P", monospace`;
    if (font !== this.font) { c.font = font; this.font = font; } // font parsing is the slow part
    c.textAlign = align;
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

  pacSprite(p, mouth) {
    const angle = Math.atan2(p.dir.y, p.dir.x);
    return p.who === 'ms' ? Sprites.msPac(angle, mouth) : Sprites.pac(angle, mouth);
  }

  render() {
    const c = this.ctx;
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    c.imageSmoothingEnabled = false;
    c.textBaseline = 'top';
    c.fillStyle = '#000';
    const boardShown = this.state !== 'title' && this.state !== 'cutscene';
    if (boardShown) {
      // the opaque board layer repaints the maze area, so only clear the HUD strips
      c.fillRect(0, 0, WIDTH, TOP * T);
      c.fillRect(0, (TOP + MAZE_ROWS) * T, WIDTH, HEIGHT - (TOP + MAZE_ROWS) * T);
    } else {
      c.fillRect(0, 0, WIDTH, HEIGHT);
    }
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
    const inMatch = this.state !== 'title';
    const coop = inMatch && this.twoPac, separate = coop && !this.sharedScore;

    // left: Pac-Man (or the team), right: the ghost player, Ms. Pac-Man, or catches
    if (!playing || blink) this.text(coop && !separate ? 'TEAM' : 'PAC-MAN', T, 0, COLOR.pac);
    this.text('HIGH SCORE', 9 * T, 0, COLOR.text);
    if (separate) this.text('MS PAC', 27 * T, 0, COLOR.pink, 16, 'right');
    else this.text(coop ? 'CAUGHT' : 'GHOST', 27 * T, 0, COLOR.red, 16, 'right');
    const left = separate ? this.pacs[0].score : this.score;
    this.text(left ? String(left) : '00', 8 * T, T, COLOR.text, 16, 'right');
    this.text(this.hiscore ? String(this.hiscore) : '00', 17 * T, T, COLOR.text, 16, 'right');
    const right = separate ? this.pacs[1].score : this.catches;
    this.text(separate && !right ? '00' : String(right), 27 * T, T, COLOR.text, 16, 'right');

    if (!inMatch) {
      if (this.toastLife > 0) this.text(this.toastText, WIDTH / 2, 2 * T + 4, COLOR.pink, 8, 'center');
      return;
    }
    const goal = this.rules.goal;
    const news = this.fruitNews;
    if (news && (this.state === 'ready' || this.state === 'play')) {
      const f = FRUITS[news.kind];
      this.text(`${news.isNew ? 'NEW FRUIT' : 'FRUIT'}: ${f.name} ${f.pts}`, WIDTH / 2, 2 * T + 4, blink ? COLOR.pink : COLOR.text, 8, 'center');
    } else {
      this.text(`LEVEL ${this.level}${goal ? ' OF ' + goal : ''}`, WIDTH / 2, 2 * T + 4, COLOR.grey, 8, 'center');
    }
    if (playing) {
      const pg = this.playerGhost, stage = this.elroyStage();
      if (pg && pg.rush > 0) this.text('SUGAR RUSH', 27 * T, 2 * T + 4, blink ? COLOR.pink : COLOR.red, 8, 'right');
      else if (stage) this.text(stage === 2 ? 'ELROY 2' : 'ELROY', 27 * T, 2 * T + 4, blink ? COLOR.red : COLOR.text, 8, 'right');
    }

    this.drawLives();
    const shown = Math.min(this.level, 7);
    for (let k = 0; k < shown; k++) if (k || !news || blink) this.blit(Sprites.fruit(fruitForLevel(this.level - k)), (26 - 2 * k) * T, 35 * T);
  }

  drawLives() {
    const icon = MOUTHS[2], y = 35 * T, ty = 34.5 * T;
    if (!this.twoPac) {
      const icons = Math.min(Math.max(this.lives - 1, 0), 5);
      for (let i = 0; i < icons; i++) this.blit(Sprites.pac(Math.PI, icon), (2 + 2 * i) * T, y);
    } else if (this.sharedLives) {
      this.blit(Sprites.pac(Math.PI, icon), 2 * T, y);
      this.blit(Sprites.msPac(Math.PI, icon), 3.8 * T, y);
      this.text('x' + this.lives, 5 * T, ty, COLOR.text);
    } else {
      this.pacs.forEach((p, i) => {
        const x = (2 + i * 5) * T;
        this.blit(this.pacSprite({ who: p.who, dir: LEFT }, icon), x, y);
        this.text('x' + p.lives, x + 1.2 * T, ty, p.out ? COLOR.grey : COLOR.text);
      });
    }
  }

  drawMaze() {
    const c = this.ctx;
    const flashing = this.state === 'clear' && this.clearTimer > 1 && this.clearTimer < 2.6 &&
      Math.floor((this.clearTimer - 1) / 0.2) % 2 === 0;
    c.drawImage(flashing ? this.flashLayer : this.boardLayer, 0, TOP * T, COLS * T, MAZE_ROWS * T);
    if (this.state === 'clear' || this.state === 'over') return;

    if (this.state !== 'play' || Math.floor(this.time * 6) % 2 === 0) {
      const pellet = Sprites.pellet();
      for (const [col, r] of this.pellets) {
        if (this.maze.grid[r][col] === 'o') this.blit(pellet, col * T + T / 2, (r + TOP) * T + T / 2);
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
        if (g.state === 'waiting' || (s === 'freeze' && g === this.eatenGhost)) continue;
        const spr = this.ghostSprite(g, frame);
        for (let i = 2; i < g.trail.length; i += 3) {
          c.globalAlpha = 0.35 - i * 0.025;
          this.blit(spr, ...this.pos(g.trail[i]));
        }
        c.globalAlpha = 1;
        this.blit(spr, ...this.pos(g));
      }
    }

    if (!intro) {
      for (const p of this.pacs) {
        if (p.out || (s === 'freeze' && p === this.eaterPac)) continue;
        const [px, py] = this.pos(p);
        if (dyingLate && p === this.dyingPac) {
          this.drawDeath(p, px, py, (this.dieTimer - 1) / 1.3);
        } else if (p.deadTimer > 0) {
          this.drawDeath(p, px, py, (DUEL.respawn - p.deadTimer) / 1.3); // DUEL: dies in place
        } else if (!(p.safe > 0 && Math.floor(this.time * 10) % 2)) {     // blink while respawn-safe
          const mouth = s === 'ready' || s === 'clear' ? 0 : p.mouth;
          if (p.power > 0) this.blitScaled(this.pacSprite(p, mouth), px, py, DUEL.superScale);
          else this.blit(this.pacSprite(p, mouth), px, py);
        }
      }
    }

    for (const p of this.popups) {
      const [x, y] = this.pos(p);
      this.text(p.text, x, y - 4, p.color, 8, 'center');
    }

    if (s === 'ready' && !intro) {
      this.pacs.forEach((p, i) => {
        if (p.out) return;
        const [px, py] = this.pos(p);
        this.text('P' + (i + 1), px, py - 26, p.who === 'ms' ? COLOR.pink : COLOR.pac, 8, 'center');
      });
      if (this.playerGhost) {
        const [gx, gy] = this.pos(this.playerGhost);
        this.text('P2', gx, gy - 26, COLOR.red, 8, 'center');
      }
    }
  }

  // Pac-Man folds up like the arcade; Ms. Pac-Man spins, as in her own game.
  drawDeath(p, x, y, t) {
    if (t >= 1) { if (t < 1.25) this.drawPop(x, y); return; }
    if (p.who === 'ms') {
      const dirs = [RIGHT, DOWN, LEFT, UP];
      this.blit(this.pacSprite({ who: 'ms', dir: dirs[Math.floor(t * 12) % 4] }, MOUTHS[1]), x, y);
    } else {
      const step = Math.round(Math.max(0.05, t) * 12) / 12;
      this.blit(Sprites.pac(-Math.PI / 2, step * Math.PI), x, y);
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

    if (this.duel) { this.drawDuelResults(x, y, w, mid); return; }
    const coop = this.coop, endless = !this.rules.goal;
    const won = this.winner === 'pac' || this.winner === 'team';
    const flash = Math.floor(this.time * 4) % 2 === 0;
    const mouth = MOUTHS[Math.floor(this.time * 15) % 4];
    let headline;
    if (endless) headline = `REACHED LEVEL ${this.level}`;
    else if (coop) headline = won ? 'YOU WIN!' : 'GAME OVER';
    else headline = won ? 'PAC-MAN WINS!' : 'GHOST WINS!';
    this.text(headline, mid, y + 2 * T, flash ? (won || endless ? COLOR.pac : COLOR.red) : '#FFFFFF', 16, 'center');
    if (coop) {
      this.blit(Sprites.pac(0, mouth), mid - T, y + 4.5 * T);
      this.blit(Sprites.msPac(Math.PI, mouth), mid + T, y + 4.5 * T);
    } else if (won) {
      this.blit(Sprites.pac(0, mouth), mid, y + 4.5 * T);
    } else {
      this.blit(Sprites.ghost(GHOSTS.blinky.color, Math.floor(this.time * 7.5) % 2, LEFT), mid, y + 4.5 * T);
    }

    const goal = this.rules.goal, st = this.stats;
    const levelRow = goal ? ['LEVELS', this.levelsCleared + '/' + goal, COLOR.text] : ['BEST LEVEL', this.bestLevel, COLOR.text];
    const rows = coop ? [
      ...(this.sharedScore
        ? [['TEAM SCORE', this.score, COLOR.pac]]
        : [['PAC-MAN', this.pacs[0].score, COLOR.pac], ['MS PAC-MAN', this.pacs[1].score, COLOR.pink]]),
      levelRow,
      ['GHOSTS EATEN', st.ghosts, COLOR.cyan],
      ['FRUIT', st.fruit, COLOR.pink],
      ['TREATS', st.treats, COLOR.pink],
      ['TIMES CAUGHT', this.catches, COLOR.red],
    ] : [
      ['SCORE', this.score, COLOR.text],
      levelRow,
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

    if (endless) {
      const best = this.level >= this.bestLevel;
      this.text(best ? 'NEW BEST LEVEL!' : `BEST EVER: LEVEL ${this.bestLevel}`, mid, y + 17.5 * T, best && flash ? COLOR.pac : COLOR.text, 16, 'center');
    } else if (!coop) {
      this.text('SERIES', mid, y + 17 * T, COLOR.grey, 8, 'center');
      this.text(`PAC ${this.series.pac}  -  ${this.series.ghost} GHOST`, mid, y + 18 * T, COLOR.text, 16, 'center');
    }
    if (this.overTimer > 1.5 && flash) this.text('ENTER  REMATCH', mid, y + 20.5 * T, COLOR.pac, 16, 'center');
    this.text('ESC  MENU', mid, y + 22.3 * T, COLOR.grey, 8, 'center');
  }

  drawDuelResults(x, y, w, mid) {
    const [a, b] = this.pacs, win = this.winner;
    const flash = Math.floor(this.time * 4) % 2 === 0;
    const mouth = MOUTHS[Math.floor(this.time * 15) % 4];
    const headline = win === 'draw' ? "IT'S A DRAW!" : win === 'ms' ? 'MS PAC-MAN WINS!' : 'PAC-MAN WINS!';
    this.text(headline, mid, y + 2 * T, flash ? (win === 'ms' ? COLOR.pink : COLOR.pac) : '#FFFFFF', 16, 'center');
    if (win === 'pac') this.blitScaled(Sprites.pac(0, mouth), mid, y + 4.5 * T, 1.6);
    else if (win === 'ms') this.blitScaled(Sprites.msPac(Math.PI, mouth), mid, y + 4.5 * T, 1.6);
    else { this.blit(Sprites.pac(0, mouth), mid - T, y + 4.5 * T); this.blit(Sprites.msPac(Math.PI, mouth), mid + T, y + 4.5 * T); }
    const goal = this.rules.goal;
    const rows = [
      ['PAC-MAN', a.score, COLOR.pac],
      ['MS PAC-MAN', b.score, COLOR.pink],
      ['PAC CHOMPS', a.chomps, COLOR.pac],
      ['MS CHOMPS', b.chomps, COLOR.pink],
      goal ? ['LEVELS', this.levelsCleared + '/' + goal, COLOR.text] : ['LEVEL', this.level, COLOR.text],
      ['GHOSTS EATEN', this.stats.ghosts, COLOR.cyan],
      ['TIMES CAUGHT', this.catches, COLOR.red],
    ];
    rows.forEach(([label, v, col], i) => {
      const ry = y + (6.5 + i * 1.4) * T;
      this.text(label, x + 2.5 * T, ry, col);
      this.text(String(v), x + w - 2.5 * T, ry, COLOR.text, 16, 'right');
    });
    this.text('SERIES', mid, y + 17 * T, COLOR.grey, 8, 'center');
    this.text(`PAC ${this.duelSeries.pac}  -  ${this.duelSeries.ms} MS PAC`, mid, y + 18 * T, COLOR.text, 16, 'center');
    if (this.overTimer > 1.5 && flash) this.text('ENTER  REMATCH', mid, y + 20.5 * T, COLOR.pac, 16, 'center');
    this.text('ESC  MENU', mid, y + 22.3 * T, COLOR.grey, 8, 'center');
  }

  drawPause() {
    const c = this.ctx, mid = WIDTH / 2;
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.fillRect(0, 2 * T, WIDTH, HEIGHT - 4 * T);
    if (Math.floor(performance.now() / 400) % 2 === 0) this.text('PAUSED', mid, 14 * T, COLOR.pac, 16, 'center');
    if (TV_MODE) {
      this.text('A / MENU  RESUME', mid, 17 * T, COLOR.text, 8, 'center');
      this.text('B / BACK  QUIT TO MENU', mid, 18.5 * T, COLOR.text, 8, 'center');
    } else {
      this.text('P  RESUME', mid, 17 * T, COLOR.text, 8, 'center');
      this.text('Q  QUIT TO MENU', mid, 18.5 * T, COLOR.text, 8, 'center');
      this.text('F  FULLSCREEN', mid, 20 * T, COLOR.text, 8, 'center');
    }
    this.text('TIP: GHOSTS CAN\'T TURN UP RIGHT', mid, 23 * T, COLOR.grey, 8, 'center');
    this.text('ABOVE OR BELOW THE GHOST HOUSE', mid, 24 * T, COLOR.grey, 8, 'center');
  }

  drawTitle() {
    const c = this.ctx, t = this.time, mid = WIDTH / 2, s = this.settings;
    this.font = '';
    c.font = '32px "Press Start 2P", monospace';
    c.textAlign = 'center';
    c.fillStyle = '#DE5000';
    c.fillText('PAC-MAN', mid + 4, 3 * T + 4);
    c.fillStyle = COLOR.pac;
    c.fillText('PAC-MAN', mid, 3 * T);
    const cycle = [COLOR.red, COLOR.pink, COLOR.cyan, COLOR.orange][Math.floor(t * 2) % 4];
    const editions = { versus: '- VERSUS EDITION -', coop: '- CO-OP EDITION -', duel: '- DUEL EDITION -' };
    this.text(editions[s.mode], mid, 6 * T, cycle, 16, 'center');

    if (Math.floor(t / 9) % 2 === 0) this.drawTitleCharacters(t);
    else this.drawTitleBonus(t);

    // Five option rows are visible at a time; the list scrolls with the cursor.
    const opts = this.visibleOptions(), ROWS_SHOWN = 5;
    this.menuIndex = Math.min(this.menuIndex, opts.length - 1);
    const top = Math.max(0, Math.min(this.menuIndex - 2, opts.length - ROWS_SHOWN));
    for (let i = 0; i < Math.min(ROWS_SHOWN, opts.length); i++) {
      const o = opts[top + i], row = 22.2 + i * 1.25, sel = top + i === this.menuIndex, col = sel ? COLOR.pac : COLOR.text;
      if (sel && Math.floor(t * 4) % 2 === 0) this.text('>', 2 * T, row * T, COLOR.pac);
      this.text(o.label, 4 * T, row * T, col);
      this.text(o.fmt(s[o.key]), 25 * T, row * T, col, 16, 'right');
    }
    c.fillStyle = COLOR.grey;
    if (top > 0) this.drawArrow(26.3 * T, 22.4 * T, -1);
    if (top + ROWS_SHOWN < opts.length) this.drawArrow(26.3 * T, 27.6 * T, 1);
    // on the MODE row, explain the mode instead of the generic hint
    if (opts[this.menuIndex].key === 'mode') this.text(MODE_BLURBS[s.mode], mid, 28.5 * T, COLOR.pink, 8, 'center');
    else this.text('UP/DOWN SELECT   LEFT/RIGHT CHANGE', mid, 28.5 * T, COLOR.grey, 8, 'center');

    // who controls whom: keys on a computer, controllers on the TV (shown once joined)
    const p2Pac = s.mode !== 'versus', p2Col = p2Pac ? COLOR.pink : COLOR.red;
    const how = (slot, keys, padKeys) => TV_MODE
      ? (Pads.joined(slot) ? 'CONTROLLER' : (Math.floor(t * 2.5) % 2 ? 'PRESS A' : ''))
      : (Pads.joined(slot) ? padKeys : keys);
    this.text('PAC-MAN', 4 * T, 29.6 * T, COLOR.pac);
    this.text(how(0, 'W A S D', 'WASD/PAD'), 16 * T, 29.6 * T, COLOR.pac);
    this.text(p2Pac ? 'MS PAC-MAN' : 'GHOST', 4 * T, 30.9 * T, p2Col);
    this.text(how(1, 'ARROWS', 'ARROWS/PAD'), 16 * T, 30.9 * T, p2Col);
    const start = TV_MODE ? 'PRESS A TO START' : Pads.joined(0) || Pads.joined(1) ? 'PRESS ENTER / A' : 'PRESS ENTER TO START';
    if (Math.floor(t * 2.5) % 2 === 0) this.text(start, mid, 32.5 * T, COLOR.text, 16, 'center');
    this.text(TV_MODE ? 'A START  B BACK  MENU PAUSE  Y SWAP P1/P2' : 'P PAUSE  M MUTE  F FULLSCREEN  T THEME', mid, 34.5 * T, COLOR.grey, 8, 'center');
  }

  // Small pixel triangle marking more options above (dir -1) or below (dir 1).
  drawArrow(x, y, dir) {
    for (let i = 0; i < 4; i++) {
      const w = 8 - 2 * i;
      this.ctx.fillRect(x - w / 2, y + (dir > 0 ? i : 3 - i) * 2, w, 2);
    }
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
      const x = i < 4 ? 3 : 15, row = 10 + (i % 4) * 1.75, unlockAt = fruitUnlockLevel(k);
      if (unlockAt <= this.bestLevel) {
        this.blit(Sprites.fruit(k), (x + 0.5) * T, (row + 0.5) * T);
        this.text(`${FRUITS[k].pts} PTS`, (x + 2) * T, row * T, COLOR.text);
      } else {
        this.blit(Sprites.fruitLocked(k), (x + 0.5) * T, (row + 0.5) * T);
        this.text(`LEVEL ${unlockAt}`, (x + 2) * T, row * T, COLOR.grey);
      }
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
  // read-only handle for debugging and tests
  Object.defineProperty(window, 'game', { value: game, writable: false, configurable: false });

  const bezel = document.getElementById('bezel');
  const lights = document.getElementById('lights');
  const help = document.getElementById('help');
  const helpP2 = document.getElementById('help-p2');
  const BULB_COLORS = ['#FF0000', '#FFB8FF', '#00FFFF', '#FFB852', '#FFFF00'];
  Pads.attach(game);

  if (TV_MODE) {
    document.body.classList.add('tv');
    // controller hints instead of keyboard ones (text only, never markup)
    const spans = help.querySelectorAll('span');
    ['P1: CONTROLLER 1', 'P2: CONTROLLER 2', 'MENU: PAUSE', 'VIEW: MUTE', 'BACK: MENU'].forEach((txt, i) => {
      if (spans[i]) spans[i].textContent = txt;
    });
    // the TV remote's Back button (the app closes when this returns 'exit')
    Object.defineProperty(window, '__tvBack', { value: () => game.back(), writable: false, configurable: false });
  }

  // The control hint under the cabinet follows the chosen mode (text only, never markup).
  game.onModeChange = mode => {
    if (!helpP2 || TV_MODE) return;
    helpP2.textContent = mode === 'versus' ? 'GHOST: ARROWS' : 'MS PAC-MAN: ARROWS';
    helpP2.className = mode === 'versus' ? 'ghost' : 'ms';
  };
  game.onModeChange(game.settings.mode);

  function layoutBulbs() {
    const w = bezel.clientWidth, h = bezel.clientHeight, inset = 7, gap = TV_MODE ? 30 : 20; // fewer bulbs on TV hardware
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
    lights.replaceChildren(frag);
  }

  // Fill as much of the window as the arcade's 7:9 screen allows.
  let lastSize = '';
  function fit() {
    document.body.classList.toggle('fullscreen', !!document.fullscreenElement);
    const pad = 2 * 14 + 4; // bezel padding + frame
    const helpH = document.fullscreenElement ? 0 : help.offsetHeight + 10;
    const safeW = TV_MODE ? window.innerWidth * 0.06 : 0, safeH = TV_MODE ? window.innerHeight * 0.06 : 0; // TV overscan margin
    const availW = window.innerWidth - (document.fullscreenElement ? 0 : 32) - pad - safeW;
    const availH = window.innerHeight - helpH - pad - 12 - safeH;
    const s = Math.max(0.3, Math.min(availW / WIDTH, availH / HEIGHT));
    const size = Math.floor(WIDTH * s) + 'x' + Math.floor(HEIGHT * s);
    canvas.style.width = Math.floor(WIDTH * s) + 'px';
    canvas.style.height = Math.floor(HEIGHT * s) + 'px';
    // TV chips are slower: cap the render scale at 2x there (still sharp at couch distance)
    game.setScale(Math.min(TV_MODE ? 2 : 4, Math.max(1, Math.ceil(s * (window.devicePixelRatio || 1)))));
    if (size !== lastSize) { lastSize = size; layoutBulbs(); }
  }
  let resizeQueued = false;
  window.addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; fit(); });
  });
  document.addEventListener('fullscreenchange', fit);
  fit();

  // Theme song: one the player loaded before (this browser only), else sounds/theme.mp3.
  Theme.onChange = () => {
    if (game.state === 'title' && !Sound.themePlaying()) Sound.playTheme(true);
  };
  Theme.restore();
  // sounds/theme.mp3 only exists in local copies (it's git-ignored), so only look for it there
  const localCopy = location.protocol === 'file:' || ['localhost', '127.0.0.1', 'appassets.androidplatform.net'].includes(location.hostname);
  if (localCopy) Theme.bundled();

  window.addEventListener('keydown', e => {
    // leave browser and OS shortcuts alone
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    Sound.init();
    if (game.state === 'title' && Sound.hasTheme() && !Sound.themePlaying()) Sound.playTheme(true);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    game.onKey(e.code, e.repeat);
  });
  window.addEventListener('blur', () => game.pauseIfActive());
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pauseIfActive(); });

  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    Pads.poll();
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

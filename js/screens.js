/* Pac-Man Versus — the boot loading screen, the Pac-Man iris transition and
   the CONTROLS screen (controller test, button and key binding). */
'use strict';

/* ================================================================
   Iris: the screen closes to / opens from a chomping Pac-Man silhouette
   ================================================================ */

class Iris {
  // mode 'open' grows from nothing to the full screen, 'close' shrinks to nothing.
  constructor(mode, x, y, dur, delay = 0) {
    Object.assign(this, { mode, x, y, dur, t: -delay });
  }

  get done() { return this.t >= this.dur; }
  // 0 = fully closed, 1 = fully open
  get openness() {
    const p = Math.max(0, Math.min(1, this.t / this.dur));
    const e = p * p * (3 - 2 * p);
    return this.mode === 'open' ? e : 1 - e;
  }

  update(dt) { this.t += dt; }

  draw(c) {
    const o = this.openness;
    if (o >= 1) return;
    // big enough to uncover the farthest corner
    const far = Math.hypot(Math.max(this.x, WIDTH - this.x), Math.max(this.y, HEIGHT - this.y));
    const r = o * far * 1.05;
    const mouth = (0.08 + 0.22 * Math.abs(Math.sin(this.t * 14))) * Math.PI;
    c.fillStyle = '#000';
    c.beginPath();
    c.rect(0, 0, WIDTH, HEIGHT);
    if (r > 0.5) {
      c.moveTo(this.x, this.y);
      c.arc(this.x, this.y, r, mouth, Math.PI * 2 - mouth);
      c.closePath();
    }
    c.fill('evenodd');
  }
}

/* ================================================================
   Boot loader: real loading steps, drawn as Pac-Man eating his way across
   ================================================================ */

class Loader {
  constructor(game, steps) {
    this.game = game;
    this.steps = steps;    // [{ label, run: () => promise | void }]
    this.index = 0;
    this.busy = false;
    this.done = 0;         // steps finished
    this.shown = 0;        // progress drawn (eases toward the real one)
    this.t = 0;
    this.stepTime = 0;
    this.finishedAt = -1;  // time the bar reached the pellet
    this.tip = Loader.TIPS[Math.floor(Math.random() * Loader.TIPS.length)];
    this.closing = null;
  }

  // Each step gets at least a short beat on screen so the animation reads, but
  // nothing waits on a timer once the real work is done.
  update(dt) {
    this.t += dt;
    this.stepTime += dt;
    if (!this.busy && this.index < this.steps.length && this.stepTime >= Loader.STEP_MIN) {
      const step = this.steps[this.index];
      this.busy = true;
      let result;
      try { result = step.run(); } catch (e) { console.error(e); }
      Promise.resolve(result).catch(e => console.error(e)).finally(() => {
        this.busy = false;
        this.done++;
        this.index++;
        this.stepTime = 0;
      });
    }
    const target = this.done / this.steps.length;
    this.shown = Math.min(target, this.shown + dt * 1.6);
    if (this.shown >= 1 && this.finishedAt < 0) {
      this.finishedAt = this.t;
      Sound.init();
    }
    // after the pellet: the ghosts turn blue for a beat, then the iris closes on Pac-Man
    if (this.finishedAt >= 0 && !this.closing && this.t - this.finishedAt > 0.9) {
      this.closing = new Iris('close', this.pacX(), Loader.LANE, 0.55);
    }
    if (this.closing) this.closing.update(dt);
    return !!(this.closing && this.closing.done);
  }

  get ready() { return this.finishedAt >= 0; }

  pacX() { return (2 + this.shown * 22.5) * T; }

  draw() {
    const g = this.game, c = g.ctx, t = this.t, mid = WIDTH / 2;
    c.fillStyle = '#000';
    c.fillRect(0, 0, WIDTH, HEIGHT);

    // the maze, faint, behind everything
    c.globalAlpha = 0.16 + 0.05 * Math.sin(t * 2);
    c.drawImage(g.wallsBlue, 0, TOP * T, WIDTH, MAZE_ROWS * T);
    c.globalAlpha = 1;

    // marquee: dots running around the edge, like the cabinet bulbs
    const n = 46, per = 2 * (WIDTH + HEIGHT) - 32;
    for (let i = 0; i < n; i++) {
      const lit = (i + Math.floor(t * 12)) % 3 === 0;
      if (!lit) continue;
      let d = (i / n) * per, x, y;
      const w = WIDTH - 16, h = HEIGHT - 16;
      if (d < w) { x = 8 + d; y = 8; } else if ((d -= w) < h) { x = WIDTH - 8; y = 8 + d; }
      else if ((d -= h) < w) { x = WIDTH - 8 - d; y = HEIGHT - 8; } else { d -= w; x = 8; y = HEIGHT - 8 - d; }
      c.fillStyle = Loader.BULBS[i % Loader.BULBS.length];
      c.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    }

    // logo with a colour-cycling drop shadow and a little bounce per letter
    const fontOk = g.fontReady;
    if (fontOk) {
      g.font = '';
      c.font = '32px "Press Start 2P", monospace';
      c.textAlign = 'center';
      const word = 'PAC-MAN', w = c.measureText(word).width, x0 = mid - w / 2;
      c.textAlign = 'left';
      let x = x0;
      for (let i = 0; i < word.length; i++) {
        const ch = word[i], cw = c.measureText(ch).width;
        const hop = Math.round(Math.max(0, Math.sin(t * 5 - i * 0.6)) * -6);
        c.fillStyle = Loader.SHADOWS[(Math.floor(t * 4) + i) % Loader.SHADOWS.length];
        c.fillText(ch, x + 4, 6 * T + 4 + hop);
        c.fillStyle = COLOR.pac;
        c.fillText(ch, x, 6 * T + hop);
        x += cw;
      }
      g.text('- VERSUS EDITION -', mid, 9 * T, COLOR.pink, 16, 'center');
    }

    // the four ghosts parade over the logo
    GHOST_ORDER.slice(0, 4).forEach((k, i) => {
      const gx = mid + (i - 1.5) * 3 * T, gy = 12.5 * T + Math.sin(t * 6 + i) * 3;
      const frightened = this.ready && t - this.finishedAt < 0.9;
      const img = frightened
        ? Sprites.frightGhost(Math.floor(t * 8) % 2, Math.floor(t * 8) % 2 === 0)
        : Sprites.ghost(GHOSTS[k].color, Math.floor(t * 8) % 2, Math.sin(t * 1.5 + i) > 0 ? RIGHT : LEFT);
      g.blit(img, gx, gy);
    });

    // progress: a lane of dots Pac-Man eats; the power pellet at the end is 100%
    const lane = Loader.LANE, px = this.pacX();
    c.fillStyle = COLOR.wall;
    c.fillRect(T, lane - 1.5 * T, WIDTH - 2 * T, 2);
    c.fillRect(T, lane + 1.5 * T - 2, WIDTH - 2 * T, 2);
    for (let i = 0; i < 22; i++) {
      const dx = (3 + i) * T;
      if (dx > px) g.blit(Sprites.dot(), dx, lane);
    }
    const pelletX = 25 * T;
    if (!this.ready && Math.floor(t * 4) % 2 === 0) g.blit(Sprites.pellet(), pelletX, lane);
    // ghosts chase Pac-Man into the lane, then run when he eats the pellet
    for (let i = 0; i < 2; i++) {
      const fleeing = this.ready;
      const gx = fleeing ? px - (2.2 + i * 1.8) * T - (t - this.finishedAt) * 90 : px - (2.4 + i * 1.8) * T;
      if (gx < -T) continue;
      const img = fleeing
        ? Sprites.frightGhost(Math.floor(t * 8) % 2, false)
        : Sprites.ghost(GHOSTS[GHOST_ORDER[i]].color, Math.floor(t * 8) % 2, RIGHT);
      g.blit(img, gx, lane);
    }
    const mouth = MOUTHS[Math.floor(t * 15) % 4];
    g.blitScaled(Sprites.pac(0, mouth), px, lane, 1.25);

    if (fontOk) {
      const pct = Math.round(this.shown * 100);
      const label = this.ready ? 'READY!' : (this.steps[Math.min(this.index, this.steps.length - 1)].label + '.'.repeat(1 + Math.floor(t * 3) % 3));
      g.text(label, mid, lane + 2.4 * T, this.ready ? COLOR.pac : COLOR.text, this.ready ? 16 : 8, 'center');
      g.text(String(pct).padStart(3, ' ') + '%', 26 * T, lane - 2.6 * T, COLOR.grey, 8, 'right');
      g.text(this.tip[0], mid, 27 * T, COLOR.cyan, 8, 'center');
      g.text(this.tip[1], mid, 28.2 * T, COLOR.cyan, 8, 'center');
      if (Math.floor(t * 2) % 2 === 0) g.text(TV_MODE ? 'GRAB A CONTROLLER!' : 'GRAB A FRIEND!', mid, 31.5 * T, COLOR.pink, 8, 'center');
    }
    if (this.closing) this.closing.draw(c);
  }
}
Loader.STEP_MIN = 0.22;
Loader.LANE = 20.5 * T;
Loader.BULBS = ['#FF0000', '#FFB8FF', '#00FFFF', '#FFB852', '#FFFF00'];
Loader.SHADOWS = ['#DE5000', '#FF0000', '#FFB8FF', '#00B8FF'];
Loader.TIPS = Object.freeze([
  ['TIP: GHOSTS CAN\'T TURN UP RIGHT', 'ABOVE OR BELOW THE GHOST HOUSE'],
  ['TIP: CUT CORNERS! PAC-MAN TURNS', 'A LITTLE EARLY, GHOSTS DON\'T'],
  ['TIP: THE TUNNEL SLOWS GHOSTS', 'DOWN - BUT NOT PAC-MAN'],
  ['TIP: A NEW FRUIT UNLOCKS', 'EVERY TIME YOU CLEAR A LEVEL'],
  ['TIP: BLINKY SPEEDS UP WHEN', 'THE DOTS RUN LOW'],
  ['TIP: CHECK YOUR CONTROLLERS', 'ON THE CONTROLS SCREEN'],
]);

/* ================================================================
   CONTROLS: controller test, controller buttons, keyboard keys
   ================================================================ */

class ControlsScreen {
  constructor(game) {
    this.game = game;
    this.page = 'main';
    this.cursor = 0;
    this.col = 0;          // keys page: P1 / P2 column
    this.slot = 0;         // pad page: which player's controller
    this.capture = null;   // { type: 'pad' | 'key', ... , t }
    this.backHeld = [0, 0]; // test page: seconds the back button has been held, per player
    this.walkers = [0, 1].map(() => ({ x: 6, y: 1.5, dir: RIGHT, moving: false }));
    this.t = 0;
  }

  open() {
    this.page = 'main';
    this.cursor = 0;
    this.capture = null;
  }

  rows() {
    switch (this.page) {
      case 'main': return ['test', 'pad0', 'pad1', 'keys', 'exit'];
      case 'pad': return [...ControlsScreen.PAD_ACTIONS, 'move', 'reset'];
      case 'keys': return [...Controls.DIRS, 'reset'];
      default: return [];
    }
  }

  go(page, slot) {
    this.page = page;
    if (slot !== undefined) this.slot = slot;
    this.cursor = 0;
    this.col = 0;
    this.capture = null;
    this.backHeld = [0, 0];
    Sound.menu();
  }

  /* ---------- input ---------- */

  // A direction from a player (controller or bound key).
  dir(slot, dir) {
    if (this.page === 'test' || this.capture) return;
    const rows = this.rows();
    if (dir === 'up' || dir === 'down') {
      this.cursor = (this.cursor + (dir === 'down' ? 1 : -1) + rows.length) % rows.length;
      Sound.menu();
    } else if (this.page === 'keys' && rows[this.cursor] !== 'reset') {
      this.col = this.col ? 0 : 1;
      Sound.menu();
    } else if (this.page === 'pad' && rows[this.cursor] === 'move') {
      const modes = Controls.STICK_MODES, i = modes.indexOf(Controls.move(this.slot));
      Controls.setMove(this.slot, modes[(i + (dir === 'right' ? 1 : -1) + modes.length) % modes.length]);
      Sound.menu();
    }
  }

  // Raw controller buttons while this screen is up. Always consumed.
  raw(slot, name, down) {
    const action = Controls.padAction(slot, name);
    if (this.page === 'test') {
      if (action === 'back') this.backHeld[slot] = down ? 0.0001 : 0;
      return true;
    }
    if (!down) return true;
    if (this.capture) {
      if (this.capture.type === 'pad' && slot === this.capture.slot) {
        Controls.bindButton(slot, this.capture.action, name);
        this.game.toast(`${Controls.BUTTON_NAMES[name]} = ${Controls.ACTION_NAMES[this.capture.action]}`);
        this.capture = null;
        Sound.eatGhost();
      } else if (action === 'back') {
        this.capture = null;
      }
      return true;
    }
    if (action === 'confirm') this.confirm();
    else if (action === 'back') this.back();
    else if (action === 'mute') Sound.toggleMute();
    return true;
  }

  // Keyboard and the TV remote.
  key(code, repeat) {
    if (this.capture) {
      if (repeat) return;
      if (code === 'Escape' || code === 'Backspace') { this.capture = null; return; }
      if (this.capture.type !== 'key') return;
      const r = Controls.setKey(this.capture.slot, this.capture.dir, code);
      if (r === 'ok') {
        this.game.toast(`P${this.capture.slot + 1} ${this.capture.dir.toUpperCase()} = ${Controls.keyName(code)}`);
        this.capture = null;
        Sound.eatGhost();
      } else {
        this.game.toast(r === 'reserved' ? 'THAT KEY IS USED BY THE GAME' : 'TRY ANOTHER KEY');
      }
      return;
    }
    if (code === 'KeyM') { if (!repeat) Sound.toggleMute(); return; }
    if (code === 'Escape' || code === 'Backspace') { if (!repeat) this.back(); return; }
    if (this.page === 'test') return;
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { if (!repeat) this.confirm(); return; }
    const dir = MENU_KEYS[code];
    if (dir) this.dir(0, dir);
  }

  confirm() {
    const row = this.rows()[this.cursor];
    if (this.page === 'main') {
      if (row === 'test') this.go('test');
      else if (row === 'pad0') this.go('pad', 0);
      else if (row === 'pad1') this.go('pad', 1);
      else if (row === 'keys') this.go('keys');
      else this.game.closeControls();
    } else if (this.page === 'pad') {
      if (row === 'reset') { Controls.reset(this.slot); this.game.toast(`P${this.slot + 1} BUTTONS RESET`); Sound.menu(); }
      else if (row === 'move') this.dir(this.slot, 'right');
      else this.capture = { type: 'pad', slot: this.slot, action: row, t: 0 };
    } else if (this.page === 'keys') {
      if (row === 'reset') { Controls.reset('keys'); this.game.toast('KEYS RESET'); Sound.menu(); }
      else this.capture = { type: 'key', slot: this.col, dir: row, t: 0 };
    }
  }

  back() {
    if (this.capture) { this.capture = null; return; }
    if (this.page === 'main') this.game.closeControls();
    else {
      const from = this.page === 'pad' ? 'pad' + this.slot : this.page;
      this.go('main');
      this.cursor = Math.max(0, this.rows().indexOf(from));
    }
  }

  update(dt) {
    this.t += dt;
    if (this.capture) {
      this.capture.t += dt;
      if (this.capture.t > 8) { this.capture = null; this.game.toast('NOTHING PRESSED'); }
    }
    if (this.page !== 'test') return;
    for (let s = 0; s < 2; s++) {
      if (this.backHeld[s] > 0) {
        this.backHeld[s] += dt;
        if (this.backHeld[s] >= ControlsScreen.HOLD) { this.back(); return; }
      }
      // each player's character runs around a little box, steered live
      const w = this.walkers[s], st = Pads.state(s);
      const want = st && st.dir ? DIR_BY_NAME[st.dir] : null;
      w.moving = !!want;
      if (want) {
        w.dir = want;
        w.x = Math.max(1, Math.min(11, w.x + w.dir.x * dt * 6));
        w.y = Math.max(1, Math.min(2, w.y + w.dir.y * dt * 6));
      }
    }
  }

  /* ---------- drawing ---------- */

  draw() {
    const g = this.game, mid = WIDTH / 2;
    const title = { main: 'CONTROLS', test: 'CONTROLLER TEST', pad: `P${this.slot + 1} CONTROLLER`, keys: 'KEYBOARD' }[this.page];
    g.text(title, mid, 1.2 * T, COLOR.pac, 16, 'center');
    // a strip of dots under the heading, eaten by a tiny Pac-Man
    const eat = (this.t * 4) % 26;
    for (let i = 0; i < 26; i++) if (i + 1 > eat) g.blit(Sprites.dot(), (1.5 + i) * T, 3 * T);
    g.blit(Sprites.pac(0, MOUTHS[Math.floor(this.t * 15) % 4]), (1.5 + eat) * T, 3 * T);

    if (this.page === 'main') this.drawMain();
    else if (this.page === 'pad') this.drawPad();
    else if (this.page === 'keys') this.drawKeys();
    else this.drawTest();
    if (g.toastLife > 0) g.text(g.toastText, mid, 33 * T, COLOR.pink, 8, 'center');
  }

  hint(text) {
    this.game.text(text, WIDTH / 2, 34.6 * T, COLOR.grey, 8, 'center');
  }

  btn(slot, action) {
    const b = Controls.buttonsFor(slot, action);
    return b.length ? b.map(x => Controls.BUTTON_NAMES[x]).join(' ') : '-';
  }

  cursorAt(y) {
    if (Math.floor(this.t * 4) % 2 === 0) this.game.text('>', 2 * T, y, COLOR.pac);
  }

  drawMain() {
    const g = this.game;
    const labels = {
      test: ['CONTROLLER TEST', 'SEE EVERY BUTTON AND STICK LIVE'],
      pad0: ['P1 CONTROLLER BUTTONS', 'PAC-MAN\'S CONTROLLER'],
      pad1: ['P2 CONTROLLER BUTTONS', g.settings.mode === 'versus' ? 'THE GHOST\'S CONTROLLER' : 'MS PAC-MAN\'S CONTROLLER'],
      keys: ['KEYBOARD KEYS', 'WHICH KEYS STEER P1 AND P2'],
      exit: ['BACK TO THE GAME', ''],
    };
    this.rows().forEach((r, i) => {
      const y = (6 + i * 3) * T, sel = i === this.cursor;
      if (sel) this.cursorAt(y);
      g.text(labels[r][0], 4 * T, y, sel ? COLOR.pac : COLOR.text);
      if (labels[r][1]) g.text(labels[r][1], 4 * T, y + 1.3 * T, COLOR.grey, 8);
    });
    // who's connected
    for (let s = 0; s < 2; s++) {
      const st = Pads.state(s), y = (22.5 + s * 1.5) * T;
      g.text(`P${s + 1}`, 4 * T, y, s ? COLOR.pink : COLOR.pac);
      g.text(st ? st.label + ' CONNECTED' : (TV_MODE ? 'PRESS A ON A CONTROLLER' : 'KEYBOARD (OR PRESS A)'), 7 * T, y, st ? COLOR.text : COLOR.grey, 8);
    }
    const extra = Pads.extras();
    if (extra) g.text(`${extra} MORE CONTROLLER${extra > 1 ? 'S' : ''} WAITING (2 PLAYERS MAX)`, WIDTH / 2, 26 * T, COLOR.grey, 8, 'center');
    this.hint(`${this.btn(0, 'confirm')} / ENTER SELECT   ${this.btn(0, 'back')} / ESC BACK`);
  }

  drawPad() {
    const g = this.game, s = this.slot, rows = this.rows(), st = Pads.state(s);
    g.text(st ? `${st.label} CONNECTED` : 'NO CONTROLLER YET - PRESS A TO JOIN', WIDTH / 2, 5 * T, st ? COLOR.cyan : COLOR.grey, 8, 'center');
    g.text('ACTION', 4 * T, 7 * T, COLOR.grey, 8);
    g.text('BUTTON', 25 * T, 7 * T, COLOR.grey, 8, 'right');
    rows.forEach((r, i) => {
      const y = (8.6 + i * 1.7) * T, sel = i === this.cursor, col = sel ? COLOR.pac : COLOR.text;
      if (sel) this.cursorAt(y);
      if (r === 'move') {
        g.text('MOVE WITH', 4 * T, y, col);
        g.text(Controls.STICK_NAMES[Controls.move(s)], 25 * T, y, col, 8, 'right');
      } else if (r === 'reset') {
        g.text('RESET TO DEFAULT', 4 * T, y, col);
      } else {
        g.text(Controls.ACTION_NAMES[r], 4 * T, y, col);
        const waiting = this.capture && this.capture.action === r;
        if (!waiting) g.text(this.btn(s, r), 25 * T, y, col, 16, 'right');
        else if (Math.floor(this.t * 4) % 2 === 0) g.text('PRESS...', 25 * T, y, COLOR.pink, 16, 'right');
      }
    });
    if (this.capture) {
      g.text(`PRESS A BUTTON ON THE P${s + 1} CONTROLLER`, WIDTH / 2, 28 * T, COLOR.pink, 8, 'center');
      g.text('(BACK ON ANOTHER CONTROLLER OR ESC CANCELS)', WIDTH / 2, 29.2 * T, COLOR.grey, 8, 'center');
    } else {
      g.text('PICK AN ACTION, THEN PRESS THE BUTTON', WIDTH / 2, 28 * T, COLOR.grey, 8, 'center');
      g.text('YOU WANT FOR IT. BUTTONS SWAP PLACES.', WIDTH / 2, 29.2 * T, COLOR.grey, 8, 'center');
    }
    this.hint(`${this.btn(s, 'confirm')} REBIND   ${this.btn(s, 'back')} BACK   LEFT/RIGHT CHANGE`);
  }

  drawKeys() {
    const g = this.game, rows = this.rows();
    const p2 = g.settings.mode === 'versus' ? 'GHOST' : 'MS PAC';
    g.text('P1 PAC-MAN', 15 * T, 6.5 * T, COLOR.pac, 8, 'center');
    g.text('P2 ' + p2, 23 * T, 6.5 * T, COLOR.pink, 8, 'center');
    rows.forEach((r, i) => {
      const y = (8.5 + i * 2) * T, sel = i === this.cursor;
      if (r === 'reset') {
        if (sel) this.cursorAt(y + T);
        g.text('RESET TO DEFAULT', 4 * T, y + T, sel ? COLOR.pac : COLOR.text);
        return;
      }
      g.text(r.toUpperCase(), 4 * T, y, COLOR.text);
      for (let s = 0; s < 2; s++) {
        const x = (15 + s * 8) * T, on = sel && this.col === s;
        if (on) {
          this.game.ctx.fillStyle = Math.floor(this.t * 4) % 2 ? '#2121DE' : '#1a1a8a';
          this.game.ctx.fillRect(x - 3.5 * T, y - 4, 7 * T, T + 8);
        }
        const waiting = this.capture && this.capture.slot === s && this.capture.dir === r;
        const label = waiting ? (Math.floor(this.t * 4) % 2 ? '?' : '') : Controls.keyName(Controls.keyFor(s, r));
        g.text(label, x, y, on ? COLOR.pac : COLOR.text, 16, 'center');
      }
    });
    if (this.capture) g.text('PRESS A KEY  (ESC CANCELS)', WIDTH / 2, 22 * T, COLOR.pink, 8, 'center');
    g.text('ENTER, ESC, P, M, F, T, Q AND C', WIDTH / 2, 25 * T, COLOR.grey, 8, 'center');
    g.text('ARE KEPT FOR THE GAME ITSELF.', WIDTH / 2, 26.2 * T, COLOR.grey, 8, 'center');
    g.text('A KEY IN USE SWAPS PLACES.', WIDTH / 2, 27.4 * T, COLOR.grey, 8, 'center');
    this.hint('ENTER REBIND   ESC BACK   ARROWS MOVE');
  }

  drawTest() {
    const g = this.game;
    for (let s = 0; s < 2; s++) this.drawTestPanel(s, s * 14 * T, 4.5 * T);
    const extra = Pads.extras();
    if (extra) g.text(`+${extra} MORE (ONLY 2 PLAYERS CAN JOIN)`, WIDTH / 2, 31.5 * T, COLOR.grey, 8, 'center');
    this.hint(`HOLD ${this.btn(0, 'back')} (P1) OR ${this.btn(1, 'back')} (P2) TO EXIT  -  ESC / BACK`);
  }

  drawTestPanel(s, ox, oy) {
    const g = this.game, c = g.ctx, st = Pads.state(s), t = this.t;
    const accent = s ? (g.settings.mode === 'versus' ? COLOR.red : COLOR.pink) : COLOR.pac;
    g.text(`P${s + 1}`, ox + 7 * T, oy, accent, 16, 'center');
    g.text(st ? st.label : (Math.floor(t * 2) % 2 ? 'PRESS A BUTTON' : ''), ox + 7 * T, oy + 1.4 * T, st ? COLOR.text : COLOR.grey, 8, 'center');
    const held = st ? st.held : new Set(), ax = st ? st.axes : [0, 0, 0, 0, 0, 0];
    const dpad = st ? st.dpad : null;
    const body = ox + 16, top = oy + 2.6 * T;

    // body: chunky pixel outline, two grips
    c.fillStyle = st ? '#1b1b44' : '#111126';
    this.chamfer(body, top + 24, 192, 92, 8);
    this.chamfer(body + 4, top + 96, 60, 40, 8);
    this.chamfer(body + 128, top + 96, 60, 40, 8);
    c.fillStyle = st ? '#2121DE' : '#22224a';
    c.fillRect(body + 8, top + 24, 176, 2);

    // triggers (analog fill) and bumpers
    const bar = (x, y, w, h, on, fill) => {
      c.fillStyle = '#33335a';
      c.fillRect(x, y, w, h);
      if (fill > 0) { c.fillStyle = on ? accent : '#8888AA'; c.fillRect(x, y, Math.round(w * Math.min(1, fill)), h); }
    };
    bar(body + 8, top, 52, 8, held.has('lt'), held.has('lt') ? Math.max(ax[4], 1) : ax[4]);
    bar(body + 132, top, 52, 8, held.has('rt'), held.has('rt') ? Math.max(ax[5], 1) : ax[5]);
    bar(body + 8, top + 12, 52, 8, held.has('lb'), held.has('lb') ? 1 : 0);
    bar(body + 132, top + 12, 52, 8, held.has('rb'), held.has('rb') ? 1 : 0);
    g.text('LT', body + 34, top + 1, held.has('lt') || ax[4] > 0.5 ? '#000' : COLOR.text, 8, 'center');
    g.text('RT', body + 158, top + 1, held.has('rt') || ax[5] > 0.5 ? '#000' : COLOR.text, 8, 'center');

    // sticks: ring + knob at the live position
    const stick = (cx, cy, x, y, pressed) => {
      c.fillStyle = pressed ? accent : '#44447a';
      c.beginPath(); c.arc(cx, cy, 17, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0b0b22';
      c.beginPath(); c.arc(cx, cy, 14, 0, Math.PI * 2); c.fill();
      c.fillStyle = pressed ? accent : '#DEDEDE';
      c.beginPath(); c.arc(cx + x * 10, cy + y * 10, 7, 0, Math.PI * 2); c.fill();
    };
    stick(body + 40, top + 52, ax[0], ax[1], held.has('ls'));
    stick(body + 124, top + 94, ax[2], ax[3], held.has('rs'));

    // d-pad
    const dx = body + 68, dy = top + 94;
    const arm = (x, y, on) => { c.fillStyle = on ? accent : '#5a5a8a'; c.fillRect(dx + x - 5, dy + y - 5, 10, 10); };
    c.fillStyle = '#5a5a8a';
    c.fillRect(dx - 5, dy - 5, 10, 10);
    arm(0, -10, dpad === 'up'); arm(0, 10, dpad === 'down'); arm(-10, 0, dpad === 'left'); arm(10, 0, dpad === 'right');

    // face buttons in their Xbox colours
    const face = (name, x, y, col) => {
      const on = held.has(name);
      c.fillStyle = col;
      c.beginPath(); c.arc(body + 154 + x, top + 52 + y, 8, 0, Math.PI * 2); c.fill();
      if (!on) { c.fillStyle = '#0b0b22'; c.beginPath(); c.arc(body + 154 + x, top + 52 + y, 6, 0, Math.PI * 2); c.fill(); }
      g.text(name.toUpperCase(), body + 154 + x + 1, top + 52 + y - 3, on ? '#000' : col, 8, 'center');
    };
    face('a', 0, 16, '#3ADB3A'); face('b', 16, 0, '#FF3030'); face('x', -16, 0, '#3A7BFF'); face('y', 0, -16, '#FFD800');

    // view / menu
    const pill = (name, x) => { c.fillStyle = held.has(name) ? accent : '#5a5a8a'; c.fillRect(x, top + 44, 14, 7); };
    pill('view', body + 74); pill('menu', body + 104);

    // read-out
    const y0 = top + 148;
    const dir = st && st.dir ? st.dir.toUpperCase() : '-';
    g.text('MOVE ' + dir, ox + 2 * T, y0, COLOR.text, 8);
    const names = st ? [...held].map(b => Controls.BUTTON_NAMES[b]).join(' ') : '';
    g.text('HELD ' + (names || '-'), ox + 2 * T, y0 + 14, COLOR.text, 8);
    if (st && st.last) {
      g.text(`${Controls.BUTTON_NAMES[st.last]}: ${Controls.ACTION_NAMES[Controls.padAction(s, st.last)]}`, ox + 2 * T, y0 + 28, COLOR.cyan, 8);
    }
    g.text(`L ${this.num(ax[0])} ${this.num(ax[1])}`, ox + 2 * T, y0 + 42, COLOR.grey, 8);
    g.text(`R ${this.num(ax[2])} ${this.num(ax[3])}`, ox + 2 * T, y0 + 54, COLOR.grey, 8);

    // a little lane where this player's character runs around, steered live
    const lx = ox + T, ly = y0 + 70, w = this.walkers[s];
    c.fillStyle = COLOR.wall;
    c.fillRect(lx, ly, 12 * T, 2); c.fillRect(lx, ly + 3 * T - 2, 12 * T, 2);
    c.fillRect(lx, ly, 2, 3 * T); c.fillRect(lx + 12 * T - 2, ly, 2, 3 * T);
    const mouth = w.moving ? MOUTHS[Math.floor(t * 15) % 4] : MOUTHS[1];
    const angle = Math.atan2(w.dir.y, w.dir.x);
    let img;
    if (s === 0) img = Sprites.pac(angle, mouth);
    else if (g.settings.mode === 'versus') img = Sprites.ghost(GHOSTS.blinky.color, Math.floor(t * 8) % 2, w.dir);
    else img = Sprites.msPac(angle, mouth);
    g.blit(img, lx + w.x * T, ly + w.y * T);

    // hold-to-exit progress
    if (this.backHeld[s] > 0) {
      c.fillStyle = accent;
      c.fillRect(ox + T, oy + 26 * T, Math.round(12 * T * Math.min(1, this.backHeld[s] / ControlsScreen.HOLD)), 4);
    }
  }

  num(v) {
    const n = Math.round(v * 100);
    return (n < 0 ? '-' : '+') + String(Math.abs(n)).padStart(3, '0');
  }

  // Pixel-style rounded box: a rectangle with stepped corners.
  chamfer(x, y, w, h, r) {
    const c = this.game.ctx;
    c.fillRect(x + r, y, w - 2 * r, h);
    c.fillRect(x, y + r, w, h - 2 * r);
    c.fillRect(x + r / 2, y + r / 2, w - r, h - r);
  }
}
ControlsScreen.HOLD = 1;
ControlsScreen.PAD_ACTIONS = Object.freeze(['confirm', 'back', 'pause', 'mute', 'swap', 'controls']);

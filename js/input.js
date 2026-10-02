/* Pac-Man Versus — game controllers (Xbox / Bluetooth gamepads).

   One controller drives exactly one player, never both:
     - the first controller to press anything becomes P1, the second P2,
       any further controllers are ignored
     - P1's controller only ever produces P1 input (the same as W A S D),
       P2's only P2 input (the same as the arrow keys)
     - Y on the title screen swaps the two, a disconnect frees the slot

   Two sources feed the same slots:
     - browsers: the standard Gamepad API, polled once per frame
     - the Android TV app: the native wrapper forwards controller events
       through window.__tvPad, already split per physical device */
'use strict';

const Pads = (() => {
  const P1_DIR = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
  const P2_DIR = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const DIRS = ['up', 'down', 'left', 'right'];
  const BUTTONS = ['a', 'b', 'x', 'y', 'menu', 'view'];

  const owners = [null, null];  // controller key held by P1 / P2
  const lastDir = new Map();    // controller key -> current direction
  const lastButtons = new Map(); // browser pads: controller key -> pressed flags
  let game = null;
  // In the TV app the native wrapper feeds controllers per device, so the Gamepad API is
  // never read there (a controller can't be counted twice).
  let nativeOnly = new URLSearchParams(location.search).get('tv') === '1';

  function slotFor(key) {
    let slot = owners.indexOf(key);
    if (slot < 0) {
      slot = owners.indexOf(null);
      if (slot < 0) return -1; // both players taken: extra controllers are ignored
      owners[slot] = key;
      if (game) game.toast(`CONTROLLER JOINED AS P${slot + 1}`);
    }
    return slot;
  }

  function release(key) {
    const slot = owners.indexOf(key);
    if (slot >= 0) {
      owners[slot] = null;
      if (game) game.toast(`P${slot + 1} CONTROLLER DISCONNECTED`);
    }
    lastDir.delete(key);
    lastButtons.delete(key);
  }

  function direction(key, dir) {
    if (dir === lastDir.get(key)) return;
    lastDir.set(key, dir);
    if (!dir || !game) return;
    const slot = slotFor(key);
    if (slot < 0) return;
    Sound.init();
    game.onKey((slot === 0 ? P1_DIR : P2_DIR)[dir], false);
  }

  function button(key, name) {
    if (!game) return;
    const slot = slotFor(key);
    if (slot < 0) return;
    Sound.init();
    if (name === 'y' && game.state === 'title') { swap(); return; }
    game.onPadButton(name);
  }

  function swap() {
    [owners[0], owners[1]] = [owners[1], owners[0]];
    if (game) game.toast('CONTROLLERS SWAPPED');
  }

  /* ---------- browsers: Gamepad API ---------- */

  // Standard mapping: 0 A, 1 B, 2 X, 3 Y, 8 View, 9 Menu, 12-15 D-pad.
  const BUTTON_INDEX = { a: 0, b: 1, x: 2, y: 3, view: 8, menu: 9 };

  function stickDir(pad, key) {
    const b = i => pad.buttons[i] && pad.buttons[i].pressed;
    if (b(12)) return 'up';
    if (b(13)) return 'down';
    if (b(14)) return 'left';
    if (b(15)) return 'right';
    const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
    const held = lastDir.get(key);
    const on = held ? 0.35 : 0.5; // a little hysteresis so the stick doesn't flicker
    if (Math.max(Math.abs(x), Math.abs(y)) < on) return null;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
  }

  function poll() {
    if (nativeOnly || !navigator.getGamepads) return;
    let pads;
    try { pads = navigator.getGamepads(); } catch { return; }
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const key = 'web:' + pad.index;
      const prev = lastButtons.get(key) || {};
      const now = {};
      for (const name of BUTTONS) {
        const btn = pad.buttons[BUTTON_INDEX[name]];
        now[name] = !!(btn && btn.pressed);
        if (now[name] && !prev[name]) button(key, name);
      }
      lastButtons.set(key, now);
      direction(key, stickDir(pad, key));
    }
  }

  window.addEventListener('gamepaddisconnected', e => release('web:' + e.gamepad.index));

  /* ---------- Android TV app ---------- */

  // Called by the native wrapper with a device id and a whitelisted event.
  // Anything else is ignored.
  Object.defineProperty(window, '__tvPad', {
    value(deviceId, kind, value) {
      if (!Number.isSafeInteger(deviceId)) return;
      nativeOnly = true;
      const key = 'tv:' + deviceId;
      if (kind === 'dir' && (value === 'none' || DIRS.includes(value))) direction(key, value === 'none' ? null : value);
      else if (kind === 'btn' && BUTTONS.includes(value)) button(key, value);
      else if (kind === 'gone') release(key);
    },
    writable: false,
    configurable: false,
  });

  return {
    attach(g) { game = g; },
    poll,
    swap,
    joined: slot => owners[slot] !== null,
  };
})();

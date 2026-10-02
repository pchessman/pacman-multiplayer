/* Pac-Man Versus — game controllers (Xbox / Bluetooth gamepads).

   One controller drives exactly one player, never both:
     - the first controller to press anything becomes P1, the second P2,
       any further controllers are ignored
     - P1's controller only ever steers P1, P2's only P2
     - SWAP (Y by default) on the title screen swaps the two, a disconnect frees the slot
   What each button does is set per player on the CONTROLS screen (controls.js).

   Two sources feed the same per-controller state:
     - browsers: the standard Gamepad API, polled once per frame
     - the Android TV app: the native wrapper forwards controller events
       through window.__tvPad, already split per physical device */
'use strict';

const Pads = (() => {
  const DIRS = ['up', 'down', 'left', 'right'];
  const BUTTONS = Controls.PAD_BUTTONS;
  // Standard Gamepad API mapping.
  const BUTTON_INDEX = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9, ls: 10, rs: 11 };
  const VENDORS = new Map([[0x045E, 'XBOX'], [0x054C, 'PLAYSTATION'], [0x057E, 'NINTENDO'], [0x18D1, 'GOOGLE'],
    [0x2DC8, '8BITDO'], [0x046D, 'LOGITECH'], [0x0F0D, 'HORI'], [0x0E6F, 'PDP'], [0x24C6, 'POWERA'], [0x1532, 'RAZER']]);

  const owners = [null, null];  // controller key held by P1 / P2
  const devices = new Map();    // controller key -> live state (also drives the test screen)
  let game = null;
  // In the TV app the native wrapper feeds controllers per device, so the Gamepad API is
  // never read there (a controller can't be counted twice).
  let nativeOnly = new URLSearchParams(location.search).get('tv') === '1';

  function device(key) {
    let d = devices.get(key);
    if (!d) {
      d = { key, label: 'CONTROLLER', dpad: null, stick: null, dir: null, held: new Set(), axes: [0, 0, 0, 0, 0, 0], last: '' };
      devices.set(key, d);
    }
    return d;
  }

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
    devices.delete(key);
  }

  // The D-pad wins over the stick; each player can switch either one off.
  function updateDirection(key) {
    const d = device(key);
    const owned = owners.indexOf(key);
    const move = owned >= 0 ? Controls.move(owned) : 'both';
    const dir = (move !== 'stick' && d.dpad) || (move !== 'dpad' && d.stick) || null;
    if (dir === d.dir) return;
    d.dir = dir;
    if (!dir || !game) return;
    const slot = slotFor(key);
    if (slot < 0) return;
    Sound.init();
    game.onDir(slot, dir);
  }

  function setButton(key, name, down) {
    const d = device(key);
    if (down === d.held.has(name)) return;
    if (down) d.held.add(name); else d.held.delete(name);
    if (!game) return;
    const slot = down ? slotFor(key) : owners.indexOf(key);
    if (slot < 0) return;
    if (down) { Sound.init(); d.last = name; }
    if (game.onPadRaw(slot, name, down)) return; // the CONTROLS screen sees raw buttons
    if (!down) return;
    const action = Controls.padAction(slot, name);
    if (action === 'swap') { if (game.state === 'title') swap(); return; }
    if (action !== 'none') game.onPadAction(action, slot);
  }

  function swap() {
    [owners[0], owners[1]] = [owners[1], owners[0]];
    for (const key of owners) if (key) updateDirection(key);
    if (game) game.toast('CONTROLLERS SWAPPED');
  }

  /* ---------- browsers: Gamepad API ---------- */

  function axisDir(x, y, held) {
    const on = held ? 0.35 : 0.5; // a little hysteresis so a resting stick doesn't flicker
    if (Math.max(Math.abs(x), Math.abs(y)) < on) return null;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
  }

  const clampAxis = v => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

  function poll() {
    if (nativeOnly || !navigator.getGamepads) return;
    let list;
    try { list = navigator.getGamepads(); } catch { return; }
    for (const pad of list) {
      if (!pad || !pad.connected) continue;
      const key = 'web:' + pad.index, d = device(key);
      if (d.label === 'CONTROLLER' && typeof pad.id === 'string') d.label = labelFromId(pad.id);
      const b = i => pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
      for (const name of BUTTONS) setButton(key, name, !!b(BUTTON_INDEX[name]));
      const value = i => clampAxis(pad.buttons[i] ? pad.buttons[i].value : 0);
      d.axes[0] = clampAxis(pad.axes[0]); d.axes[1] = clampAxis(pad.axes[1]);
      d.axes[2] = clampAxis(pad.axes[2]); d.axes[3] = clampAxis(pad.axes[3]);
      d.axes[4] = value(6); d.axes[5] = value(7);
      d.dpad = b(12) ? 'up' : b(13) ? 'down' : b(14) ? 'left' : b(15) ? 'right' : null;
      d.stick = axisDir(d.axes[0], d.axes[1], !!d.stick);
      updateDirection(key);
    }
  }

  // Browser ids look like "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)".
  function labelFromId(id) {
    const v = /vendor:\s*([0-9a-f]{4})/i.exec(id) || /^([0-9a-f]{4})-/i.exec(id);
    if (v && VENDORS.has(parseInt(v[1], 16))) return VENDORS.get(parseInt(v[1], 16));
    if (/xbox|xinput/i.test(id)) return 'XBOX';
    return 'GAMEPAD';
  }

  window.addEventListener('gamepaddisconnected', e => release('web:' + e.gamepad.index));

  /* ---------- Android TV app ---------- */

  // Called by the native wrapper with a device id, a fixed event word and fixed values.
  // Anything that doesn't match exactly is ignored.
  const inRange = (v, lo, hi) => Number.isSafeInteger(v) && v >= lo && v <= hi;
  Object.defineProperty(window, '__tvPad', {
    value(deviceId, kind, value, ...rest) {
      if (!inRange(deviceId, -1, 0x7fffffff)) return;
      nativeOnly = true;
      const key = 'tv:' + deviceId;
      if (kind === 'dpad' || kind === 'stick') {
        if (value !== 'none' && !DIRS.includes(value)) return;
        device(key)[kind] = value === 'none' ? null : value;
        updateDirection(key);
      } else if ((kind === 'down' || kind === 'up') && BUTTONS.includes(value)) {
        setButton(key, value, kind === 'down');
      } else if (kind === 'axes') {
        const vals = [value, ...rest];
        if (vals.length !== 6 || !vals.every(v => inRange(v, -100, 100))) return;
        const d = device(key);
        vals.forEach((v, i) => { d.axes[i] = v / 100; });
      } else if (kind === 'info') {
        if (!inRange(value, 0, 0xffff)) return;
        device(key).label = VENDORS.get(value) || 'GAMEPAD';
      } else if (kind === 'gone') {
        release(key);
      }
    },
    writable: false,
    configurable: false,
  });

  return {
    attach(g) { game = g; },
    poll,
    swap,
    joined: slot => owners[slot] !== null,
    // live state of the controller playing as `slot`, for the test screen (read-only use)
    state: slot => (owners[slot] ? devices.get(owners[slot]) || null : null),
    extras: () => [...devices.keys()].filter(k => !owners.includes(k)).length,
  };
})();

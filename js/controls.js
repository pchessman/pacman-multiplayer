/* Pac-Man Versus — player bindings: which keys steer each player, and what each
   controller button does. Edited on the CONTROLS screen, saved in this browser
   (or the TV app) only, and validated every time they're read back. */
'use strict';

const Controls = (() => {
  const KEY = 'pacvs-controls-v1';
  const DIRS = ['up', 'down', 'left', 'right'];
  const PAD_BUTTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'ls', 'rs', 'view', 'menu'];
  const ACTIONS = ['confirm', 'back', 'pause', 'mute', 'swap', 'controls', 'none'];
  const ACTION_NAMES = {
    confirm: 'START / OK', back: 'BACK', pause: 'PAUSE', mute: 'MUTE',
    swap: 'SWAP P1/P2', controls: 'CONTROLS', none: '-',
  };
  const BUTTON_NAMES = {
    a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT',
    ls: 'L-STICK', rs: 'R-STICK', view: 'VIEW', menu: 'MENU',
  };
  const STICK_MODES = ['both', 'dpad', 'stick'];
  const STICK_NAMES = { both: 'D-PAD + STICK', dpad: 'D-PAD ONLY', stick: 'STICK ONLY' };

  const DEFAULT_KEYS = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
  ];
  const DEFAULT_PAD = {
    a: 'confirm', b: 'back', x: 'controls', y: 'swap', lb: 'none', rb: 'none', lt: 'none', rt: 'none',
    ls: 'none', rs: 'none', view: 'mute', menu: 'pause', move: 'both',
  };
  // Keys the game itself uses can't steer a player.
  const RESERVED = new Set(['Enter', 'NumpadEnter', 'Space', 'Escape', 'Backspace', 'Tab',
    'KeyP', 'KeyM', 'KeyF', 'KeyT', 'KeyQ', 'KeyC', 'MetaLeft', 'MetaRight', 'ContextMenu']);
  // KeyboardEvent.code values are plain words; anything else is rejected.
  const CODE_RE = /^[A-Za-z][A-Za-z0-9]{0,23}$/;

  let keys, pads, keyIndex;

  const isCode = c => typeof c === 'string' && CODE_RE.test(c);

  // Saved data is untrusted: start from the defaults and keep only valid, unique entries.
  function sanitize(raw) {
    const k = DEFAULT_KEYS.map(m => ({ ...m }));
    const p = [{ ...DEFAULT_PAD }, { ...DEFAULT_PAD }];
    if (raw && typeof raw === 'object') {
      const rk = Array.isArray(raw.keys) ? raw.keys : [];
      const used = new Set();
      const proposed = [0, 1].map(s => DIRS.map(d => {
        const c = rk[s] && typeof rk[s] === 'object' ? rk[s][d] : null;
        return isCode(c) && !RESERVED.has(c) ? c : null;
      }));
      // all eight keys must be distinct, otherwise keep the defaults
      const flat = proposed.flat();
      if (flat.every(c => c && !used.has(c) && used.add(c))) {
        [0, 1].forEach(s => DIRS.forEach((d, i) => { k[s][d] = proposed[s][i]; }));
      }
      const rp = Array.isArray(raw.pads) ? raw.pads : [];
      [0, 1].forEach(s => {
        const src = rp[s] && typeof rp[s] === 'object' ? rp[s] : {};
        for (const b of PAD_BUTTONS) {
          if (Object.prototype.hasOwnProperty.call(src, b) && ACTIONS.includes(src[b])) p[s][b] = src[b];
        }
        if (STICK_MODES.includes(src.move)) p[s].move = src.move;
        // a controller must always be able to confirm and go back
        if (!PAD_BUTTONS.some(b => p[s][b] === 'confirm') || !PAD_BUTTONS.some(b => p[s][b] === 'back')) p[s] = { ...DEFAULT_PAD };
      });
    }
    return { keys: k, pads: p };
  }

  function reindex() {
    keyIndex = new Map();
    keys.forEach((m, slot) => DIRS.forEach(dir => keyIndex.set(m[dir], Object.freeze({ slot, dir }))));
  }

  function load() {
    const s = sanitize(store.get(KEY, null));
    keys = s.keys;
    pads = s.pads;
    reindex();
  }

  function save() {
    store.set(KEY, { keys, pads });
  }

  // Assign a key to a player's direction. A key already in use swaps places with it.
  function setKey(slot, dir, code) {
    if (!isCode(code)) return 'invalid';
    if (RESERVED.has(code)) return 'reserved';
    const old = keys[slot][dir];
    const owner = keyIndex.get(code);
    if (owner) keys[owner.slot][owner.dir] = old;
    keys[slot][dir] = code;
    reindex();
    save();
    return 'ok';
  }

  // Give `button` the `action`. Whatever had that action before takes the button's old one,
  // so nothing is ever left without a button.
  function bindButton(slot, action, button) {
    const m = pads[slot], prev = m[button];
    if (!PAD_BUTTONS.includes(button) || !ACTIONS.includes(action) || prev === action) return;
    for (const b of PAD_BUTTONS) if (m[b] === action) m[b] = prev;
    m[button] = action;
    save();
  }

  function setMove(slot, mode) {
    if (!STICK_MODES.includes(mode)) return;
    pads[slot].move = mode;
    save();
  }

  function reset(what) {
    if (what === 'keys') keys = DEFAULT_KEYS.map(m => ({ ...m }));
    else if (what === 0 || what === 1) pads[what] = { ...DEFAULT_PAD };
    reindex();
    save();
  }

  // "KeyW" -> "W", "ArrowUp" -> "UP", "ShiftLeft" -> "L-SHIFT", "Numpad8" -> "NUM 8"
  function keyName(code) {
    if (!code) return '-';
    let m;
    if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
    if ((m = /^Digit(\d)$/.exec(code))) return m[1];
    if ((m = /^Arrow(\w+)$/.exec(code))) return m[1].toUpperCase();
    if ((m = /^Numpad(\w+)$/.exec(code))) return 'NUM ' + m[1].toUpperCase().slice(0, 4);
    if ((m = /^(\w+?)(Left|Right)$/.exec(code))) return (m[2] === 'Left' ? 'L-' : 'R-') + m[1].toUpperCase().slice(0, 6);
    const named = { Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`' };
    return named[code] || code.toUpperCase().slice(0, 8);
  }

  load();

  return {
    DIRS, PAD_BUTTONS, ACTIONS, ACTION_NAMES, BUTTON_NAMES, STICK_MODES, STICK_NAMES,
    keyDir: code => keyIndex.get(code) || null,
    keyFor: (slot, dir) => keys[slot][dir],
    keyName,
    setKey,
    isReserved: code => RESERVED.has(code),
    padAction: (slot, button) => (pads[slot] && pads[slot][button]) || 'none',
    buttonsFor: (slot, action) => PAD_BUTTONS.filter(b => pads[slot][b] === action),
    bindButton,
    move: slot => pads[slot].move,
    setMove,
    reset,
    sanitize,
  };
})();

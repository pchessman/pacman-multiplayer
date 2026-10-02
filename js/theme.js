/* Pac-Man Versus — optional theme song supplied by the player.

   Nothing here ever turns file contents into code or markup. A file is only
   accepted if it passes every check below, and it is only ever handed to the
   browser's audio decoder:
     1. size between 1 byte and MAX_BYTES
     2. declared type (if any) is audio/*
     3. the first bytes match a real audio container (MP3, OGG, WAV, FLAC, M4A)
     4. the browser can actually decode it as audio, and it is not too long
   The accepted file is kept only in this browser (IndexedDB) and is never sent
   anywhere. When the game runs from disk, sounds/theme.mp3 is used if present. */
'use strict';

const Theme = (() => {
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_SECONDS = 180;
  const DB_NAME = 'pacvs', STORE_NAME = 'media', KEY = 'theme';
  const BUNDLED = 'sounds/theme.mp3';

  // Magic-number check on the first bytes of the file.
  function looksLikeAudio(buf) {
    const b = new Uint8Array(buf, 0, Math.min(12, buf.byteLength));
    const ascii = (i, s) => [...s].every((ch, k) => b[i + k] === ch.charCodeAt(0));
    if (b.length < 4) return false;
    return ascii(0, 'ID3') ||                                 // MP3 with ID3 tag
      (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) ||             // raw MPEG audio frame
      ascii(0, 'OggS') || ascii(0, 'fLaC') ||
      (ascii(0, 'RIFF') && b.length >= 12 && ascii(8, 'WAVE')) ||
      (b.length >= 8 && ascii(4, 'ftyp'));                     // MP4 / M4A
  }

  async function validate(buf, declaredType) {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0 || buf.byteLength > MAX_BYTES) throw new Error('size');
    if (declaredType && !/^audio\//.test(declaredType)) throw new Error('type');
    if (!looksLikeAudio(buf)) throw new Error('signature');
    const audio = await Sound.decode(buf.slice(0)); // decoder gets its own copy
    if (!audio || !(audio.duration > 0) || audio.duration > MAX_SECONDS) throw new Error('length');
    return audio;
  }

  /* ---------- IndexedDB (this browser only) ---------- */

  function db() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }

  async function idb(mode, op) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE_NAME, mode);
      const req = op(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => { d.close(); resolve(req && req.result); };
      tx.onerror = tx.onabort = () => { d.close(); reject(tx.error); };
    });
  }

  /* ---------- public ---------- */

  let onChange = () => {};

  // Load a file the player picked. Resolves true if it was accepted.
  async function fromFile(file) {
    if (!file || file.size > MAX_BYTES) throw new Error('size');
    const buf = await file.arrayBuffer();
    const audio = await validate(buf, file.type);
    Sound.setThemeBuffer(audio);
    try { await idb('readwrite', s => s.put(buf, KEY)); } catch { /* keeps working this session */ }
    onChange(true);
    return true;
  }

  async function restore() {
    try {
      const buf = await idb('readonly', s => s.get(KEY));
      if (!buf) return;
      Sound.setThemeBuffer(await validate(buf, ''));
      onChange(true);
    } catch { /* nothing stored, or stored data no longer valid */ }
  }

  // sounds/theme.mp3 next to index.html (local copies only; it is git-ignored).
  function bundled() {
    try {
      const el = new Audio();
      el.preload = 'auto';
      el.addEventListener('canplaythrough', () => {
        if (el.duration > 0 && el.duration <= MAX_SECONDS) { Sound.setThemeElement(el); onChange(true); }
      }, { once: true });
      el.addEventListener('error', () => {}, { once: true });
      el.src = BUNDLED;
    } catch { /* audio element unavailable */ }
  }

  // Opens the system file picker. Must be called from a key or click handler.
  function pick(report) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp3,.ogg,.wav,.m4a,.flac,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/flac';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      fromFile(file).then(() => report('THEME LOADED'), () => report('NOT A VALID AUDIO FILE'));
    }, { once: true });
    input.click();
  }

  return {
    pick, restore, bundled, looksLikeAudio, validate,
    set onChange(fn) { onChange = typeof fn === 'function' ? fn : () => {}; },
  };
})();

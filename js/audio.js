/* Pac-Man Versus — synthesized 8-bit sound (Web Audio, no asset files) */
'use strict';

const Sound = (() => {
  let ac = null;
  let master = null;
  let muted = false;
  let siren = null;
  let sirenKey = '';
  let wakaFlip = false;

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);
  }

  // One enveloped oscillator note, optionally sweeping to `to` Hz.
  function blip(freq, dur, { type = 'square', vol = 0.1, to = null, delay = 0, exp = false } = {}) {
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) {
      if (exp) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      else osc.frequency.linearRampToValueAtTime(to, t0 + dur);
    }
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.setValueAtTime(vol, t0 + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function waka() {
    wakaFlip = !wakaFlip;
    if (wakaFlip) blip(520, 0.08, { type: 'triangle', vol: 0.28, to: 230 });
    else blip(230, 0.08, { type: 'triangle', vol: 0.28, to: 520 });
  }

  function eatGhost() {
    blip(140, 0.42, { type: 'sawtooth', vol: 0.07, to: 1700, exp: true });
  }

  function fruit() {
    blip(500, 0.08, { vol: 0.08, to: 1000 });
    blip(800, 0.12, { vol: 0.08, to: 1600, delay: 0.08 });
  }

  function extraLife() {
    for (let i = 0; i < 4; i++) blip(1180, 0.07, { vol: 0.07, delay: i * 0.14 });
  }

  function menu() {
    blip(660, 0.05, { vol: 0.06 });
  }

  function death() {
    for (let i = 0; i < 10; i++) {
      const f = 900 - i * 65;
      blip(f, 0.11, { type: 'square', vol: 0.06, to: f - 230, delay: i * 0.11 });
    }
    blip(260, 0.12, { type: 'triangle', vol: 0.3, to: 60, delay: 1.15 });
    blip(260, 0.12, { type: 'triangle', vol: 0.3, to: 60, delay: 1.32 });
  }

  // Original chiptune fanfare (lead in 16ths, bass in 8ths).
  function intro() {
    const step = 0.12;
    const lead = [76, 79, 84, 79, 76, 79, 84, 88, 86, 83, 79, 83, 86, 0, 0, 0,
                  77, 81, 84, 81, 77, 81, 84, 89, 88, 86, 84, 83, 84, 0, 0, 0];
    const bass = [48, 55, 48, 55, 43, 50, 43, 50, 41, 48, 41, 48, 43, 50, 48, 0];
    lead.forEach((n, i) => { if (n) blip(midi(n), step * 0.9, { vol: 0.06, delay: i * step }); });
    bass.forEach((n, i) => { if (n) blip(midi(n), step * 1.8, { type: 'triangle', vol: 0.25, delay: i * step * 2 }); });
  }

  // Original jaunty loop for the intermissions (~6.7s).
  function intermission() {
    const step = 0.14;
    const lead = [72, 0, 76, 79, 81, 0, 79, 76, 77, 0, 81, 84, 86, 0, 84, 81,
                  79, 0, 76, 72, 74, 76, 77, 79, 76, 0, 74, 0, 72, 0, 0, 0,
                  72, 0, 76, 79, 81, 0, 79, 76, 77, 0, 81, 84, 86, 0, 88, 86,
                  84, 0, 79, 76, 77, 0, 74, 71, 72, 0, 0, 0, 0, 0, 0, 0];
    const bass = [48, 55, 53, 60, 50, 57, 55, 50, 48, 55, 53, 60, 50, 55, 48, 0];
    lead.forEach((n, i) => { if (n) blip(midi(n), step * 0.85, { vol: 0.055, delay: i * step }); });
    bass.forEach((n, i) => { if (n) blip(midi(n), step * 3.6, { type: 'triangle', vol: 0.22, delay: i * step * 4 }); });
    return lead.length * step;
  }

  function treatAppear() {
    [84, 88, 91].forEach((n, i) => blip(midi(n), 0.06, { vol: 0.05, delay: i * 0.06 }));
  }

  function sugarRush() {
    blip(300, 0.35, { type: 'square', vol: 0.06, to: 1400, exp: true });
    blip(450, 0.35, { type: 'square', vol: 0.04, to: 2000, exp: true, delay: 0.12 });
  }

  function elroy() {
    blip(1500, 0.06, { vol: 0.05 });
    blip(1800, 0.06, { vol: 0.05, delay: 0.08 });
  }

  function win() {
    [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => blip(midi(n), 0.12, { vol: 0.07, delay: i * 0.09 }));
  }

  function lose() {
    [79, 75, 72, 67, 63, 60].forEach((n, i) => blip(midi(n), 0.16, { vol: 0.07, delay: i * 0.13 }));
  }

  // Looping background siren: 'off' | 'normal' | 'fright' | 'eyes'.
  function setSiren(mode, progress = 0, fast = 0) {
    if (!ac) return;
    if (!siren) {
      const osc = ac.createOscillator();
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      const gain = ac.createGain();
      osc.type = 'triangle';
      lfo.type = 'sine';
      gain.gain.value = 0;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      lfo.start();
      siren = { osc, lfo, depth, gain };
    }
    const key = mode + ':' + Math.round(progress * 8) + ':' + fast;
    if (key === sirenKey) return;
    sirenKey = key;
    const now = ac.currentTime;
    const set = (param, v) => param.setTargetAtTime(v, now, 0.04);
    if (mode === 'normal') {
      siren.lfo.type = 'sine';
      set(siren.osc.frequency, 380 + 260 * progress);
      set(siren.lfo.frequency, 3 + progress * 2 + fast * 1.5);
      set(siren.depth.gain, 110);
      set(siren.gain.gain, 0.045);
    } else if (mode === 'fright') {
      siren.lfo.type = 'sawtooth';
      set(siren.osc.frequency, 240);
      set(siren.lfo.frequency, 9);
      set(siren.depth.gain, 110);
      set(siren.gain.gain, 0.06);
    } else if (mode === 'eyes') {
      siren.lfo.type = 'sawtooth';
      set(siren.osc.frequency, 950);
      set(siren.lfo.frequency, 14);
      set(siren.depth.gain, 380);
      set(siren.gain.gain, 0.035);
    } else {
      set(siren.gain.gain, 0);
    }
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ac.currentTime, 0.02);
    return muted;
  }

  return {
    init, waka, eatGhost, fruit, extraLife, menu, death, intro, intermission, treatAppear, sugarRush, elroy,
    win, lose, setSiren, toggleMute,
    get muted() { return muted; },
  };
})();

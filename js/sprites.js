/* Pac-Man Versus — pixel-art sprites, built at the arcade's native resolution
   and cached as canvases. One native pixel = PX canvas pixels. */
'use strict';

const T = 16;  // canvas pixels per maze tile
const PX = 2;  // canvas pixels per native (8px-tile) pixel

const Sprites = (() => {
  const cache = new Map();

  function make(key, w, h, paint) {
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = w * PX;
    c.height = h * PX;
    const g = c.getContext('2d');
    paint((x, y, color) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      g.fillStyle = color;
      g.fillRect(x * PX, y * PX, PX, PX);
    });
    cache.set(key, c);
    return c;
  }

  const inCircle = (x, y, cx, cy, r) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;

  function line(put, x0, y0, x1, y1, color) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      put(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /* ---------- Pac-Man ---------- */

  // angle: facing direction in radians; mouth: half-angle of the mouth wedge.
  function pac(angle, mouth) {
    const key = `pac:${angle.toFixed(2)}:${mouth.toFixed(3)}`;
    return make(key, 13, 13, put => {
      for (let y = 0; y < 13; y++) {
        for (let x = 0; x < 13; x++) {
          const dx = x - 6, dy = y - 6;
          if (dx * dx + dy * dy > 42.25) continue;
          if (mouth > 0) {
            let a = Math.atan2(dy, dx) - angle;
            while (a > Math.PI) a -= 2 * Math.PI;
            while (a < -Math.PI) a += 2 * Math.PI;
            if (Math.abs(a) < mouth) continue;
          }
          put(x, y, '#FFFF00');
        }
      }
    });
  }

  /* ---------- Ghosts ---------- */

  const GHOST_TOP = [
    '.....####.....',
    '...########...',
    '..##########..',
    '.############.',
    '.############.',
    '.############.',
    '##############',
    '##############',
    '##############',
    '##############',
    '##############',
    '##############',
  ];
  const SKIRTS = [
    ['##.###..###.##', '#...##..##...#'],
    ['####.####.####', '.##...##...##.'],
  ];
  const EYE_WHITE = ['.##.', '####', '####', '####', '.##.'];

  function body(put, color, frame) {
    GHOST_TOP.concat(SKIRTS[frame]).forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') put(x, y, color);
    });
  }

  function eyes(put, dir) {
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0;
    for (const ex of [2, 8]) {
      const ox = ex + dx, oy = 3 + dy;
      EYE_WHITE.forEach((row, j) => {
        for (let i = 0; i < 4; i++) if (row[i] === '#') put(ox + i, oy + j, '#DEDEFF');
      });
      const px = ox + 1 + dx, py = oy + (dy < 0 ? 0 : dy > 0 ? 3 : 2);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) put(px + i, py + j, '#2121DE');
    }
  }

  const dirKey = d => (d ? `${d.x},${d.y}` : '0,0');

  function ghost(color, frame, dir) {
    return make(`g:${color}:${frame}:${dirKey(dir)}`, 14, 14, put => {
      body(put, color, frame);
      eyes(put, dir);
    });
  }

  function ghostEyes(dir) {
    return make(`eyes:${dirKey(dir)}`, 14, 14, put => eyes(put, dir));
  }

  function frightGhost(frame, white) {
    return make(`fr:${frame}:${white}`, 14, 14, put => {
      body(put, white ? '#DEDEFF' : '#2121FF', frame);
      const face = white ? '#FF0000' : '#FFB8AE';
      for (const ex of [4, 8]) for (let j = 5; j < 7; j++) for (let i = 0; i < 2; i++) put(ex + i, j, face);
      for (let x = 2; x <= 11; x++) put(x, Math.floor((x - 1) / 2) % 2 === 0 ? 9 : 10, face);
    });
  }

  /* ---------- Pellets ---------- */

  const dot = () => make('dot', 2, 2, put => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) put(x, y, '#FFB8AE');
  });

  const pellet = () => make('pellet', 8, 8, put => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (inCircle(x, y, 4, 4, 4.1)) put(x, y, '#FFB8AE');
  });

  /* ---------- Fruit (12x12) ---------- */

  const STRAWBERRY = [
    '....g..g....',
    '...gggggg...',
    '..rrggggrr..',
    '.rrrrrrrrrr.',
    '.rwrrrwrrwr.',
    '.rrrrrrrrrr.',
    '.rrwrrrwrrr.',
    '..rrrrrrrr..',
    '..rrwrrwrr..',
    '...rrrrrr...',
    '....rrrr....',
    '.....rr.....',
  ];

  const FRUIT_PAINTERS = {
    cherry(put) {
      line(put, 4, 5, 10, 1, '#DE9751');
      line(put, 9, 6, 10, 1, '#DE9751');
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
        if (inCircle(x, y, 3.5, 8.5, 2.9) || inCircle(x, y, 9, 9.5, 2.9)) put(x, y, '#FF0000');
      }
      put(2, 7, '#FFFFFF');
      put(8, 8, '#FFFFFF');
    },
    strawberry(put) {
      const pal = { r: '#FF0000', w: '#FFFFFF', g: '#00DE00' };
      STRAWBERRY.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) put(x, y, pal[ch]); }));
    },
    orange(put) {
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (inCircle(x, y, 6, 6.8, 4.9)) put(x, y, '#FFB852');
      put(4, 4, '#FFE0B0');
      put(6, 1, '#DE9751');
      for (const [x, y] of [[7, 1], [8, 1], [9, 1], [8, 0], [9, 0]]) put(x, y, '#00DE00');
    },
    apple(put) {
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
        if (inCircle(x, y, 6, 7, 5) && !(y === 2 && (x === 5 || x === 6))) put(x, y, '#FF0000');
      }
      put(6, 1, '#DE9751');
      put(6, 0, '#DE9751');
      for (const [x, y] of [[7, 1], [8, 1], [8, 0]]) put(x, y, '#00DE00');
      for (const [x, y] of [[3, 6], [3, 7], [4, 5]]) put(x, y, '#FFFFFF');
    },
    melon(put) {
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
        const nx = (x + 0.5 - 6) / 5.3, ny = (y + 0.5 - 6.8) / 5.2;
        if (nx * nx + ny * ny > 1) continue;
        put(x, y, (x * 7 + y * 3) % 5 === 0 ? '#DEDEDE' : '#00A800');
      }
      put(6, 0, '#DE9751');
      put(6, 1, '#DE9751');
    },
  };

  const fruit = kind => make(`fruit:${kind}`, 12, 12, FRUIT_PAINTERS[kind]);

  return { pac, ghost, ghostEyes, frightGhost, dot, pellet, fruit };
})();

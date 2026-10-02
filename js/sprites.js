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

  function art(put, rows, pal) {
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (pal[row[x]]) put(x, y, pal[row[x]]); });
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

  const GALAXIAN = [
    '............',
    '.....yy.....',
    '....yyyy....',
    'b..yyyyyy..b',
    'b.yyrrrryy.b',
    'bbyrrrrrrybb',
    'bbbrryyrrbbb',
    'bb..rrrr..bb',
    'b....rr....b',
    '.....rr.....',
    '.....rr.....',
    '............',
  ];
  const BELL = [
    '.....yy.....',
    '....yyyy....',
    '...yyyyyy...',
    '..yyyyyyyy..',
    '..ywyyyyyy..',
    '..ywyyyyyy..',
    '.yywyyyyyyy.',
    '.yyyyyyyyyy.',
    'yyyyyyyyyyyy',
    'cccccccccccc',
    '.....dd.....',
    '....dddd....',
  ];
  const KEY = [
    '...cccccc...',
    '..cc....cc..',
    '..cc....cc..',
    '...cccccc...',
    '.....ww.....',
    '.....ww.....',
    '.....wwww...',
    '.....ww.....',
    '.....www....',
    '.....ww.....',
    '.....wwww...',
    '.....ww.....',
  ];
  const ICECREAM = [
    '.....rr.....',
    '....pppp....',
    '...pppppp...',
    '..ppwppppp..',
    '..pppppppp..',
    '..pppppppp..',
    '..tttttttt..',
    '...txtxtt...',
    '...ttxtxt...',
    '....txtt....',
    '.....tx.....',
    '.....tt.....',
  ];
  const CUPCAKE = [
    '.....r......',
    '....wwww....',
    '...wwwwww...',
    '..wwswwsww..',
    '.wwwwwwwwww.',
    '.swwwwswwws.',
    '..gggggggg..',
    '..gkgkgkgk..',
    '..gkgkgkgk..',
    '...gkgkgk...',
    '...gggggg...',
    '............',
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
      art(put, STRAWBERRY, { r: '#FF0000', w: '#FFFFFF', g: '#00DE00' });
    },
    galaxian(put) {
      art(put, GALAXIAN, { y: '#FFFF00', r: '#FF0000', b: '#2121FF' });
    },
    bell(put) {
      art(put, BELL, { y: '#FFFF00', w: '#FFFFFF', c: '#00FFFF', d: '#DEDEDE' });
    },
    key(put) {
      art(put, KEY, { c: '#00FFFF', w: '#DEDEDE' });
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

  // Dark silhouette for fruit the players haven't reached yet.
  const fruitLocked = kind => make(`fruit-locked:${kind}`, 12, 12, put => FRUIT_PAINTERS[kind]((x, y) => put(x, y, '#2A2A55')));

  /* ---------- Bonus treats (12x12) ---------- */

  const TREAT_PAINTERS = {
    icecream(put) {
      art(put, ICECREAM, { r: '#FF0000', p: '#FF8FD0', w: '#FFFFFF', t: '#DE9751', x: '#A0612A' });
    },
    cupcake(put) {
      art(put, CUPCAKE, { r: '#FF0000', w: '#FFD8EC', s: '#00FFFF', g: '#C890FF', k: '#8A4FD0' });
    },
    donut(put) {
      const sprinkles = { '3,4': '#00FFFF', '8,3': '#FFFF00', '9,7': '#00FF00', '4,8': '#FFFFFF', '6,2': '#00FF00', '2,6': '#FFFF00' };
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
        if (!inCircle(x, y, 6, 6, 5.6) || inCircle(x, y, 6, 6, 1.9)) continue;
        const frosted = inCircle(x, y, 6, 5.6, 4.6) && !inCircle(x, y, 6, 6, 2.6);
        put(x, y, sprinkles[`${x},${y}`] || (frosted ? '#FF6FB8' : '#DE9751'));
      }
    },
    lollipop(put) {
      for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) {
        if (!inCircle(x, y, 6, 4.5, 4.4)) continue;
        const a = Math.atan2(y + 0.5 - 4.5, x + 0.5 - 6) + Math.hypot(y + 0.5 - 4.5, x + 0.5 - 6) * 0.9;
        put(x, y, Math.floor((a + Math.PI * 4) / (Math.PI / 3)) % 2 ? '#FF2A6D' : '#FFFFFF');
      }
      for (let y = 9; y < 12; y++) put(6, y, '#DEDEDE');
    },
  };

  const treat = kind => make(`treat:${kind}`, 12, 12, TREAT_PAINTERS[kind]);

  /* ---------- Intermission props ---------- */

  // Blinky after his sheet snags on the nail: the right of his skirt is gone.
  function tornGhost(frame, dir) {
    return make(`torn:${frame}:${dirKey(dir)}`, 14, 14, put => {
      body(put, '#FF0000', frame);
      for (let y = 11; y < 14; y++) for (let x = 7; x < 14; x++) put(x, y, '#000000');
      for (const [x, y] of [[8, 11], [9, 11], [8, 12], [9, 12], [8, 13], [9, 13], [10, 13]]) put(x, y, '#FFB8AE');
      eyes(put, dir);
    });
  }

  // Blinky with his torn sheet stitched up.
  function patchedGhost(frame, dir) {
    return make(`patch:${frame}:${dirKey(dir)}`, 14, 14, put => {
      body(put, '#FF0000', frame);
      for (let y = 9; y < 13; y++) for (let x = 8; x < 12; x++) put(x, y, '#DEB887');
      for (const [x, y] of [[8, 9], [10, 9], [11, 10], [8, 11], [11, 12], [9, 12]]) put(x, y, '#000000');
      eyes(put, dir);
    });
  }

  // Blinky without his sheet, scuttling to the right.
  function nakedGhost(frame) {
    return make(`naked:${frame}`, 16, 10, put => {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 16; x++) {
        const nx = (x + 0.5 - 8) / 7.5, ny = (y + 0.5 - 4) / 3.4;
        if (nx * nx + ny * ny <= 1) put(x, y, '#FF0000');
      }
      for (const [x, y] of [[10, 2], [13, 2]]) { put(x, y, '#DEDEFF'); put(x + 1, y, '#2121DE'); }
      const legs = frame ? [2, 5, 8, 11] : [3, 6, 9, 12];
      for (const x of legs) { put(x, 7, '#FF0000'); put(x + (frame ? 1 : -1), 8, '#FF0000'); }
    });
  }

  const cloak = () => make('cloak', 14, 14, put => body(put, '#FF0000', 0));

  const nail = () => make('nail', 3, 6, put => {
    for (let x = 0; x < 3; x++) put(x, 0, '#DEDEDE');
    for (let y = 1; y < 6; y++) put(1, y, '#A0A0A0');
  });

  return { pac, ghost, ghostEyes, frightGhost, dot, pellet, fruit, fruitLocked, treat, tornGhost, patchedGhost, nakedGhost, cloak, nail };
})();

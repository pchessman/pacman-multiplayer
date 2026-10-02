/* Pac-Man Versus — the arcade's three intermission acts ("coffee breaks"). */
'use strict';

class Intermission {
  constructor(game, act) {
    this.game = game;
    this.act = act;
    this.t = 0;
    this.duration = act === 2 ? 10.5 : 13;
    Sound.intermission();
  }

  get done() { return this.t >= this.duration; }

  update(dt) { this.t += dt; }

  draw() {
    const g = this.game, t = this.t, cy = 18 * T;
    const frame = Math.floor(t * 7.5) % 2;
    const mouth = MOUTHS[Math.floor(t * 15) % 4];
    const at = x => x * T;

    if (this.act === 1) {
      if (t < 6) {
        const px = 30 - 6 * t;
        g.blit(Sprites.pac(Math.PI, mouth), at(px), cy);
        g.blit(Sprites.ghost(GHOSTS.blinky.color, frame, LEFT), at(px + 3.2 - 0.25 * t), cy);
      } else {
        const tb = t - 6;
        g.blit(Sprites.frightGhost(frame, false), at(-2 + 4.6 * tb), cy);
        g.blitScaled(Sprites.pac(0, mouth), at(-9 + 5 * tb), cy - 16, 2.6);
      }
    } else if (this.act === 2) {
      // Blinky's sheet snags on a nail and tears.
      const nailX = 14;
      g.blit(Sprites.nail(), at(nailX), cy + 9);
      const snagAt = (34 - (nailX + 0.9)) / 6.5;
      const tearAt = snagAt + 2.5;
      const px = 30 - 6.5 * t;
      if (px > -3) g.blit(Sprites.pac(Math.PI, mouth), at(px), cy);
      if (t < snagAt) {
        g.blit(Sprites.ghost(GHOSTS.blinky.color, frame, LEFT), at(34 - 6.5 * t), cy);
      } else if (t < tearAt) {
        const s = t - snagAt;
        const bx = nailX + 0.9 - 1.2 * s;
        g.blit(Sprites.ghost(GHOSTS.blinky.color, frame, LEFT), at(bx), cy);
        g.ctx.fillStyle = COLOR.red;
        const x0 = at(bx) + 10, x1 = at(nailX);
        g.ctx.fillRect(x0, cy + 6, x1 - x0, 4);
      } else {
        const s = t - tearAt;
        const look = s < 1.2 ? RIGHT : s < 2.4 ? DOWN : null;
        g.blit(Sprites.tornGhost(0, look), at(nailX + 0.9 - 3), cy);
        g.ctx.fillStyle = COLOR.red;
        g.ctx.fillRect(at(nailX) - 6, cy + 6, 6, 4);
        g.ctx.fillRect(at(nailX) - 4, cy + 10, 4, 2);
      }
    } else {
      // Patched Blinky gives chase, then scuttles back dragging his sheet.
      if (t < 6) {
        const px = 30 - 6 * t;
        g.blit(Sprites.pac(Math.PI, mouth), at(px), cy);
        g.blit(Sprites.patchedGhost(frame, LEFT), at(px + 3.2 - 0.25 * t), cy);
      } else {
        const nx = -3 + 4.2 * (t - 6);
        g.blit(Sprites.cloak(), at(nx - 1.5), cy + 2);
        g.blit(Sprites.nakedGhost(Math.floor(t * 10) % 2), at(nx), cy + 6);
      }
    }
    g.text('ENTER  SKIP', WIDTH / 2, 33 * T, COLOR.grey, 8, 'center');
  }
}

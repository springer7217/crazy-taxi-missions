type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
};

export class Particles {
  private bits: Bit[] = [];
  cap: number;

  constructor(cap = 260) {
    this.cap = cap;
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, r: number, color: string) {
    let slot = this.bits.find((b) => b.life <= 0);
    if (!slot) {
      if (this.bits.length >= this.cap) slot = this.bits[0];
      else {
        slot = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 1, color: "#fff" };
        this.bits.push(slot);
      }
    }
    slot.x = x;
    slot.y = y;
    slot.vx = vx;
    slot.vy = vy;
    slot.life = life;
    slot.max = life;
    slot.r = r;
    slot.color = color;
  }

  burst(x: number, y: number, color: string, count: number, speed: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.25 + Math.random());
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.28 + Math.random() * 0.35, 0.18 + Math.random() * 0.45, color);
    }
  }

  update(dt: number) {
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 0.98;
      b.vy *= 0.98;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, b.life / b.max);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (0.6 + 0.4 * (b.life / b.max)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

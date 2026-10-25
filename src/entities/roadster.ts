import type { SkinId, ThrusterId } from "../game/types.ts";

export const THRUSTER_COLOR: Record<ThrusterId, string> = {
  cyan: "#5cefff",
  amber: "#ffb025",
  magenta: "#ff4ad4",
  violet: "#b08cff",
};

/**
 * Hop: hold to charge 0→1 in 0.62s, release to leave the ground.
 * vz = (16 + charge * 40) * jumpMul, gravity 68.
 * Full stock hop peaks near 23m / 1.6s. Hop III (jumpMul 1.4) peaks near 45m.
 * Cars and people are cleared above 2m. Buildings clear only while z exceeds
 * their height, capped at 50m, so Willis Tower never opens.
 * Height reads as sprite scale, a shadow slid southeast, and a small lift.
 */
export const GRAVITY = 68;
const CHARGE_RATE = 1 / 0.62;

export class Roadster {
  x = 0;
  y = 0;
  heading = 0;
  vx = 0;
  vy = 0;
  z = 0;
  vz = 0;
  charge = 0;
  radius = 1.25;
  trail: { x: number; y: number }[] = [];
  private trailAcc = 0;
  blur = 0;

  reset(x: number, y: number, heading: number) {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.vx = 0;
    this.vy = 0;
    this.z = 0;
    this.vz = 0;
    this.charge = 0;
    this.trail = [];
    this.blur = 0;
  }

  /**
   * Integrates arcade drift and the hop. Returns a landing impact speed
   * (negative vz) when the car meets the ground this step, else 0.
   * `launched` is the charge that just left the pad.
   */
  step(
    dt: number,
    throttle: number,
    steer: number,
    drift: boolean,
    jumpHeld: boolean,
    tune: { maxSpeed: number; accel: number; grip: number; steer: number; jumpMul: number },
  ) {
    let landed = 0;
    let launched = 0;
    const speed = Math.hypot(this.vx, this.vy);
    const rate = tune.steer * (0.42 + 0.58 * Math.min(1, speed / 14)) * (drift ? 1.7 : 1);
    this.heading += steer * rate * dt;
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    let forward = this.vx * fx + this.vy * fy;
    let lateral = this.vx * -fy + this.vy * fx;
    if (throttle > 0) forward += tune.accel * throttle * dt;
    if (throttle < 0) forward += 22 * throttle * dt;
    const grip = drift ? 1.35 : tune.grip;
    lateral *= Math.exp(-grip * dt);
    forward *= Math.exp(-(drift ? 0.28 : 0.72) * dt);
    if (forward > tune.maxSpeed) forward = tune.maxSpeed;
    if (forward < -9) forward = -9;
    this.vx = fx * forward - fy * lateral;
    this.vy = fy * forward + fx * lateral;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.z > 0) {
      this.vz -= GRAVITY * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        landed = this.vz;
        this.z = 0;
        this.vz = 0;
        this.blur = 0.22;
      }
    } else if (jumpHeld) {
      this.charge = Math.min(1, this.charge + dt * CHARGE_RATE);
    } else if (this.charge > 0.05) {
      launched = this.charge;
      this.vz = (16 + this.charge * 40) * tune.jumpMul;
      this.z = 0.08;
      this.charge = 0;
    } else {
      this.charge = 0;
    }

    if (this.z > 0.45) {
      this.trailAcc += dt;
      if (this.trailAcc > 0.03) {
        this.trailAcc = 0;
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 22) this.trail.shift();
      }
    } else if (this.trail.length) {
      this.trailAcc += dt;
      if (this.trailAcc > 0.04) {
        this.trailAcc = 0;
        this.trail.shift();
      }
    }
    if (this.blur > 0) this.blur = Math.max(0, this.blur - dt);
    return { landed, launched, lateral: Math.abs(lateral), speed: Math.hypot(this.vx, this.vy) };
  }

  get airborne() {
    return this.z > 0.8;
  }

  thrusters() {
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    const px = -s;
    const py = c;
    const bx = this.x - c * 2.15;
    const by = this.y - s * 2.15;
    return [
      { x: bx + px * 0.4, y: by + py * 0.4 },
      { x: bx - px * 0.4, y: by - py * 0.4 },
    ];
  }

  draw(
    ctx: CanvasRenderingContext2D,
    skin: SkinId,
    thruster: ThrusterId,
    steer: number,
    throttle: number,
    time: number,
    ghosts: boolean,
  ) {
    const color = THRUSTER_COLOR[thruster];
    const vis = Math.min(this.z, 30);
    if (ghosts && (this.blur > 0 || Math.hypot(this.vx, this.vy) > 22)) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.translate(this.x - Math.cos(this.heading) * 1.4, this.y - Math.sin(this.heading) * 1.4);
      ctx.rotate(this.heading);
      flatBody(ctx, skin === "gold" ? "#e6c56e" : "#c5ced6");
      ctx.restore();
    }
    if (this.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 0.45;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (const p of this.trail) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.x + vis * 0.55, this.y + vis * 0.42);
    ctx.rotate(this.heading);
    ctx.fillStyle = `rgba(0,0,0,${0.38 - Math.min(0.2, vis * 0.006)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.05, 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(this.x, this.y - vis * 0.22);
    ctx.rotate(this.heading);
    const scale = 1 + vis * 0.016;
    const squat = 1 - this.charge * 0.07;
    ctx.scale(scale, scale * squat);
    ctx.transform(1, 0, -(this.charge * 0.16 + (this.z > 0 ? 0.06 : 0)), 1, 0, 0);
    const glow = 0.12 + this.charge * 0.38 + (this.z > 0 ? 0.28 : 0);
    ctx.save();
    ctx.globalAlpha = glow;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(-0.2, 0, 2.3, 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawWheels(ctx, steer);
    bodyPath(ctx);
    ctx.fillStyle = bodyGradient(ctx, skin);
    ctx.fill();
    ctx.save();
    bodyPath(ctx);
    ctx.clip();
    ctx.globalAlpha = skin === "matte" ? 0.05 : 0.16;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 0.045;
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-2.3, i * 0.18);
      ctx.lineTo(2.5, i * 0.18 + 0.55);
      ctx.stroke();
    }
    const sweep = ((time * 0.45) % 1) * 5.2 - 2.6;
    ctx.globalAlpha = skin === "matte" ? 0.08 : 0.42;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(sweep, -1.15);
    ctx.lineTo(sweep + 0.16, -1.15);
    ctx.lineTo(sweep + 0.48, 1.15);
    ctx.lineTo(sweep + 0.28, 1.15);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.04;
    bodyPath(ctx);
    ctx.stroke();
    drawCanopy(ctx);
    drawJets(ctx, color, throttle, this.z, this.charge, time);
    ctx.restore();
  }
}

function bodyPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(2.48, 0);
  ctx.bezierCurveTo(2.05, 0.46, 1.15, 0.82, 0.15, 0.94);
  ctx.lineTo(-1.2, 0.98);
  ctx.quadraticCurveTo(-1.95, 0.9, -2.18, 0.46);
  ctx.lineTo(-2.08, 0.2);
  ctx.lineTo(-2.08, -0.2);
  ctx.lineTo(-2.18, -0.46);
  ctx.quadraticCurveTo(-1.95, -0.9, -1.2, -0.98);
  ctx.lineTo(0.15, -0.94);
  ctx.bezierCurveTo(1.15, -0.82, 2.05, -0.46, 2.48, 0);
  ctx.closePath();
}

function flatBody(ctx: CanvasRenderingContext2D, color: string) {
  bodyPath(ctx);
  ctx.fillStyle = color;
  ctx.fill();
}

function bodyGradient(ctx: CanvasRenderingContext2D, skin: SkinId) {
  const g = ctx.createLinearGradient(-2.2, -1, 2.4, 1);
  if (skin === "matte") {
    g.addColorStop(0, "#121417");
    g.addColorStop(0.5, "#2a2f35");
    g.addColorStop(1, "#0d0f12");
  } else if (skin === "gold") {
    g.addColorStop(0, "#7a5a22");
    g.addColorStop(0.38, "#f3d48a");
    g.addColorStop(0.52, "#fff6d4");
    g.addColorStop(0.72, "#c7963e");
    g.addColorStop(1, "#6a4c16");
  } else {
    g.addColorStop(0, "#7f878f");
    g.addColorStop(0.32, "#e7eef3");
    g.addColorStop(0.5, "#ffffff");
    g.addColorStop(0.68, "#b4bdc6");
    g.addColorStop(1, "#6e777f");
  }
  return g;
}

function drawWheels(ctx: CanvasRenderingContext2D, steer: number) {
  const spots: [number, number, number][] = [
    [1.28, 0.8, steer * 0.4],
    [1.28, -0.8, steer * 0.4],
    [-1.28, 0.84, 0],
    [-1.28, -0.84, 0],
  ];
  ctx.fillStyle = "#14161a";
  for (const [x, y, rot] of spots) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillRect(-0.3, -0.13, 0.6, 0.26);
    ctx.fillStyle = "#2c3238";
    ctx.fillRect(-0.12, -0.13, 0.08, 0.26);
    ctx.restore();
    ctx.fillStyle = "#14161a";
  }
}

function drawCanopy(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.ellipse(0.62, 0, 0.82, 0.4, 0, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(0, -0.45, 0.2, 0.45);
  g.addColorStop(0, "rgba(214, 240, 255, 0.72)");
  g.addColorStop(0.45, "rgba(40, 70, 90, 0.28)");
  g.addColorStop(1, "rgba(186, 214, 230, 0.5)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 0.04;
  ctx.stroke();
  ctx.fillStyle = "rgba(16, 18, 22, 0.72)";
  ctx.fillRect(0.28, -0.22, 0.36, 0.16);
  ctx.fillRect(0.28, 0.06, 0.36, 0.16);
  ctx.strokeStyle = "rgba(230,240,246,0.7)";
  ctx.beginPath();
  ctx.arc(1.05, 0, 0.09, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(2.15, -0.08, 0.16, 0.16);
}

function drawJets(ctx: CanvasRenderingContext2D, color: string, throttle: number, z: number, charge: number, time: number) {
  const len = 0.35 + Math.max(0, throttle) * 1.15 + (z > 0 ? 1.1 : 0) + charge * 0.7;
  const flicker = 0.75 + Math.sin(time * 32) * 0.25;
  for (const side of [-1, 1]) {
    const y = side * 0.38;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(-2.05, y, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.55 * flicker;
    ctx.beginPath();
    ctx.moveTo(-2.02, y - 0.16);
    ctx.lineTo(-2.02, y + 0.16);
    ctx.lineTo(-2.05 - len * flicker, y + Math.sin(time * 40 + side) * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#fff8e8";
    ctx.beginPath();
    ctx.moveTo(-2.02, y - 0.06);
    ctx.lineTo(-2.02, y + 0.06);
    ctx.lineTo(-2.05 - len * 0.45 * flicker, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

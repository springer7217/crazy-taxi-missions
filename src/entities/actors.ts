import type { City } from "../map/city.ts";
import type { Quality } from "../game/types.ts";

export type VehicleKind = "sedan" | "suv" | "van" | "bus" | "cab";

type Mover = {
  p: number[];
  seg: number;
  along: number;
  dir: number;
  speed: number;
  x: number;
  y: number;
  heading: number;
};

export type TrafficCar = {
  edge: number;
  seg: number;
  along: number;
  speed: number;
  cruise: number;
  x: number;
  y: number;
  heading: number;
  kind: VehicleKind;
  color: string;
  halfL: number;
  halfW: number;
  near: number;
  hit: number;
  seen: number;
  jam: boolean;
};

export type Ped = Mover & { look: number; side: number; near: number; scare: number; sx: number; sy: number };
export type Cop = { x: number; y: number; heading: number; vx: number; vy: number };

type DriveEdge = {
  p: number[];
  c: number;
  lane: number;
  to: number;
  rev: number;
};

const BODY: Record<VehicleKind, { L: number; W: number; cruise: number }> = {
  sedan: { L: 1.75, W: 0.82, cruise: 11 },
  suv: { L: 2.05, W: 0.96, cruise: 10 },
  van: { L: 2.4, W: 1.05, cruise: 8.5 },
  bus: { L: 5.5, W: 1.28, cruise: 7.2 },
  cab: { L: 1.8, W: 0.84, cruise: 12.5 },
};

const SEDAN = ["#d64545", "#3c7dff", "#f2f4f7", "#2f9e6b", "#8d6a4a", "#6b7c93"];
const SUV = ["#1e2a38", "#5c3d2e", "#24362c", "#3a3f46", "#16324f"];
const VAN = ["#f4f1ea", "#c4552a", "#2c4f86", "#d9d3c6", "#3e4650"];

const LOOKS = [
  { body: "#e23d4a", legs: "#1c1e24", hat: 1 },
  { body: "#f0c14a", legs: "#2a3340", hat: 0 },
  { body: "#3d7eff", legs: "#141820", hat: 0 },
  { body: "#2fbf7a", legs: "#243028", hat: 0 },
  { body: "#ff7a3c", legs: "#2a211c", hat: 1 },
  { body: "#d7dee6", legs: "#20242c", hat: 0 },
];

function angNorm(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function nodeKey(x: number, y: number) {
  return `${Math.round(x / 16)}:${Math.round(y / 16)}`;
}

function reversePts(p: number[]) {
  const out: number[] = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby || 1;
  let t = ((px - ax) * abx + (py - ay) * aby) / ab2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return dx * dx + dy * dy;
}

function nearLine(x: number, y: number, line: number[], max2: number) {
  for (let i = 2; i < line.length; i += 2) {
    if (segDist(x, y, line[i - 2], line[i - 1], line[i], line[i + 1]) < max2) return true;
  }
  return false;
}

function place(m: Mover) {
  const n = m.p.length / 2;
  const i = Math.max(0, Math.min(n - 2, m.seg));
  const ax = m.p[i * 2];
  const ay = m.p[i * 2 + 1];
  const bx = m.p[(i + 1) * 2];
  const by = m.p[(i + 1) * 2 + 1];
  m.x = ax + (bx - ax) * m.along;
  m.y = ay + (by - ay) * m.along;
  m.heading = Math.atan2((by - ay) * m.dir, (bx - ax) * m.dir);
}

function advance(m: Mover, dist: number) {
  let left = dist;
  let guard = 0;
  const n = m.p.length / 2;
  while (left > 0 && guard++ < 8) {
    const i = m.seg;
    const ax = m.p[i * 2];
    const ay = m.p[i * 2 + 1];
    const bx = m.p[(i + 1) * 2];
    const by = m.p[(i + 1) * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay) || 0.001;
    const room = m.dir > 0 ? (1 - m.along) * len : m.along * len;
    if (left < room) {
      m.along += m.dir * (left / len);
      left = 0;
    } else {
      left -= room;
      if (m.dir > 0) {
        if (i >= n - 2) {
          m.dir = -1;
          m.along = 1;
        } else {
          m.seg++;
          m.along = 0;
        }
      } else if (i <= 0) {
        m.dir = 1;
        m.along = 0;
      } else {
        m.seg--;
        m.along = 1;
      }
    }
  }
  place(m);
}

function pickKind(i: number): VehicleKind {
  const r = i % 10;
  if (r === 0) return "bus";
  if (r === 1 || r === 2) return "cab";
  if (r === 3 || r === 4) return "suv";
  if (r === 5) return "van";
  return "sedan";
}

function paintOf(kind: VehicleKind, i: number) {
  if (kind === "cab") return "#f0c414";
  if (kind === "bus") return "#f3f5f7";
  if (kind === "van") return VAN[i % VAN.length];
  if (kind === "suv") return SUV[i % SUV.length];
  return SEDAN[i % SEDAN.length];
}

export class Actors {
  cars: TrafficCar[] = [];
  peds: Ped[] = [];
  cops: Cop[] = [];
  private edges: DriveEdge[] = [];
  private out: number[][] = [];
  private anchor = { x: 2300, y: 1500 };

  spawn(city: City, quality: Quality) {
    this.buildNet(city);
    const bean = city.landmark("bean");
    this.anchor = { x: bean.x, y: bean.y };
    this.cars = [];
    this.peds = [];
    this.seedJams(city, quality);
    const moving = quality === "high" ? 108 : 40;
    for (let i = 0; i < moving; i++) {
      const kind = pickKind(i);
      const body = BODY[kind];
      const car = this.blank(kind, paintOf(kind, i), body.L, body.W, body.cruise * (0.82 + (i % 5) * 0.06));
      if (this.reseat(car, bean.x, bean.y, 30 + (i % 7) * 18)) this.cars.push(car);
    }
    const routes = city.routes(4, 90);
    const pedN = quality === "high" ? 26 : 10;
    for (let i = 0; i < pedN; i++) {
      const road = routes[Math.floor(Math.random() * routes.length)];
      if (!road) break;
      const ped: Ped = {
        p: road.p,
        seg: Math.floor(Math.random() * Math.max(1, road.p.length / 2 - 1)),
        along: Math.random(),
        dir: Math.random() < 0.5 ? -1 : 1,
        speed: 1.1 + Math.random() * 0.6,
        x: 0,
        y: 0,
        heading: 0,
        look: i % LOOKS.length,
        side: (i % 2 === 0 ? 1 : -1) * (5.4 + (road.c % 3)),
        near: 0,
        scare: 0,
        sx: 0,
        sy: 0,
      };
      place(ped);
      this.peds.push(ped);
    }
  }

  clearCops() {
    this.cops = [];
  }

  spawnCop(x: number, y: number, heading: number) {
    if (this.cops.length >= 2) return;
    this.cops.push({ x, y, heading, vx: 0, vy: 0 });
  }

  update(dt: number, playerX: number, playerY: number, chaos: number) {
    this.anchor.x = playerX;
    this.anchor.y = playerY;
    for (const car of this.cars) {
      car.near = Math.max(0, car.near - dt);
      car.hit = Math.max(0, car.hit - dt);
      if (car.jam) continue;
      const far = (car.x - playerX) ** 2 + (car.y - playerY) ** 2;
      if (far > 300 * 300) {
        this.reseat(car, playerX, playerY, 90);
        continue;
      }
      const pace = this.crowded(car) ? car.cruise * 0.22 : car.cruise;
      this.roll(car, pace * dt);
    }
    for (const ped of this.peds) {
      ped.near = Math.max(0, ped.near - dt);
      if (ped.scare > 0) {
        ped.scare -= dt;
        ped.x += ped.sx * dt;
        ped.y += ped.sy * dt;
      } else advance(ped, ped.speed * dt);
    }
    const speed = 24 + chaos * 0.1;
    for (const cop of this.cops) {
      const dx = playerX - cop.x;
      const dy = playerY - cop.y;
      const want = Math.atan2(dy, dx);
      const diff = angNorm(want - cop.heading);
      cop.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
      cop.x += Math.cos(cop.heading) * speed * dt;
      cop.y += Math.sin(cop.heading) * speed * dt;
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    time: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    detail: boolean,
  ) {
    for (const ped of this.peds) {
      const ox = Math.cos(ped.heading + Math.PI / 2) * ped.side;
      const oy = Math.sin(ped.heading + Math.PI / 2) * ped.side;
      const x = ped.x + ox;
      const y = ped.y + oy;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      drawPed(ctx, x, y, ped.heading, ped.look, ped.scare > 0);
    }
    for (const car of this.cars) {
      if (car.x < minX - 12 || car.x > maxX + 12 || car.y < minY - 12 || car.y > maxY + 12) continue;
      drawVehicle(ctx, car, detail);
    }
    for (const cop of this.cops) {
      if (cop.x < minX || cop.x > maxX || cop.y < minY || cop.y > maxY) continue;
      drawVehicle(
        ctx,
        {
          x: cop.x,
          y: cop.y,
          heading: cop.heading,
          kind: "suv",
          color: "#141820",
          halfL: 2.1,
          halfW: 1,
        },
        detail,
      );
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.rotate(cop.heading);
      ctx.fillStyle = Math.sin(time * 18) > 0 ? "#ff3b4e" : "#3aa0ff";
      ctx.fillRect(0.2, -0.55, 0.55, 0.22);
      ctx.fillStyle = Math.sin(time * 18) > 0 ? "#3aa0ff" : "#ff3b4e";
      ctx.fillRect(0.2, 0.33, 0.55, 0.22);
      ctx.restore();
    }
  }

  private blank(kind: VehicleKind, color: string, halfL: number, halfW: number, cruise: number): TrafficCar {
    return {
      edge: 0,
      seg: 0,
      along: 0,
      speed: cruise,
      cruise,
      x: 0,
      y: 0,
      heading: 0,
      kind,
      color,
      halfL,
      halfW,
      near: 0,
      hit: 0,
      seen: 0,
      jam: false,
    };
  }

  private buildNet(city: City) {
    const ids = new Map<string, number>();
    const idOf = (x: number, y: number) => {
      const k = nodeKey(x, y);
      let id = ids.get(k);
      if (id === undefined) {
        id = ids.size;
        ids.set(k, id);
      }
      return id;
    };
    const edges: DriveEdge[] = [];
    const out: number[][] = [];
    const pushOut = (node: number, edge: number) => {
      if (!out[node]) out[node] = [];
      out[node].push(edge);
    };
    for (const road of city.routes(3, 36)) {
      const n = road.p.length / 2;
      if (n < 2) continue;
      const lane = road.c <= 0 ? 4.1 : road.c === 1 ? 3.3 : 2.35;
      const forward = road.p;
      const back = reversePts(road.p);
      const a = idOf(forward[0], forward[1]);
      const b = idOf(forward[forward.length - 2], forward[forward.length - 1]);
      const i0 = edges.length;
      edges.push({ p: forward, c: road.c, lane, to: b, rev: i0 + 1 });
      edges.push({ p: back, c: road.c, lane, to: a, rev: i0 });
      pushOut(a, i0);
      pushOut(b, i0 + 1);
    }
    this.edges = edges;
    this.out = out;
  }

  private seedJams(city: City, quality: Quality) {
    const lines = city.riverLines();
    if (!lines.length || !this.edges.length) return;
    const ranked: { edge: number; score: number }[] = [];
    for (let i = 0; i < this.edges.length; i += 2) {
      const edge = this.edges[i];
      if (edge.c > 1) continue;
      let score = 0;
      const step = Math.max(2, Math.floor(edge.p.length / 8));
      for (let p = 0; p < edge.p.length; p += step * 2) {
        for (const line of lines) {
          if (nearLine(edge.p[p], edge.p[p + 1], line, 32 * 32)) {
            score++;
            break;
          }
        }
      }
      if (score >= 2) ranked.push({ edge: i, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    const linesWanted = quality === "high" ? 2 : 1;
    const perLine = quality === "high" ? 8 : 5;
    for (let n = 0; n < linesWanted && n < ranked.length; n++) {
      const edge = this.edges[ranked[n].edge];
      let dist = 10;
      for (let k = 0; k < perLine; k++) {
        const spot = walkEdge(edge.p, dist);
        if (!spot) break;
        const kind: VehicleKind = k % 5 === 0 ? "bus" : k % 2 === 0 ? "cab" : "sedan";
        const body = BODY[kind];
        const car = this.blank(kind, paintOf(kind, n * 8 + k), body.L, body.W, 0);
        car.jam = true;
        car.edge = ranked[n].edge;
        car.x = spot.x + -Math.sin(spot.heading) * edge.lane;
        car.y = spot.y + Math.cos(spot.heading) * edge.lane;
        car.heading = spot.heading;
        this.cars.push(car);
        dist += kind === "bus" ? 13 : 8.2;
      }
    }
  }

  private reseat(car: TrafficCar, x: number, y: number, minR: number) {
    if (!this.edges.length) return false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const edge = Math.floor(Math.random() * this.edges.length);
      const p = this.edges[edge].p;
      const seg = Math.floor(Math.random() * Math.max(1, p.length / 2 - 1));
      car.edge = edge;
      car.seg = seg;
      car.along = Math.random();
      this.placeCar(car);
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < minR || d > 230) continue;
      let blocked = false;
      for (const other of this.cars) {
        if (other === car) continue;
        if ((other.x - car.x) ** 2 + (other.y - car.y) ** 2 < 64) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return true;
    }
    return false;
  }

  private crowded(car: TrafficCar) {
    const fx = Math.cos(car.heading);
    const fy = Math.sin(car.heading);
    const reach = car.halfL + 7;
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      const ahead = dx * fx + dy * fy;
      if (ahead < car.halfL || ahead > reach) continue;
      const side = Math.abs(dx * -fy + dy * fx);
      if (side < car.halfW + other.halfW + 0.35) return true;
    }
    return false;
  }

  private roll(car: TrafficCar, dist: number) {
    let left = dist;
    let guard = 0;
    while (left > 0 && guard++ < 5) {
      const p = this.edges[car.edge]?.p;
      if (!p) return;
      const n = p.length / 2;
      if (car.seg >= n - 1) {
        this.turn(car);
        continue;
      }
      const i = car.seg;
      const ax = p[i * 2];
      const ay = p[i * 2 + 1];
      const bx = p[(i + 1) * 2];
      const by = p[(i + 1) * 2 + 1];
      const len = Math.hypot(bx - ax, by - ay) || 0.001;
      const room = (1 - car.along) * len;
      if (left < room) {
        car.along += left / len;
        left = 0;
      } else {
        left -= room;
        car.seg += 1;
        car.along = 0;
        if (car.seg >= n - 1) this.turn(car);
      }
    }
    this.placeCar(car);
  }

  private turn(car: TrafficCar) {
    const edge = this.edges[car.edge];
    if (!edge) return;
    const p = edge.p;
    const n = p.length / 2;
    const heading = Math.atan2(p[(n - 1) * 2 + 1] - p[(n - 2) * 2 + 1], p[(n - 1) * 2] - p[(n - 2) * 2]);
    car.edge = this.pick(edge, heading);
    car.seg = 0;
    car.along = 0;
  }

  private pick(edge: DriveEdge, heading: number) {
    const outs = this.out[edge.to] ?? [];
    let best = edge.rev;
    let bestTurn = 4;
    const pool: number[] = [];
    for (const id of outs) {
      if (id === edge.rev) continue;
      const next = this.edges[id];
      if (!next || next.p.length < 4) continue;
      const h = Math.atan2(next.p[3] - next.p[1], next.p[2] - next.p[0]);
      const turn = Math.abs(angNorm(h - heading));
      pool.push(id);
      if (turn < bestTurn) {
        bestTurn = turn;
        best = id;
      }
    }
    if (!pool.length) return edge.rev;
    if (Math.random() < 0.74) return best;
    return pool[Math.floor(Math.random() * pool.length)] ?? best;
  }

  private placeCar(car: TrafficCar) {
    const edge = this.edges[car.edge];
    if (!edge) return;
    const p = edge.p;
    const n = p.length / 2;
    const i = Math.max(0, Math.min(n - 2, car.seg));
    const ax = p[i * 2];
    const ay = p[i * 2 + 1];
    const bx = p[(i + 1) * 2];
    const by = p[(i + 1) * 2 + 1];
    const h = Math.atan2(by - ay, bx - ax);
    const t = car.along;
    const cx = ax + (bx - ax) * t;
    const cy = ay + (by - ay) * t;
    car.heading = h;
    car.x = cx + -Math.sin(h) * edge.lane;
    car.y = cy + Math.cos(h) * edge.lane;
  }
}

function walkEdge(p: number[], dist: number) {
  let left = dist;
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2];
    const ay = p[i - 1];
    const bx = p[i];
    const by = p[i + 1];
    const len = Math.hypot(bx - ax, by - ay) || 0.001;
    if (left <= len) {
      const t = left / len;
      return {
        x: ax + (bx - ax) * t,
        y: ay + (by - ay) * t,
        heading: Math.atan2(by - ay, bx - ax),
      };
    }
    left -= len;
  }
  return null;
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  car: { x: number; y: number; heading: number; kind: VehicleKind; color: string; halfL: number; halfW: number },
  detail: boolean,
) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.heading);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0.35, 0.35, car.halfL * 0.92, car.halfW * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  if (car.kind === "bus") drawBus(ctx, detail);
  else if (car.kind === "van") drawVan(ctx, car.color, detail);
  else if (car.kind === "suv") drawSuv(ctx, car.color, detail);
  else if (car.kind === "cab") drawCab(ctx, detail);
  else drawSedan(ctx, car.color, detail);
  ctx.restore();
}

function wheels(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number) {
  ctx.fillStyle = "#14161a";
  ctx.fillRect(x0, -y - 0.16, 0.42, 0.28);
  ctx.fillRect(x0, y - 0.08, 0.42, 0.28);
  ctx.fillRect(x1, -y - 0.16, 0.42, 0.28);
  ctx.fillRect(x1, y - 0.08, 0.42, 0.28);
}

function drawSedan(ctx: CanvasRenderingContext2D, color: string, detail: boolean) {
  if (detail) wheels(ctx, 0.85, -1.15, 0.62);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(1.75, 0);
  ctx.lineTo(1.15, 0.72);
  ctx.lineTo(-1.35, 0.74);
  ctx.lineTo(-1.7, 0.32);
  ctx.lineTo(-1.7, -0.32);
  ctx.lineTo(-1.35, -0.74);
  ctx.lineTo(1.15, -0.72);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(186,214,230,0.72)";
  ctx.beginPath();
  ctx.ellipse(0.25, 0, 0.55, 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  if (detail) {
    ctx.fillStyle = "#fff6d8";
    ctx.fillRect(1.48, -0.42, 0.16, 0.18);
    ctx.fillRect(1.48, 0.24, 0.16, 0.18);
  }
}

function drawSuv(ctx: CanvasRenderingContext2D, color: string, detail: boolean) {
  if (detail) wheels(ctx, 1.05, -1.35, 0.78);
  ctx.fillStyle = color;
  ctx.fillRect(-1.85, -0.9, 3.7, 1.8);
  ctx.fillStyle = "#0e1218";
  ctx.fillRect(-0.2, -0.72, 1.35, 1.44);
  ctx.fillStyle = "rgba(186,214,230,0.45)";
  ctx.fillRect(-0.1, -0.62, 1.15, 1.24);
  if (detail) {
    ctx.fillStyle = color;
    ctx.fillRect(-1.7, -0.7, 0.7, 0.18);
    ctx.fillRect(-1.7, 0.52, 0.7, 0.18);
  }
}

function drawVan(ctx: CanvasRenderingContext2D, color: string, detail: boolean) {
  if (detail) wheels(ctx, 1.15, -1.55, 0.88);
  ctx.fillStyle = color;
  ctx.fillRect(-2.15, -0.98, 4.3, 1.96);
  ctx.fillStyle = "#10141a";
  ctx.fillRect(0.55, -0.78, 1.15, 1.56);
  ctx.fillStyle = "rgba(186,214,230,0.4)";
  ctx.fillRect(0.68, -0.62, 0.9, 1.24);
  if (detail) {
    ctx.strokeStyle = "rgba(20,24,30,0.35)";
    ctx.lineWidth = 0.06;
    ctx.strokeRect(-2.05, -0.88, 2.2, 1.76);
  }
}

function drawCab(ctx: CanvasRenderingContext2D, detail: boolean) {
  drawSedan(ctx, "#f0c414", detail);
  ctx.fillStyle = "#1a1c20";
  ctx.fillRect(-0.15, -0.22, 0.7, 0.44);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0.02, -0.1, 0.36, 0.2);
  if (detail) {
    ctx.fillStyle = "#1a1c20";
    ctx.fillRect(-1.5, -0.82, 2.6, 0.1);
    ctx.fillRect(-1.5, 0.72, 2.6, 0.1);
  }
}

function drawBus(ctx: CanvasRenderingContext2D, detail: boolean) {
  if (detail) {
    wheels(ctx, 3.3, -3.6, 1.15);
    wheels(ctx, 1.1, 1.1, 1.15);
  }
  ctx.fillStyle = "#f4f6f8";
  ctx.fillRect(-5.15, -1.22, 10.3, 2.44);
  ctx.fillStyle = "#c42334";
  ctx.fillRect(-5.15, 0.72, 10.3, 0.42);
  ctx.fillStyle = "#102033";
  ctx.fillRect(3.55, -0.95, 1.15, 1.7);
  if (detail) {
    ctx.fillStyle = "rgba(170,205,222,0.8)";
    for (let i = 0; i < 5; i++) ctx.fillRect(-2.7 + i * 1.15, -0.85, 0.85, 1.15);
  } else {
    ctx.fillStyle = "rgba(170,205,222,0.75)";
    ctx.fillRect(-2.8, -0.85, 5.6, 1.15);
  }
}

function drawPed(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, look: number, scared: boolean) {
  const style = LOOKS[look % LOOKS.length];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 0.15, 0.55, 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.legs;
  ctx.fillRect(-0.18, -0.15, 0.14, 0.55);
  ctx.fillRect(0.06, -0.15, 0.14, 0.55);
  ctx.fillStyle = style.body;
  ctx.fillRect(-0.38, -0.85, 0.76, 0.78);
  ctx.fillStyle = "#e6c2a2";
  ctx.beginPath();
  ctx.arc(0, -1.05, 0.28, 0, Math.PI * 2);
  ctx.fill();
  if (style.hat) {
    ctx.fillStyle = "#222";
    ctx.fillRect(-0.32, -1.38, 0.64, 0.12);
    ctx.fillRect(-0.16, -1.55, 0.32, 0.2);
  }
  if (look % 6 === 5) {
    ctx.strokeStyle = "#27465f";
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.arc(0.15, -1.55, 0.45, Math.PI, 0);
    ctx.stroke();
  }
  if (scared) {
    ctx.fillStyle = "#fff";
    ctx.font = "700 0.7px Oswald, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("!", 0, -1.9);
  }
  ctx.restore();
}

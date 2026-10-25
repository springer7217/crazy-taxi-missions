import type { Quality } from "../game/types.ts";
import { hash01 } from "../game/util.ts";
import {
  LAKE_DAY,
  LAKE_NIGHT,
  LAND_DAY,
  LAND_NIGHT,
  MARK_DAY,
  MARK_NIGHT,
  PARK_DAY,
  PARK_NIGHT,
  PIER_DAY,
  PIER_NIGHT,
  RIVER_DAY,
  RIVER_NIGHT,
  ROAD_DAY,
  ROAD_NIGHT,
  WALK_DAY,
  WALK_NIGHT,
  mix,
} from "../game/palette.ts";

export type LoopMap = {
  attribution: string;
  width: number;
  height: number;
  landmarks: { id: string; name: string; x: number; y: number; levels: number }[];
  props: { id: string; x: number; y: number }[];
  roads: { c: number; p: number[] }[];
  buildings: { l: number; p: number[] }[];
  water: { k: number; p: number[] }[];
  parks: { p: number[] }[];
  piers: { p: number[] }[];
};

type Bld = {
  p: number[];
  l: number;
  clearH: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  mark?: string;
};

type Road = {
  c: number;
  p: number[];
  len: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type Poly = { p: number[]; minX: number; minY: number; maxX: number; maxY: number; k?: number };

export type Contact = { nx: number; ny: number; pen: number };

const ROAD_W = [20, 17, 14.5, 12, 10, 8.2];

/** Visual extrusion in meters. Gameplay clearance is separate and taller. */
export function extrudeMeters(levels: number) {
  return Math.min(15, Math.pow(Math.max(1, levels), 0.62) * 0.72);
}

function bounds(p: number[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let sx = 0;
  let sy = 0;
  const n = p.length / 2;
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i];
    const y = p[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    sx += x;
    sy += y;
  }
  return { minX, minY, maxX, maxY, cx: sx / n, cy: sy / n };
}

function trace(ctx: CanvasRenderingContext2D, p: number[], oy = 0) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1] + oy);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1] + oy);
  ctx.closePath();
}

function polyLen(p: number[]) {
  let s = 0;
  for (let i = 2; i < p.length; i += 2) s += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return s;
}

export class City {
  width = 4000;
  height = 3000;
  attribution = "© OpenStreetMap contributors";
  landmarks: LoopMap["landmarks"] = [];
  props: LoopMap["props"] = [];
  private buildings: Bld[] = [];
  private roads: Road[] = [];
  private water: Poly[] = [];
  private parks: Poly[] = [];
  private piers: Poly[] = [];
  private lamps: { x: number; y: number }[] = [];
  private grid = new Map<number, Bld[]>();
  private readonly cell = 96;

  load(data: LoopMap) {
    this.width = data.width;
    this.height = data.height;
    this.attribution = data.attribution || this.attribution;
    this.landmarks = data.landmarks;
    this.props = data.props ?? [];
    this.buildings = data.buildings.map((b) => {
      const box = bounds(b.p);
      return {
        p: b.p,
        l: b.l,
        clearH: Math.min(50, Math.max(2.2, b.l * 1.05)),
        ...box,
      };
    });
    for (const lm of this.landmarks) {
      if (!lm.levels) continue;
      let best: Bld | null = null;
      let bestD = 120 * 120;
      for (const b of this.buildings) {
        const d = (b.cx - lm.x) ** 2 + (b.cy - lm.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) {
        best.l = Math.max(best.l, lm.levels);
        best.clearH = Math.min(50, Math.max(2.2, best.l * 1.05));
        best.mark = lm.id;
      }
    }
    this.roads = data.roads.map((r) => {
      const box = bounds(r.p);
      return { c: r.c, p: r.p, len: polyLen(r.p), ...box };
    });
    const pack = (list: { p: number[]; k?: number }[]) =>
      list.map((w) => {
        const box = bounds(w.p);
        return { p: w.p, k: w.k, ...box };
      });
    this.water = pack(data.water);
    this.parks = pack(data.parks);
    this.piers = pack(data.piers);
    this.grid.clear();
    for (const b of this.buildings) this.insert(b);
    this.lamps = [];
    for (const road of this.roads) {
      if (road.c > 3 || road.len < 40) continue;
      let acc = 18;
      for (let i = 2; i < road.p.length; i += 2) {
        const ax = road.p[i - 2];
        const ay = road.p[i - 1];
        const bx = road.p[i];
        const by = road.p[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 1) continue;
        while (acc < len) {
          const t = acc / len;
          this.lamps.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
          acc += 48;
        }
        acc -= len;
      }
    }
  }

  private key(ix: number, iy: number) {
    return ix * 73856093 + iy * 19349663;
  }

  private insert(b: Bld) {
    const x0 = Math.floor(b.minX / this.cell);
    const y0 = Math.floor(b.minY / this.cell);
    const x1 = Math.floor(b.maxX / this.cell);
    const y1 = Math.floor(b.maxY / this.cell);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const k = this.key(x, y);
        let bucket = this.grid.get(k);
        if (!bucket) this.grid.set(k, (bucket = []));
        bucket.push(b);
      }
    }
  }

  private query(minX: number, minY: number, maxX: number, maxY: number, out: Bld[]) {
    const seen = new Set<Bld>();
    const x0 = Math.floor(minX / this.cell);
    const y0 = Math.floor(minY / this.cell);
    const x1 = Math.floor(maxX / this.cell);
    const y1 = Math.floor(maxY / this.cell);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const bucket = this.grid.get(this.key(x, y));
        if (!bucket) continue;
        for (const item of bucket) {
          if (seen.has(item)) continue;
          seen.add(item);
          if (item.maxX < minX || item.minX > maxX || item.maxY < minY || item.minY > maxY) continue;
          out.push(item);
        }
      }
    }
  }

  landmark(id: string) {
    return this.landmarks.find((l) => l.id === id) ?? this.landmarks[0];
  }

  prop(id: string) {
    return this.props.find((p) => p.id === id);
  }

  routes(maxClass = 4, minLen = 80) {
    return this.roads.filter((r) => r.c <= maxClass && r.len >= minLen);
  }

  /** River and canal centerlines (k = 2). Wacker and the bridges sit on these. */
  riverLines() {
    const lines: number[][] = [];
    for (const w of this.water) if (w.k === 2 && w.p.length >= 4) lines.push(w.p);
    return lines;
  }

  nearestRoad(x: number, y: number) {
    let best = Infinity;
    let bx = x;
    let by = y;
    let tx = 1;
    let ty = 0;
    for (const road of this.roads) {
      if (x < road.minX - 80 || x > road.maxX + 80 || y < road.minY - 80 || y > road.maxY + 80) continue;
      for (let i = 2; i < road.p.length; i += 2) {
        const ax = road.p[i - 2];
        const ay = road.p[i - 1];
        const bx2 = road.p[i];
        const by2 = road.p[i + 1];
        const abx = bx2 - ax;
        const aby = by2 - ay;
        const ab2 = abx * abx + aby * aby || 1;
        let t = ((x - ax) * abx + (y - ay) * aby) / ab2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const qx = ax + abx * t;
        const qy = ay + aby * t;
        const d = (qx - x) ** 2 + (qy - y) ** 2;
        if (d < best) {
          best = d;
          bx = qx;
          by = qy;
          const len = Math.hypot(abx, aby) || 1;
          tx = abx / len;
          ty = aby / len;
        }
      }
    }
    return { x: bx, y: by, tx, ty };
  }

  shove(x: number, y: number, r: number) {
    for (let n = 0; n < 8; n++) {
      const hit = this.collide(x, y, r, 0);
      if (!hit) break;
      x += hit.nx * (hit.pen + 0.15);
      y += hit.ny * (hit.pen + 0.15);
    }
    return { x, y };
  }

  collide(x: number, y: number, r: number, z: number): Contact | null {
    const found: Bld[] = [];
    this.query(x - r, y - r, x + r, y + r, found);
    let best: Contact | null = null;
    for (const b of found) {
      if (z > b.clearH) continue;
      const hit = circlePoly(x, y, r, b.p);
      if (hit && (!best || hit.pen > best.pen)) best = hit;
    }
    return best;
  }

  waterAt(x: number, y: number) {
    for (const w of this.water) {
      if (w.k === 2) {
        if (x < w.minX - 30 || x > w.maxX + 30 || y < w.minY - 30 || y > w.maxY + 30) continue;
        for (let i = 2; i < w.p.length; i += 2) {
          const ax = w.p[i - 2];
          const ay = w.p[i - 1];
          const bx = w.p[i];
          const by = w.p[i + 1];
          const abx = bx - ax;
          const aby = by - ay;
          const ab2 = abx * abx + aby * aby || 1;
          let t = ((x - ax) * abx + (y - ay) * aby) / ab2;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const dx = x - (ax + abx * t);
          const dy = y - (ay + aby * t);
          if (dx * dx + dy * dy < 18 * 18) return true;
        }
        continue;
      }
      if (x < w.minX || x > w.maxX || y < w.minY || y > w.maxY) continue;
      if (pointIn(x, y, w.p)) return true;
    }
    return false;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    view: { minX: number; minY: number; maxX: number; maxY: number },
    night: number,
    quality: Quality,
    time: number,
    camX: number,
    camY: number,
  ) {
    ctx.fillStyle = mix(LAND_DAY, LAND_NIGHT, night);
    ctx.fillRect(0, 0, this.width, this.height);
    for (const w of this.water) {
      if (w.k === 2) continue;
      if (!overlap(w, view, 40)) continue;
      ctx.fillStyle = w.k === 0 ? mix(LAKE_DAY, LAKE_NIGHT, night) : mix(RIVER_DAY, RIVER_NIGHT, night);
      trace(ctx, w.p);
      ctx.fill();
      if (w.k === 0 && quality === "high") {
        ctx.save();
        ctx.clip();
        ctx.globalAlpha = 0.08 + night * 0.06;
        ctx.fillStyle = "#e9f7ff";
        for (let i = 0; i < 5; i++) {
          const y = ((time * 14 + i * 90) % (this.height + 40)) - 20;
          ctx.fillRect(w.minX, y, w.maxX - w.minX, 1.6);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
    for (const w of this.water) {
      if (w.k !== 2 || !overlap(w, view, 40)) continue;
      ctx.strokeStyle = mix(RIVER_DAY, RIVER_NIGHT, night);
      ctx.lineWidth = 28;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(w.p[0], w.p[1]);
      for (let i = 2; i < w.p.length; i += 2) ctx.lineTo(w.p[i], w.p[i + 1]);
      ctx.stroke();
    }
    ctx.fillStyle = mix(PARK_DAY, PARK_NIGHT, night);
    for (const park of this.parks) {
      if (!overlap(park, view, 20)) continue;
      trace(ctx, park.p);
      ctx.fill();
    }
    ctx.fillStyle = mix(PIER_DAY, PIER_NIGHT, night);
    for (const pier of this.piers) {
      if (!overlap(pier, view, 20)) continue;
      trace(ctx, pier.p);
      ctx.fill();
      ctx.strokeStyle = night > 0.5 ? "rgba(20,16,12,0.35)" : "rgba(120,90,50,0.35)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const road of this.roads) {
      if (!overlap(road, view, 30)) continue;
      const w = ROAD_W[road.c] ?? 8;
      strokeRoad(ctx, road.p, w + 5.5, mix(WALK_DAY, WALK_NIGHT, night));
    }
    for (const road of this.roads) {
      if (!overlap(road, view, 30)) continue;
      const w = ROAD_W[road.c] ?? 8;
      strokeRoad(ctx, road.p, w, mix(ROAD_DAY, ROAD_NIGHT, night));
      if (road.c <= 3) {
        ctx.strokeStyle = night > 0.5 ? "rgba(230,220,190,0.28)" : "rgba(244,236,214,0.55)";
        ctx.lineWidth = 0.28;
        ctx.setLineDash([3.2, 4.4]);
        ctx.beginPath();
        ctx.moveTo(road.p[0], road.p[1]);
        for (let i = 2; i < road.p.length; i += 2) ctx.lineTo(road.p[i], road.p[i + 1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (quality === "high" && night > 0.25) {
      for (const lamp of this.lamps) {
        if (lamp.x < view.minX || lamp.x > view.maxX || lamp.y < view.minY || lamp.y > view.maxY) continue;
        ctx.globalAlpha = 0.1 * night;
        ctx.fillStyle = "#ffc56b";
        ctx.beginPath();
        ctx.arc(lamp.x, lamp.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.85 * night;
        ctx.beginPath();
        ctx.arc(lamp.x, lamp.y, 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    const visible: Bld[] = [];
    this.query(view.minX - 20, view.minY - 10, view.maxX + 20, view.maxY + 24, visible);
    visible.sort((a, b) => a.cy - b.cy);
    for (const b of visible) this.drawBuilding(ctx, b, night, quality, camX, camY);
    this.drawSpecials(ctx, night, time, camX, camY);
  }

  private drawBuilding(ctx: CanvasRenderingContext2D, b: Bld, night: number, quality: Quality, camX: number, camY: number) {
    const h = extrudeMeters(b.l);
    const tint = hash01(b.cx, b.cy);
    const day = b.l > 28 || tint > 0.72 ? [176, 198, 210] : tint > 0.4 ? [198, 168, 150] : [206, 198, 184];
    const nightC: readonly [number, number, number] = b.l > 28 ? [28, 40, 52] : [24, 26, 32];
    const roof = mix(day as [number, number, number], nightC, night);
    if (quality === "low") {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      trace(ctx, b.p, -h * 0.45);
      ctx.fill();
      ctx.fillStyle = roof;
      trace(ctx, b.p, -h);
      ctx.fill();
      return;
    }
    const n = b.p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = b.p[i * 2];
      const ay = b.p[i * 2 + 1];
      const bx = b.p[j * 2];
      const by = b.p[j * 2 + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dy / len;
      const ny = -dx / len;
      const lit = Math.max(0.28, Math.min(0.92, 0.48 + (nx * -0.45 + ny * -0.75) * 0.45));
      const shade = lit * (1 - night * 0.55);
      ctx.fillStyle = `rgba(${(day[0] * shade) | 0},${(day[1] * shade) | 0},${(day[2] * shade) | 0},1)`;
      if (night > 0.45) ctx.fillStyle = `rgba(${(18 + lit * 30) | 0},${(20 + lit * 28) | 0},${(28 + lit * 36) | 0},1)`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx, by - h);
      ctx.lineTo(ax, ay - h);
      ctx.closePath();
      ctx.fill();
      const near = (b.cx - camX) ** 2 + (b.cy - camY) ** 2 < 95 * 95;
      if (night > 0.4 && near && len > 10 && h > 2) {
        drawWindows(ctx, ax, ay, bx, by, h, len, b.cx + b.cy);
      }
    }
    ctx.fillStyle = roof;
    trace(ctx, b.p, -h);
    ctx.fill();
    ctx.strokeStyle = night > 0.5 ? "rgba(180,200,220,0.18)" : "rgba(255,255,255,0.28)";
    ctx.lineWidth = 0.18;
    ctx.stroke();
    if (b.mark === "willis") {
      ctx.strokeStyle = mix(MARK_DAY, MARK_NIGHT, night);
      ctx.lineWidth = 0.28;
      ctx.beginPath();
      ctx.moveTo(b.cx, b.cy - h);
      ctx.lineTo(b.cx, b.cy - h - 6.5);
      ctx.stroke();
    }
    if (b.mark === "tribune") {
      ctx.fillStyle = mix(MARK_DAY, MARK_NIGHT, night);
      for (let i = -2; i <= 2; i++) {
        const ph = 1.2 + (i === 0 ? 1.6 : Math.abs(i) === 1 ? 0.7 : 0.2);
        ctx.fillRect(b.cx + i * 1.5 - 0.18, b.cy - h - ph, 0.36, ph);
      }
    }
  }

  private drawSpecials(ctx: CanvasRenderingContext2D, night: number, time: number, camX: number, camY: number) {
    const bean = this.landmark("bean");
    if (bean) {
      ctx.save();
      ctx.translate(bean.x, bean.y);
      const g = ctx.createRadialGradient(-3.2, -2.4, 1, 0, 0, 12);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.28, night > 0.5 ? "#8ea6b6" : "#e7eef2");
      g.addColorStop(0.6, night > 0.5 ? "#1b2a34" : "#8d9aa3");
      g.addColorStop(1, night > 0.5 ? "#0c141a" : "#5d686f");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 8, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = night > 0.5 ? "#e2b56a" : "#b7d0dc";
      ctx.fillRect(-8, 1.1, 16, 1.3);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(-2.2 + Math.sin(time * 0.8) * 2.4, -2.1, 2.3, 1.05, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const wheel = this.prop("wheel");
    if (wheel) {
      ctx.save();
      ctx.translate(wheel.x, wheel.y);
      ctx.strokeStyle = night > 0.5 ? "#d7f4ff" : "#1b2830";
      ctx.lineWidth = 0.38;
      ctx.beginPath();
      ctx.ellipse(0, 0, 7.2, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      const spin = time * 0.6;
      for (let i = 0; i < 8; i++) {
        const a = spin + (i / 8) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 7.2, Math.sin(a) * 12);
        ctx.stroke();
      }
      ctx.fillStyle = night > 0.5 ? "#9eefff" : "#24343e";
      ctx.beginPath();
      ctx.arc(0, 0, 1.15, 0, Math.PI * 2);
      ctx.fill();
      if (night > 0.4) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#7ee9ff";
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    const union = this.landmark("union");
    if (union) {
      ctx.fillStyle = mix(MARK_DAY, MARK_NIGHT, night);
      for (let i = -5; i <= 5; i++) ctx.fillRect(union.x + i * 2.1 - 0.22, union.y + 8, 0.44, 2.4);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = night > 0.5 ? "rgba(232,238,244,0.9)" : "rgba(18,22,28,0.82)";
    ctx.font = "600 2.1px Oswald, sans-serif";
    ctx.textAlign = "center";
    for (const lm of this.landmarks) {
      if ((lm.x - camX) ** 2 + (lm.y - camY) ** 2 > 240 * 240) continue;
      const y = lm.y - (lm.levels ? extrudeMeters(lm.levels) + 2.2 : 3);
      ctx.fillText(lm.name, lm.x, y);
    }
  }

  drawMinimapBase(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = "rgba(8,12,16,0.78)";
    ctx.fillRect(x, y, w, h);
    const sx = (wx: number) => x + 6 + (wx / this.width) * (w - 12);
    const sy = (wy: number) => y + 6 + (wy / this.height) * (h - 12);
    ctx.strokeStyle = "rgba(150,170,186,0.45)";
    ctx.lineWidth = 1;
    for (const road of this.roads) {
      if (road.c > 2) continue;
      ctx.beginPath();
      ctx.moveTo(sx(road.p[0]), sy(road.p[1]));
      for (let i = 2; i < road.p.length; i += 8) ctx.lineTo(sx(road.p[i]), sy(road.p[i + 1]));
      ctx.stroke();
    }
    const lake = this.water.find((w) => w.k === 0);
    if (lake) {
      ctx.fillStyle = "rgba(70,150,190,0.45)";
      ctx.beginPath();
      ctx.moveTo(sx(lake.p[0]), sy(lake.p[1]));
      for (let i = 2; i < lake.p.length; i += 2) ctx.lineTo(sx(lake.p[i]), sy(lake.p[i + 1]));
      ctx.fill();
    }
    ctx.restore();
    return { sx, sy };
  }
}

function strokeRoad(ctx: CanvasRenderingContext2D, p: number[], width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.stroke();
}

function drawWindows(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  h: number,
  len: number,
  seed: number,
) {
  const cols = Math.min(7, Math.max(2, Math.floor(len / 4)));
  const rows = Math.min(5, Math.max(1, Math.floor(h / 1.8)));
  const s = Math.abs(Math.floor(seed));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((s + r * 5 + c * 3) % 4 === 0) continue;
      const u = (c + 0.5) / cols;
      const v = (r + 0.55) / (rows + 0.4);
      const x = ax + (bx - ax) * u;
      const y = ay + (by - ay) * u - h * (1 - v);
      ctx.fillStyle = (s + c + r) % 3 === 0 ? "rgba(190,220,255,0.75)" : "rgba(255,206,150,0.8)";
      ctx.fillRect(x - 0.32, y - 0.22, 0.64, 0.4);
    }
  }
}

function overlap(b: { minX: number; minY: number; maxX: number; maxY: number }, view: { minX: number; minY: number; maxX: number; maxY: number }, pad: number) {
  return !(b.maxX < view.minX - pad || b.minX > view.maxX + pad || b.maxY < view.minY - pad || b.minY > view.maxY + pad);
}

function pointIn(x: number, y: number, p: number[]) {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2];
    const yi = p[i * 2 + 1];
    const xj = p[j * 2];
    const yj = p[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function circlePoly(x: number, y: number, r: number, p: number[]): Contact | null {
  const n = p.length / 2;
  if (n < 3) return null;
  let inside = false;
  let best = Infinity;
  let qx = x;
  let qy = y;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = p[j * 2];
    const ay = p[j * 2 + 1];
    const bx = p[i * 2];
    const by = p[i * 2 + 1];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay || 1e-9) + ax) inside = !inside;
    const abx = bx - ax;
    const aby = by - ay;
    const ab2 = abx * abx + aby * aby || 1;
    let t = ((x - ax) * abx + (y - ay) * aby) / ab2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    const d2 = (x - cx) ** 2 + (y - cy) ** 2;
    if (d2 < best) {
      best = d2;
      qx = cx;
      qy = cy;
    }
  }
  const d = Math.sqrt(best);
  if (!inside && d >= r) return null;
  let nx = 1;
  let ny = 0;
  if (d > 1e-4) {
    nx = (x - qx) / d;
    ny = (y - qy) / d;
    if (inside) {
      nx = -nx;
      ny = -ny;
    }
  }
  const pen = inside ? d + r + 0.08 : r - d;
  return { nx, ny, pen };
}

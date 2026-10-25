/**
 * Rebuild public/map/loop.json from OpenStreetMap.
 *
 * Downtown Chicago: the Loop, the river, and the lakefront, roughly
 * Roosevelt to the Navy Pier edge and Halsted to the lake.
 * Public Overpass API, no key. Data is © OpenStreetMap contributors (ODbL).
 *
 *   npm run map
 */
import fs from "node:fs";
import path from "node:path";

const SOUTH = 41.864;
const WEST = -87.652;
const NORTH = 41.8965;
const EAST = -87.597;
const BBOX = `${SOUTH},${WEST},${NORTH},${EAST}`;
const LAT0 = (SOUTH + NORTH) / 2;
const M_LAT = 111_320;
const M_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

const QUERY = `
[out:json][timeout:180];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street)$"](${BBOX});
  way["building"](${BBOX})(if:length()>18);
  way["natural"="water"](${BBOX});
  way["water"~"^(river|canal|lake)$"](${BBOX});
  way["waterway"~"^(riverbank|river|canal)$"](${BBOX});
  way["leisure"="park"](${BBOX});
  way["man_made"="pier"](${BBOX});
  relation["natural"="water"](${BBOX});
  relation["waterway"="riverbank"](${BBOX});
);
out geom;
`.trim();

const LANDMARKS = [
  { id: "willis", name: "Willis Tower", lat: 41.878876, lon: -87.635915, levels: 108 },
  { id: "tribune", name: "Tribune Tower", lat: 41.89035, lon: -87.62318, levels: 36 },
  { id: "bean", name: "Millennium Park", lat: 41.882702, lon: -87.623304, levels: 0 },
  { id: "union", name: "Union Station", lat: 41.87868, lon: -87.64045, levels: 10 },
  { id: "pier", name: "Navy Pier", lat: 41.8917, lon: -87.6098, levels: 3 },
  { id: "mart", name: "Merchandise Mart", lat: 41.88834, lon: -87.63538, levels: 25 },
];

const PROPS = [
  { id: "wheel", lat: 41.89205, lon: -87.60755 },
];

const PIER = [
  [41.89155, -87.6144],
  [41.89055, -87.6002],
  [41.89255, -87.5996],
  [41.89315, -87.6136],
];

function project(lat, lon) {
  return [(lon - WEST) * M_LON, (NORTH - lat) * M_LAT];
}

function rdp(points, eps) {
  if (points.length < 3) return points.slice();
  const eps2 = eps * eps;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0;
    let idx = -1;
    const ax = points[a][0];
    const ay = points[a][1];
    const bx = points[b][0];
    const by = points[b][1];
    const abx = bx - ax;
    const aby = by - ay;
    const ab2 = abx * abx + aby * aby || 1;
    for (let i = a + 1; i < b; i++) {
      const px = points[i][0];
      const py = points[i][1];
      const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ab2));
      const dx = px - (ax + abx * t);
      const dy = py - (ay + aby * t);
      const d = dx * dx + dy * dy;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > eps2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function dedupe(points) {
  const out = [];
  for (const p of points) {
    const q = [Math.round(p[0]), Math.round(p[1])];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== q[0] || prev[1] !== q[1]) out.push(q);
  }
  if (out.length > 3) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) out.pop();
  }
  return out;
}

function shoelace(points) {
  let s = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

function lengthOf(points) {
  let s = 0;
  for (let i = 1; i < points.length; i++) {
    s += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return s;
}

function flat(points) {
  const p = [];
  for (const [x, y] of points) p.push(x, y);
  return p;
}

function roadClass(tags) {
  const h = tags.highway || "";
  if (h.startsWith("motorway")) return 0;
  if (h.startsWith("trunk")) return 1;
  if (h.startsWith("primary")) return 2;
  if (h.startsWith("secondary")) return 3;
  if (h.startsWith("tertiary")) return 4;
  return 5;
}

function levelsOf(tags, area, id) {
  const lv = parseFloat(tags["building:levels"] || "");
  if (Number.isFinite(lv) && lv > 0) return Math.max(1, Math.min(110, Math.round(lv)));
  const height = parseFloat(tags.height || "");
  if (Number.isFinite(height) && height > 2) return Math.max(1, Math.min(110, Math.round(height / 3.35)));
  const seed = Math.abs((id || 1) * 17 + Math.round(area)) % 97;
  if (area > 12000) return 14 + (seed % 22);
  if (area > 4000) return 8 + (seed % 14);
  if (area > 1200) return 5 + (seed % 8);
  return 3 + (seed % 5);
}

function geomOf(el) {
  if (!Array.isArray(el.geometry)) return [];
  const pts = [];
  for (const g of el.geometry) {
    if (Number.isFinite(g.lat) && Number.isFinite(g.lon)) pts.push(project(g.lat, g.lon));
  }
  return pts;
}

function near(a, b, tol) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
}

function stitch(ways, tol = 10) {
  const adj = new Map();
  const key = (p) => `${Math.round(p[0] / 4)},${Math.round(p[1] / 4)}`;
  for (let i = 0; i < ways.length; i++) {
    const w = ways[i];
    if (!w || w.length < 2) continue;
    for (const k of [key(w[0]), key(w[w.length - 1])]) {
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k).push(i);
    }
  }
  const used = new Array(ways.length).fill(false);
  const rings = [];
  for (let i = 0; i < ways.length; i++) {
    if (used[i] || !ways[i] || ways[i].length < 2) continue;
    used[i] = true;
    const ring = ways[i].slice();
    let guard = 0;
    while (guard++ < ways.length + 5) {
      if (ring.length > 3 && near(ring[0], ring[ring.length - 1], tol)) break;
      const end = ring[ring.length - 1];
      const cands = adj.get(key(end)) || [];
      let found = -1;
      let flip = false;
      for (const ci of cands) {
        if (used[ci]) continue;
        const w = ways[ci];
        if (near(w[0], end, tol)) {
          found = ci;
          flip = false;
          break;
        }
        if (near(w[w.length - 1], end, tol)) {
          found = ci;
          flip = true;
          break;
        }
      }
      if (found < 0) break;
      used[found] = true;
      const w = flip ? ways[found].slice().reverse() : ways[found];
      ring.push(...w.slice(1));
    }
    rings.push(ring);
  }
  return rings;
}

function clipPoly(points, w, h) {
  const edges = [
    [(p) => p[0] >= 0, (a, b) => [0, a[1] + ((b[1] - a[1]) * (0 - a[0])) / (b[0] - a[0] || 1e-9)]],
    [(p) => p[0] <= w, (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0] || 1e-9)]],
    [(p) => p[1] >= 0, (a, b) => [a[0] + ((b[0] - a[0]) * (0 - a[1])) / (b[1] - a[1] || 1e-9), 0]],
    [(p) => p[1] <= h, (a, b) => [a[0] + ((b[0] - a[0]) * (h - a[1])) / (b[1] - a[1] || 1e-9), h]],
  ];
  let poly = points;
  for (const [inside, intersect] of edges) {
    if (poly.length === 0) return [];
    const out = [];
    let prev = poly[poly.length - 1];
    let prevIn = inside(prev);
    for (const cur of poly) {
      const curIn = inside(cur);
      if (curIn) {
        if (!prevIn) out.push(intersect(prev, cur));
        out.push(cur);
      } else if (prevIn) out.push(intersect(prev, cur));
      prev = cur;
      prevIn = curIn;
    }
    poly = out;
  }
  return poly;
}

function pointInPoly(x, y, flatPts) {
  let inside = false;
  const n = flatPts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flatPts[i * 2];
    const yi = flatPts[i * 2 + 1];
    const xj = flatPts[j * 2];
    const yj = flatPts[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function intersectsMap(points, w, h, margin = 80) {
  for (const p of points) {
    if (p[0] >= -margin && p[0] <= w + margin && p[1] >= -margin && p[1] <= h + margin) return true;
  }
  return false;
}

async function download() {
  const cache = path.resolve("scripts/.cache/osm-loop-raw.json");
  if (fs.existsSync(cache) && fs.statSync(cache).size > 1000) {
    console.log("using cached", cache);
    return JSON.parse(fs.readFileSync(cache, "utf8"));
  }
  // Cloud rebuilds can reuse the extract already fetched this session.
  const tmp = "/tmp/osm-loop-raw.json";
  if (fs.existsSync(tmp) && fs.statSync(tmp).size > 1000) {
    console.log("using cached", tmp);
    return JSON.parse(fs.readFileSync(tmp, "utf8"));
  }
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      console.log("fetching", url);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "skycab-loop-map-preprocessor/1.0",
          Accept: "application/json",
        },
        body: "data=" + encodeURIComponent(QUERY),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 180)}`);
      const json = await res.json();
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      fs.writeFileSync(cache, JSON.stringify(json));
      console.log("elements", json.elements?.length);
      return json;
    } catch (err) {
      lastErr = err;
      console.warn("endpoint failed", url, err.message || err);
    }
  }
  throw lastErr;
}

function memberWays(el, role) {
  const ways = [];
  for (const member of el.members || []) {
    if (role && member.role !== role) continue;
    if (!member.geometry) continue;
    const pts = member.geometry
      .filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lon))
      .map((g) => project(g.lat, g.lon));
    if (pts.length >= 2) ways.push(pts);
  }
  return ways;
}

function clipSegment(a, b, w, h) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const ps = [-dx, dx, -dy, dy];
  const qs = [a[0], w - a[0], a[1], h - a[1]];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(ps[i]) < 1e-9) {
      if (qs[i] < 0) return null;
    } else {
      const t = qs[i] / ps[i];
      if (ps[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  if (t1 < t0) return null;
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

function clipPolyline(points, w, h) {
  const pieces = [];
  let cur = [];
  const push = (pt) => {
    const prev = cur[cur.length - 1];
    if (!prev || Math.hypot(prev[0] - pt[0], prev[1] - pt[1]) > 1.2) cur.push(pt);
  };
  for (let i = 1; i < points.length; i++) {
    const seg = clipSegment(points[i - 1], points[i], w, h);
    if (!seg) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
      continue;
    }
    if (cur.length) {
      const prev = cur[cur.length - 1];
      if (Math.hypot(prev[0] - seg[0][0], prev[1] - seg[0][1]) > 8) {
        pieces.push(cur);
        cur = [];
      }
    }
    push(seg[0]);
    push(seg[1]);
  }
  if (cur.length > 1) pieces.push(cur);
  pieces.sort((a, b) => b.length - a.length);
  return pieces[0] || [];
}

function locateEdge(p, w, h) {
  const d = [
    { e: 0, d: Math.abs(p[1]) },
    { e: 1, d: Math.abs(p[0] - w) },
    { e: 2, d: Math.abs(p[1] - h) },
    { e: 3, d: Math.abs(p[0]) },
  ];
  d.sort((a, b) => a.d - b.d);
  return d[0].e;
}

function walkBoundary(from, to, w, h, dir) {
  const corners = [
    [w, 0],
    [w, h],
    [0, h],
    [0, 0],
  ];
  // Clockwise corner after edge e is corners[e]. Counterclockwise uses the other end.
  const pts = [];
  let edge = locateEdge(from, w, h);
  let guard = 0;
  let cursor = from.slice();
  while (guard++ < 6 && Math.hypot(cursor[0] - to[0], cursor[1] - to[1]) > 2) {
    if (locateEdge(to, w, h) === edge) {
      const same =
        (edge === 0 && dir > 0 && to[0] >= cursor[0] - 0.1) ||
        (edge === 0 && dir < 0 && to[0] <= cursor[0] + 0.1) ||
        (edge === 1 && dir > 0 && to[1] >= cursor[1] - 0.1) ||
        (edge === 1 && dir < 0 && to[1] <= cursor[1] + 0.1) ||
        (edge === 2 && dir > 0 && to[0] <= cursor[0] + 0.1) ||
        (edge === 2 && dir < 0 && to[0] >= cursor[0] - 0.1) ||
        (edge === 3 && dir > 0 && to[1] <= cursor[1] + 0.1) ||
        (edge === 3 && dir < 0 && to[1] >= cursor[1] - 0.1);
      if (same) break;
    }
    const corner = dir > 0 ? corners[edge] : corners[(edge + 3) % 4];
    pts.push(corner.slice());
    cursor = corner;
    edge = (edge + (dir > 0 ? 1 : 3)) % 4;
  }
  return pts;
}

function buildLake(raw, width, height) {
  const el = (raw.elements || []).find((e) => e.type === "relation" && e.tags?.name === "Lake Michigan");
  if (!el) return null;
  const ways = memberWays(el, "outer");
  const rings = stitch(ways, 8);
  let best = null;
  let bestN = 0;
  for (const ring of rings) {
    let n = 0;
    for (const p of ring) {
      if (p[0] >= -400 && p[0] <= width + 400 && p[1] >= -400 && p[1] <= height + 400) n++;
    }
    if (n > bestN) {
      bestN = n;
      best = ring;
    }
  }
  if (!best || bestN < 8) return null;
  let first = -1;
  let last = -1;
  for (let i = 0; i < best.length; i++) {
    const p = best[i];
    if (p[0] >= -500 && p[0] <= width + 500 && p[1] >= -500 && p[1] <= height + 500) {
      if (first < 0) first = i;
      last = i;
    }
  }
  const slice = best.slice(Math.max(0, first - 1), last + 2);
  const shore = clipPolyline(rdp(slice, 10), width, height);
  if (shore.length < 4) return null;
  const end = shore[shore.length - 1];
  const start = shore[0];
  const candidates = [walkBoundary(end, start, width, height, 1), walkBoundary(end, start, width, height, -1)];
  const waterPt = project(41.8755, -87.603);
  const landPt = project(41.878876, -87.635915);
  let chosen = null;
  for (const extra of candidates) {
    const poly = dedupe(shore.concat(extra));
    if (poly.length < 4) continue;
    const flatPts = flat(poly);
    const wet = pointInPoly(waterPt[0], waterPt[1], flatPts);
    const landWet = pointInPoly(landPt[0], landPt[1], flatPts);
    if (wet && !landWet) {
      chosen = { k: 0, p: flatPts, area: shoelace(poly) };
      break;
    }
  }
  return chosen;
}

function asWater(ring, width, height, kind) {
  if (ring.length < 4) return null;
  if (!intersectsMap(ring, width, height, 40)) return null;
  const closed = near(ring[0], ring[ring.length - 1], 18);
  if (!closed && kind !== 2) return null;
  const simplified = rdp(ring, kind === 0 ? 18 : 8);
  const clipped = clipPoly(simplified, width, height);
  const compact = dedupe(rdp(clipped, kind === 0 ? 14 : 6));
  if (compact.length < 3) return null;
  const area = shoelace(compact);
  if (area < 500) return null;
  return { k: kind, p: flat(compact), area };
}

function mainOut(raw) {
  const width = Math.round((EAST - WEST) * M_LON);
  const height = Math.round((NORTH - SOUTH) * M_LAT);
  const roads = [];
  const buildings = [];
  const water = [];
  const parks = [];
  const piers = [];

  for (const el of raw.elements || []) {
    const tags = el.tags || {};
    if (el.type === "relation") {
      const lake = tags.name === "Lake Michigan" || tags.water === "lake";
      const river = tags.water === "river" || tags.waterway === "riverbank";
      const harbor = tags.water === "harbour" || tags.water === "harbor";
      if (!lake && !river && !harbor && tags.natural !== "water") continue;
      const kind = lake ? 0 : 1;
      const rings = stitch(memberWays(el, "outer"), 14);
      for (const ring of rings) {
        const piece = asWater(ring, width, height, kind);
        if (piece && piece.area < width * height * 0.92) water.push(piece);
      }
      continue;
    }
    if (el.type !== "way") continue;
    const pts = geomOf(el);
    if (pts.length < 2) continue;

    if (tags.highway) {
      const c = roadClass(tags);
      const simplified = dedupe(rdp(pts, c <= 2 ? 4 : 7));
      if (simplified.length >= 2 && lengthOf(simplified) > 18) roads.push({ c, p: flat(simplified) });
      continue;
    }
    if (tags.man_made === "pier") {
      const simplified = dedupe(rdp(pts, 6));
      if (simplified.length >= 3 && shoelace(simplified) > 200) piers.push({ p: flat(simplified) });
      continue;
    }
    const line = tags.waterway === "river" || tags.waterway === "canal";
    const isWater =
      tags.natural === "water" ||
      tags.waterway === "riverbank" ||
      tags.water === "river" ||
      tags.water === "canal" ||
      tags.water === "lake" ||
      line;
    if (isWater) {
      if (line && pts.length >= 2 && !near(pts[0], pts[pts.length - 1], 12)) {
        const simplified = dedupe(rdp(pts, 8));
        if (lengthOf(simplified) > 30 && intersectsMap(simplified, width, height, 20)) {
          water.push({ k: 2, p: flat(simplified), area: 0 });
        }
      } else {
        const piece = asWater(pts, width, height, tags.water === "lake" ? 0 : 1);
        if (piece) water.push(piece);
      }
      continue;
    }
    if (tags.leisure === "park") {
      const simplified = dedupe(rdp(pts, 8));
      if (simplified.length >= 3 && shoelace(simplified) > 800) parks.push({ p: flat(simplified) });
      continue;
    }
    if (tags.building) {
      let simplified = dedupe(rdp(pts, 3.2));
      if (simplified.length < 3) continue;
      let area = shoelace(simplified);
      if (area < 90) continue;
      if (simplified.length > 24) {
        simplified = dedupe(rdp(pts, 6));
        if (simplified.length < 3) continue;
        area = shoelace(simplified);
      }
      buildings.push({ l: levelsOf(tags, area, el.id || buildings.length), a: Math.round(area), p: flat(simplified) });
    }
  }

  buildings.sort((a, b) => b.a - a.a);
  const kept = [];
  const seen = new Set();
  for (const b of buildings) {
    const key = b.p.slice(0, 6).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(b);
    if (kept.length >= 2400) break;
  }

  const landmarks = LANDMARKS.map((lm) => {
    const [x, y] = project(lm.lat, lm.lon);
    return { id: lm.id, name: lm.name, x: Math.round(x), y: Math.round(y), levels: lm.levels };
  });

  for (const lm of landmarks) {
    if (!lm.levels) continue;
    let best = null;
    let bestD = 120 * 120;
    for (const b of kept) {
      let sx = 0;
      let sy = 0;
      const n = b.p.length / 2;
      for (let i = 0; i < b.p.length; i += 2) {
        sx += b.p[i];
        sy += b.p[i + 1];
      }
      const d = (sx / n - lm.x) ** 2 + (sy / n - lm.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (best) best.l = Math.max(best.l, lm.levels);
  }
  for (const b of kept) delete b.a;

  piers.push({
    p: flat(PIER.map(([lat, lon]) => project(lat, lon).map((n) => Math.round(n)))),
  });

  const props = PROPS.map((pr) => {
    const [x, y] = project(pr.lat, pr.lon);
    return { id: pr.id, x: Math.round(x), y: Math.round(y) };
  });

  const lake = buildLake(raw, width, height);
  if (lake) water.push(lake);

  const willis = landmarks.find((l) => l.id === "willis");
  const lakeCheck = project(41.8755, -87.603);
  const riverCheck = project(41.8886, -87.624);
  let lakeHits = 0;
  let riverHits = 0;
  let willisWet = false;
  for (const w of water) {
    if (w.k === 2) continue;
    if (pointInPoly(lakeCheck[0], lakeCheck[1], w.p)) lakeHits++;
    if (pointInPoly(riverCheck[0], riverCheck[1], w.p)) riverHits++;
    if (willis && pointInPoly(willis.x, willis.y, w.p)) willisWet = true;
  }

  for (const w of water) delete w.area;

  console.log({
    width,
    height,
    roads: roads.length,
    buildings: kept.length,
    water: water.length,
    lakes: water.filter((w) => w.k === 0).length,
    parks: parks.length,
    piers: piers.length,
    lakeHits,
    riverHits,
    willisWet,
  });
  if (willisWet) console.warn("Willis Tower centroid fell inside a water polygon");

  return {
    attribution: "© OpenStreetMap contributors",
    license: "ODbL",
    source: "OpenStreetMap via the public Overpass API",
    bbox: { south: SOUTH, west: WEST, north: NORTH, east: EAST },
    width,
    height,
    landmarks,
    props,
    roads,
    buildings: kept,
    water,
    parks,
    piers,
  };
}

const raw = await download();
const out = mainOut(raw);
const dest = path.resolve("public/map/loop.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log("wrote", dest, fs.statSync(dest).size);

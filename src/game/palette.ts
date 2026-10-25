import type { TimeMode } from "./types.ts";

export type RGB = readonly [number, number, number];

export const CYCLE = 240;

export function mix(a: RGB, b: RGB, t: number) {
  const r = a[0] + (b[0] - a[0]) * t;
  const g = a[1] + (b[1] - a[1]) * t;
  const bl = a[2] + (b[2] - a[2]) * t;
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

export function nightAmount(elapsed: number, mode: TimeMode) {
  if (mode === "day") return 0.08;
  if (mode === "night") return 0.94;
  const t = (elapsed % CYCLE) / CYCLE;
  if (t < 0.22) return 0.08;
  if (t < 0.36) return 0.08 + ((t - 0.22) / 0.14) * 0.86;
  if (t < 0.74) return 0.94;
  if (t < 0.9) return 0.94 - ((t - 0.74) / 0.16) * 0.86;
  return 0.08;
}

export const SKY_DAY: RGB = [168, 206, 224];
export const SKY_NIGHT: RGB = [5, 8, 14];
export const LAND_DAY: RGB = [214, 206, 194];
export const LAND_NIGHT: RGB = [18, 20, 24];
export const PARK_DAY: RGB = [122, 156, 96];
export const PARK_NIGHT: RGB = [22, 42, 34];
export const LAKE_DAY: RGB = [58, 132, 176];
export const LAKE_NIGHT: RGB = [10, 42, 64];
export const RIVER_DAY: RGB = [46, 122, 138];
export const RIVER_NIGHT: RGB = [8, 48, 58];
export const ROAD_DAY: RGB = [74, 78, 84];
export const ROAD_NIGHT: RGB = [22, 24, 28];
export const WALK_DAY: RGB = [196, 188, 174];
export const WALK_NIGHT: RGB = [38, 36, 34];
export const MARK_DAY: RGB = [232, 226, 214];
export const MARK_NIGHT: RGB = [196, 204, 210];
export const PIER_DAY: RGB = [214, 196, 160];
export const PIER_NIGHT: RGB = [58, 50, 42];

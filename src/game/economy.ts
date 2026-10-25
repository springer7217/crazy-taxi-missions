import type { SaveData, SkinId, ThrusterId } from "./types.ts";

/**
 * Money, in dollars.
 * Base fare is paid on a successful drop, plus $5 per second still on the clock.
 * During the ride, tips go into escrow and are paid with the fare:
 *   jump landing $15, near miss $25, clean drift $20, each times the style combo.
 * Combo climbs when another tip lands within 3.5s (x2, x3, …).
 * Smooth stop (under 10 m/s) adds $20. A leg with no crash adds $40.
 * A fragile VIP leg with zero hard hits adds $100 instead of the $40.
 * Worked First Light example, no combo: 120 + 22*5 + 15 + 25 + 20 + 40 = $330.
 * A second near miss inside the window pays 25 * 2 = $50.
 * Clearing a car in the air pays $20, then $40, $60… for each further car in that same hop.
 * Timeout, VIP walkout, or chaos 100 drops the escrow and charges a penalty.
 * Penalty is $40 + mission index * $15. Wallet never goes below $0.
 * A warden tap fines $75 from the wallet immediately.
 */
export const TIME_PER_SECOND = 5;
export const JUMP_TIP = 15;
export const CLEAR_PAY = 20;
export const NEAR_TIP = 25;
export const DRIFT_TIP = 20;
export const SMOOTH_BONUS = 20;
export const CLEAN_BONUS = 40;
export const VIP_BONUS = 100;
export const COMBO_WINDOW = 3.5;
export const FINE = 75;

export function failPenalty(index: number) {
  return 40 + index * 15;
}

export type ShopKind = "engine" | "handling" | "jump" | "skin" | "thruster";

export type ShopItem = {
  id: string;
  kind: ShopKind;
  name: string;
  blurb: string;
  price: number;
  level?: number;
  skin?: SkinId;
  thruster?: ThrusterId;
};

export const SHOP: ShopItem[] = [
  { id: "engine-2", kind: "engine", level: 2, name: "Engine II", blurb: "Quicker pull. Longer streets.", price: 450 },
  { id: "engine-3", kind: "engine", level: 3, name: "Engine III", blurb: "The fast polite one.", price: 1100 },
  { id: "handling-2", kind: "handling", level: 2, name: "Handling II", blurb: "Holds a drift, then lets it go.", price: 400 },
  { id: "handling-3", kind: "handling", level: 3, name: "Handling III", blurb: "Turns like it means it.", price: 950 },
  { id: "jump-2", kind: "jump", level: 2, name: "Hop II", blurb: "More charge, more air.", price: 500 },
  { id: "jump-3", kind: "jump", level: 3, name: "Hop III", blurb: "Clears the mid-rise roofs.", price: 1200 },
  { id: "skin-matte", kind: "skin", skin: "matte", name: "Matte black", blurb: "Brushed steel, sanded quiet.", price: 700 },
  { id: "skin-gold", kind: "skin", skin: "gold", name: "Night gold", blurb: "A fare you can see from the river.", price: 1600 },
  { id: "thrust-amber", kind: "thruster", thruster: "amber", name: "Amber jets", blurb: "Sodium light, on purpose.", price: 250 },
  { id: "thrust-magenta", kind: "thruster", thruster: "magenta", name: "Magenta jets", blurb: "The lake looks back.", price: 250 },
  { id: "thrust-violet", kind: "thruster", thruster: "violet", name: "Violet jets", blurb: "Soft color, hard landing.", price: 300 },
];

export function tune(save: SaveData) {
  const e = save.engine;
  const h = save.handling;
  const j = save.jump;
  return {
    maxSpeed: 32 + (e - 1) * 6,
    accel: 26 + (e - 1) * 8,
    grip: 5 + (h - 1) * 1.8,
    steer: 1.7 + (h - 1) * 0.34,
    jumpMul: 1 + (j - 1) * 0.2,
  };
}

export function canBuy(save: SaveData, item: ShopItem) {
  if (save.cash < item.price) return false;
  if (item.kind === "engine") return save.engine === (item.level ?? 1) - 1;
  if (item.kind === "handling") return save.handling === (item.level ?? 1) - 1;
  if (item.kind === "jump") return save.jump === (item.level ?? 1) - 1;
  if (item.kind === "skin" && item.skin) return !save.skins.includes(item.skin);
  if (item.kind === "thruster" && item.thruster) return !save.thrusters.includes(item.thruster);
  return false;
}

export function owned(save: SaveData, item: ShopItem) {
  if (item.kind === "engine") return save.engine >= (item.level ?? 1);
  if (item.kind === "handling") return save.handling >= (item.level ?? 1);
  if (item.kind === "jump") return save.jump >= (item.level ?? 1);
  if (item.kind === "skin" && item.skin) return save.skins.includes(item.skin);
  if (item.kind === "thruster" && item.thruster) return save.thrusters.includes(item.thruster);
  return false;
}

import type { Quality, SaveData } from "../game/types.ts";

const KEY = "skycab-loop-save-v1";

function defaultQuality(): Quality {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 8;
  return coarse || cores <= 4 ? "low" : "high";
}

export function freshSave(): SaveData {
  return {
    cash: 0,
    engine: 1,
    handling: 1,
    jump: 1,
    skin: "steel",
    thruster: "cyan",
    skins: ["steel"],
    thrusters: ["cyan"],
    cleared: [],
    voice: false,
    muted: false,
    quality: defaultQuality(),
    timeMode: "cycle",
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...freshSave(), ...parsed, skins: parsed.skins ?? ["steel"], thrusters: parsed.thrusters ?? ["cyan"], cleared: parsed.cleared ?? [] };
  } catch {
    return freshSave();
  }
}

export function writeSave(save: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode and full disks still play */
  }
}

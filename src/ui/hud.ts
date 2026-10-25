import { canBuy, owned, SHOP, type ShopItem } from "../game/economy.ts";
import { money } from "../game/util.ts";
import type { Mission } from "../missions/missions.ts";
import { MISSIONS, unlocked } from "../missions/missions.ts";
import type { Quality, SaveData } from "../game/types.ts";

export type ResultView = {
  success: boolean;
  title: string;
  reason: string;
  lines: { label: string; amount: number }[];
  total: number;
  penalty: number;
  wallet: number;
  note: string;
  nextLabel: string;
};

export function hideBoot() {
  const boot = document.getElementById("boot");
  if (boot) boot.hidden = true;
}

export function bootError(msg: string) {
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.hidden = false;
  boot.textContent = msg;
}

export function show(name: "title" | "brief" | "play" | "pause" | "garage" | "result" | "credits") {
  for (const id of ["title", "brief", "pause", "garage", "result", "credits"]) {
    const el = document.getElementById(`screen-${id}`);
    if (el) el.hidden = id !== name;
  }
  const hud = document.getElementById("hud");
  if (hud) hud.hidden = name !== "play" && name !== "pause";
}

export function setFlags(quality: Quality, pad: boolean) {
  document.body.classList.toggle("q-low", quality === "low");
  document.body.classList.toggle("pad", pad);
}

export function setTouch(on: boolean) {
  const el = document.getElementById("touch");
  if (el) el.hidden = !on;
}

export function setVignette(kind: "none" | "danger" | "heat") {
  const el = document.getElementById("vignette");
  if (!el) return;
  el.classList.toggle("danger", kind === "danger");
  el.classList.toggle("heat", kind === "heat");
}

export function sync(save: SaveData) {
  const labels: [string, string][] = [
    ["mute", save.muted ? "Sound: off" : "Sound: on"],
    ["voice", save.voice ? "Voice: on" : "Voice: off"],
    ["quality", save.quality === "high" ? "Detail: high" : "Detail: low"],
    ["time", save.timeMode === "day" ? "Sky: day" : save.timeMode === "night" ? "Sky: night" : "Sky: cycle"],
  ];
  for (const [act, text] of labels) {
    document.querySelectorAll<HTMLElement>(`[data-act='${act}']`).forEach((b) => {
      b.textContent = text;
    });
  }
  const titleCash = document.getElementById("title-cash");
  if (titleCash) titleCash.textContent = money(save.cash);
  const garageCash = document.getElementById("garage-cash");
  if (garageCash) garageCash.textContent = money(save.cash);
}

export function renderMissions(save: SaveData) {
  const root = document.getElementById("mission-list");
  if (!root) return;
  root.replaceChildren();
  MISSIONS.forEach((mission, index) => {
    const open = unlocked(save.cleared, index);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `mission${open ? "" : " locked"}`;
    btn.disabled = !open;
    if (open) {
      btn.dataset.act = "mission";
      btn.dataset.arg = mission.id;
    }
    const title = document.createElement("strong");
    title.textContent = `${index + 1}. ${mission.title}`;
    const sub = document.createElement("span");
    const cleared = save.cleared.includes(mission.id);
    sub.textContent = open ? (cleared ? `Cleared · ${mission.tagline}` : mission.tagline) : "Clear the previous fare";
    btn.append(title, sub);
    root.append(btn);
  });
  sync(save);
}

export function renderBrief(mission: Mission) {
  text("brief-title", mission.title);
  text("brief-text", mission.briefing);
  const drops = mission.stops.filter((s) => s.kind === "dropoff");
  const fare =
    drops.length > 1
      ? `Bases ${drops.map((s) => money(s.base ?? mission.baseFare)).join(" · ")}`
      : `${money(mission.baseFare)} base`;
  text("brief-meta", `${mission.timeLimit}s on the clock · ${mission.fragile ? "Fragile · " : ""}${fare}`);
}

export function renderResult(view: ResultView) {
  text("result-kicker", view.success ? "Fare banked" : "Fare lost");
  text("result-title", view.title);
  text("result-reason", view.reason);
  const rows = document.getElementById("result-rows");
  if (rows) {
    rows.replaceChildren();
    for (const line of view.lines) {
      if (!line.amount) continue;
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      name.textContent = line.label;
      const amt = document.createElement("b");
      amt.textContent = money(line.amount);
      row.append(name, amt);
      rows.append(row);
    }
    if (view.success) {
      const row = document.createElement("div");
      row.className = "row total";
      const name = document.createElement("span");
      name.textContent = "This shift's fares";
      const amt = document.createElement("b");
      amt.textContent = money(view.total);
      row.append(name, amt);
      rows.append(row);
    }
    if (view.penalty) {
      const row = document.createElement("div");
      row.className = "row fine";
      const name = document.createElement("span");
      name.textContent = "Penalty";
      const amt = document.createElement("b");
      amt.textContent = money(-view.penalty);
      row.append(name, amt);
      rows.append(row);
    }
  }
  text("result-note", view.note);
  text("result-wallet", `Wallet ${money(view.wallet)}`);
  const next = document.getElementById("btn-next");
  const retry = document.getElementById("btn-retry");
  if (next) {
    next.hidden = !view.success;
    next.textContent = view.nextLabel;
  }
  if (retry) retry.hidden = view.success;
}

export function renderGarage(save: SaveData) {
  const root = document.getElementById("garage-root");
  if (!root) return;
  root.replaceChildren();
  for (const item of SHOP) root.append(shopCard(save, item));
  sync(save);
}

export function ticker(name: string, line: string) {
  text("ticker-name", name);
  text("ticker-line", line);
}

export function bubble(name: string | null, line: string | null, hue = "#8eebff") {
  const el = document.getElementById("bubble");
  if (!el) return;
  if (!name || !line) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.style.setProperty("--who", hue);
  text("bubble-name", name);
  text("bubble-text", line);
}

export function radio(line: string) {
  const el = document.getElementById("radio");
  if (!el) return;
  el.textContent = line;
  el.hidden = !line;
}

export function tick(snap: {
  cash: number;
  tips: number;
  showTips: boolean;
  time: number;
  tense: boolean;
  chaos: number;
  objective: string;
  speed: number;
  alt: number;
  combo: number;
  vip: number | null;
  charge: number;
}) {
  text("cash", money(snap.cash));
  const fare = document.getElementById("fare");
  if (fare) {
    fare.hidden = !snap.showTips;
    fare.textContent = `Tips ${money(snap.tips)}`;
  }
  const timer = document.getElementById("timer");
  if (timer) {
    timer.textContent = snap.time > 0 || snap.tense ? format(snap.time) : "—";
    timer.classList.toggle("tense", snap.tense);
  }
  text("objective", snap.objective);
  const fill = document.getElementById("chaos-fill");
  if (fill) {
    fill.style.width = `${Math.max(0, Math.min(100, snap.chaos))}%`;
    fill.style.background = snap.chaos >= 75 ? "#ff5d6c" : snap.chaos >= 45 ? "#ffc56b" : "#8eebff";
  }
  text("chaos-num", String(Math.round(snap.chaos)));
  text("speed", `${Math.round(snap.speed)} MPH`);
  const alt = document.getElementById("alt");
  if (alt) {
    alt.hidden = snap.alt < 0.8;
    alt.textContent = `ALT ${Math.round(snap.alt)}m`;
  }
  const combo = document.getElementById("combo");
  if (combo) {
    combo.hidden = snap.combo < 2;
    combo.textContent = `STYLE x${snap.combo}`;
  }
  const vip = document.getElementById("vip");
  if (vip) {
    vip.hidden = snap.vip === null;
    text("vip-pips", snap.vip === null ? "" : "●".repeat(snap.vip) + "○".repeat(Math.max(0, 3 - snap.vip)));
  }
  const jump = document.getElementById("jump-fill");
  if (jump) jump.style.height = `${Math.round(snap.charge * 100)}%`;
}

function shopCard(save: SaveData, item: ShopItem) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "shop-card";
  const title = document.createElement("strong");
  title.textContent = item.name;
  const blurb = document.createElement("span");
  blurb.textContent = item.blurb;
  const meta = document.createElement("em");
  const have = owned(save, item);
  const equip =
    (item.skin && save.skin === item.skin) || (item.thruster && save.thruster === item.thruster);
  if (item.kind === "engine" || item.kind === "handling" || item.kind === "jump") {
    if (have) meta.textContent = "Installed";
    else if (canBuy(save, item)) {
      meta.textContent = money(item.price);
      btn.dataset.act = "buy";
      btn.dataset.arg = item.id;
    } else if (save.cash < item.price && previousReady(save, item)) meta.textContent = money(item.price);
    else meta.textContent = "Needs the step before";
  } else if (equip) meta.textContent = "Equipped";
  else if (have) {
    meta.textContent = "Equip";
    btn.dataset.act = "equip";
    btn.dataset.arg = item.skin ? `skin:${item.skin}` : `thrust:${item.thruster}`;
  } else if (canBuy(save, item)) {
    meta.textContent = money(item.price);
    btn.dataset.act = "buy";
    btn.dataset.arg = item.id;
  } else meta.textContent = money(item.price);
  if (!btn.dataset.act) btn.disabled = true;
  btn.append(title, blurb, meta);
  return btn;
}

function previousReady(save: SaveData, item: ShopItem) {
  if (item.kind === "engine") return save.engine === (item.level ?? 1) - 1;
  if (item.kind === "handling") return save.handling === (item.level ?? 1) - 1;
  if (item.kind === "jump") return save.jump === (item.level ?? 1) - 1;
  return true;
}

function text(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function format(s: number) {
  const c = Math.max(0, s);
  if (c < 10) return c.toFixed(1);
  const m = Math.floor(c / 60);
  const sec = Math.floor(c % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

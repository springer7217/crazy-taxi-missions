import { AudioBus, speak } from "../audio/audio.ts";
import { Actors } from "../entities/actors.ts";
import { Roadster, THRUSTER_COLOR } from "../entities/roadster.ts";
import { Input } from "../input/input.ts";
import { City } from "../map/city.ts";
import type { LoopMap } from "../map/city.ts";
import { MARA, PASSENGERS, pickLine, type Passenger } from "../dialogue/lines.ts";
import { missionById, MISSIONS, unlocked, type Mission } from "../missions/missions.ts";
import { loadSave, writeSave } from "../save/save.ts";
import * as ui from "../ui/hud.ts";
import type { ResultView } from "../ui/hud.ts";
import {
  CLEAN_BONUS,
  CLEAR_PAY,
  COMBO_WINDOW,
  DRIFT_TIP,
  FINE,
  JUMP_TIP,
  NEAR_TIP,
  SHOP,
  SMOOTH_BONUS,
  TIME_PER_SECOND,
  VIP_BONUS,
  canBuy,
  failPenalty,
  tune,
} from "./economy.ts";
import { SKY_DAY, SKY_NIGHT, mix, nightAmount } from "./palette.ts";
import type { SaveData, SkinId, ThrusterId } from "./types.ts";
import { Particles } from "./particles.ts";

type Mode = "boot" | "title" | "brief" | "play" | "pause" | "garage" | "result" | "credits";

type Paid = {
  base: number;
  time: number;
  smooth: number;
  clean: number;
  jump: number;
  near: number;
  style: number;
  paid: number;
};

type Run = {
  mission: Mission;
  index: number;
  stop: number;
  target: { x: number; y: number; name: string };
  riding: boolean;
  passenger: Passenger;
  timeLeft: number;
  jumpCash: number;
  nearCash: number;
  styleCash: number;
  crashes: number;
  dents: number;
  combo: number;
  maxCombo: number;
  lastStyle: number;
  banked: number;
  lastPaid: Paid;
  warnedTime: boolean;
  warnedChaos: boolean;
  lineIndex: number;
};

const ZERO_PAID: Paid = { base: 0, time: 0, smooth: 0, clean: 0, jump: 0, near: 0, style: 0, paid: 0 };

export class Game {
  private ctx: CanvasRenderingContext2D;
  private city = new City();
  private car = new Roadster();
  private actors = new Actors();
  private particles = new Particles();
  private input = new Input();
  private audio = new AudioBus();
  private save: SaveData;
  private mode: Mode = "boot";
  private pending: Mission | null = null;
  private run: Run | null = null;
  private returnTo: Mode = "title";
  private lastResult: ResultView | null = null;
  private camera = { x: 2300, y: 1500, zoom: 9 };
  private park = { x: 2300, y: 1500 };
  private orbit = 0;
  private clock = 100;
  private shake = 0;
  private chaos = 0;
  private hitCool = 0;
  private fineCool = 0;
  private copCool = 0;
  private driftHold = 0;
  private airTime = 0;
  private nag = 0;
  private lineTimer = 8;
  private bubbleAge = 10;
  private radioAge = 10;
  private quoteTimer = 0;
  private quoteIndex = 0;
  private lastThrottle = 0;
  private lastSteer = 0;
  private touchOn = false;
  private reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private canvas: HTMLCanvasElement;
  private dpr = 1;
  private viewW = 800;
  private viewH = 600;
  private floaters: { x: number; y: number; text: string; color: string; age: number }[] = [];
  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this.update(dt, now);
    this.draw(now);
    requestAnimationFrame(this.frame);
  };
  private last = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    this.ctx = ctx;
    this.save = loadSave();
    this.particles = new Particles(this.save.quality === "high" ? 260 : 110);
    this.audio.setMuted(this.save.muted);
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("pointerdown", () => this.audio.unlock());
    window.addEventListener("keydown", () => this.audio.unlock());
    document.body.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (!target?.dataset.act) return;
      this.action(target.dataset.act, target.dataset.arg);
    });
    window.speechSynthesis?.getVoices();
    this.resize();
  }

  async start() {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}map/loop.json`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as LoopMap;
      this.city.load(data);
      this.actors.spawn(this.city, this.save.quality);
      this.parkTitle();
      ui.hideBoot();
      this.toTitle();
      requestAnimationFrame(this.frame);
    } catch (err) {
      console.error(err);
      ui.bootError("The Chicago map didn't load. Refresh and try again.");
    }
  }

  private parkTitle() {
    const bean = this.city.landmark("bean");
    const road = this.city.nearestRoad(bean.x, bean.y);
    const spot = this.city.shove(road.x, road.y, this.car.radius);
    this.car.reset(spot.x, spot.y, Math.atan2(road.ty, road.tx));
    this.park = { x: this.car.x, y: this.car.y };
    this.camera.x = this.park.x;
    this.camera.y = this.park.y;
  }

  private resize() {
    const cap = this.save.quality === "low" ? 1 : 1.6;
    this.dpr = Math.min(cap, window.devicePixelRatio || 1);
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    this.canvas.style.width = `${this.viewW}px`;
    this.canvas.style.height = `${this.viewH}px`;
    this.syncChrome();
  }

  private syncChrome() {
    const pad = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 860;
    this.touchOn = this.mode === "play" && pad;
    ui.setFlags(this.save.quality, pad);
    ui.setTouch(this.touchOn);
  }

  private update(dt: number, now: number) {
    const control = this.input.read();
    if (control.muteEdge) this.action("mute");
    if (control.pauseEdge) this.action("pause");
    if (control.confirmEdge) this.confirm();
    this.hitCool = Math.max(0, this.hitCool - dt);
    this.fineCool = Math.max(0, this.fineCool - dt);
    this.copCool = Math.max(0, this.copCool - dt);
    this.nag = Math.max(0, this.nag - dt);
    this.shake *= Math.exp(-dt * 5.5);
    if (this.mode !== "pause") this.clock += dt;

    if (this.mode === "play" && this.run) this.play(dt, control);
    else if (this.mode !== "pause") {
      this.actors.update(dt, this.car.x, this.car.y, this.chaos);
      this.particles.update(dt);
    }

    if (this.mode === "title" || this.mode === "credits" || this.mode === "brief" || (this.mode === "garage" && this.returnTo === "title")) {
      this.orbit += dt * 0.08;
      const narrow = this.viewW < 900;
      const lift = narrow ? (this.viewH * 0.22) / Math.max(8, this.camera.zoom) : 0;
      const aimX = this.park.x + Math.cos(this.orbit) * 18;
      const aimY = this.park.y + Math.sin(this.orbit) * 12 + lift;
      const titleZoom = narrow ? 8.2 : 9;
      const k = 1 - Math.exp(-dt * 1.6);
      this.camera.x += (aimX - this.camera.x) * k;
      this.camera.y += (aimY - this.camera.y) * k;
      this.camera.zoom += (titleZoom - this.camera.zoom) * k;
      this.quoteTimer -= dt;
      if (this.mode === "title" && this.quoteTimer <= 0) {
        this.quoteTimer = 6.4;
        const people = Object.values(PASSENGERS);
        const who = people[this.quoteIndex % people.length];
        ui.ticker(who.name, who.lines[this.quoteIndex % who.lines.length]);
        this.quoteIndex++;
      }
    } else {
      this.follow(dt);
    }

    this.bubbleAge += dt;
    if (this.bubbleAge > 5.8) ui.bubble(null, null);
    this.radioAge += dt;
    if (this.radioAge > 4) ui.radio("");
    for (const floater of this.floaters) floater.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1.15);

    const tense = !!this.run && this.mode === "play" && this.run.timeLeft <= 10;
    this.audio.bpm = tense ? 128 : 96;
    const night = nightAmount(this.clock, this.save.timeMode);
    const siren = this.actors.cops.length > 0 && this.mode === "play";
    this.audio.update(
      this.mode === "play" ? Math.max(0, this.lastThrottle) : 0.2,
      this.car.z > 0.4,
      this.mode === "play" ? this.car.charge : 0.2,
      this.mode === "play" && control.jumpHeld && this.car.z <= 0,
      siren,
    );
    if (night && this.mode !== "pause") {
      /* clock already advanced */
    }
    ui.tick({
      cash: this.save.cash,
      tips: this.escrow(),
      showTips: !!this.run && this.run.riding && (this.mode === "play" || this.mode === "pause"),
      time: this.run?.timeLeft ?? 0,
      tense,
      chaos: this.chaos,
      objective: this.objective(),
      speed: Math.hypot(this.car.vx, this.car.vy) * 2.237,
      alt: this.car.z,
      combo: this.run?.combo ?? 0,
      vip: this.run?.mission.fragile && (this.mode === "play" || this.mode === "pause") ? Math.max(0, 3 - this.run.dents) : null,
      charge: this.mode === "play" ? this.car.charge : 0,
    });
    ui.setVignette(tense ? "danger" : this.chaos >= 70 && this.mode === "play" ? "heat" : "none");
    void now;
  }

  private play(dt: number, control: { throttle: number; steer: number; drift: boolean; jumpHeld: boolean }) {
    this.lastThrottle = control.throttle;
    this.lastSteer = control.steer;
    const stats = tune(this.save);
    const steps = 2;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const moved = this.car.step(h, control.throttle, control.steer, control.drift, control.jumpHeld, stats);
      this.resolveWalls();
      this.clampMap();
      if (moved.launched) {
        this.airTime = 0;
        this.hopClears = 0;
        this.hopSerial++;
      }
      if (this.car.z > 0) this.airTime += h;
      if (moved.landed) this.onLand(moved.landed);
      if (this.run?.riding && Math.abs(moved.lateral) > 7 && moved.speed > 14) this.driftHold += h;
      else this.driftHold = 0;
    }
    if (this.driftHold > 0.75) {
      this.driftHold = 0;
      this.award(DRIFT_TIP, "DRIFT");
    }
    this.actors.update(dt, this.car.x, this.car.y, this.chaos);
    this.particles.update(dt);
    this.unstick(dt, control.throttle);
    this.touchTraffic();
    this.touchPolice();
    this.stepMission(dt);
    this.spray(dt);
    const decay = this.chaos > 60 ? 1.15 : 2.4;
    this.chaos = Math.max(0, this.chaos - decay * dt);
    if (this.chaos >= 100) this.fail("The wardens shut the fare down.");
  }

  private unstick(dt: number, throttle: number) {
    const speed = Math.hypot(this.car.vx, this.car.vy);
    if (Math.abs(throttle) > 0.45 && speed < 1.4 && this.car.z < 0.5) this.stuck += dt;
    else this.stuck = 0;
    if (this.stuck < 0.75) return;
    const road = this.city.nearestRoad(this.car.x, this.car.y);
    const spot = this.city.shove(road.x, road.y, this.car.radius + 0.2);
    this.car.x = spot.x;
    this.car.y = spot.y;
    this.car.vx = road.tx * 6;
    this.car.vy = road.ty * 6;
    this.car.heading = Math.atan2(road.ty, road.tx);
    this.stuck = 0;
  }

  private resolveWalls() {
    for (let n = 0; n < 6; n++) {
      const hit = this.city.collide(this.car.x, this.car.y, this.car.radius, this.car.z);
      if (!hit) break;
      this.car.x += hit.nx * hit.pen;
      this.car.y += hit.ny * hit.pen;
      const vn = this.car.vx * hit.nx + this.car.vy * hit.ny;
      if (vn >= 0) continue;
      this.car.vx -= 1.28 * vn * hit.nx;
      this.car.vy -= 1.28 * vn * hit.ny;
      const impact = -vn;
      if (this.hitCool > 0) continue;
      if (impact > 8) this.onCrash();
      else if (impact > 4.5) {
        this.chaos = Math.min(99, this.chaos + 3);
        this.hitCool = 0.28;
      }
    }
  }

  private clampMap() {
    const m = 16;
    if (this.car.x < m) {
      this.car.x = m;
      this.car.vx = Math.abs(this.car.vx) * 0.2;
    } else if (this.car.x > this.city.width - m) {
      this.car.x = this.city.width - m;
      this.car.vx = -Math.abs(this.car.vx) * 0.2;
    }
    if (this.car.y < m) {
      this.car.y = m;
      this.car.vy = Math.abs(this.car.vy) * 0.2;
    } else if (this.car.y > this.city.height - m) {
      this.car.y = this.city.height - m;
      this.car.vy = -Math.abs(this.car.vy) * 0.2;
    }
  }

  private onLand(vz: number) {
    this.shake = Math.min(16, Math.abs(vz) * 0.2);
    this.audio.land();
    const n = this.save.quality === "high" ? 22 : 10;
    this.particles.burst(this.car.x, this.car.y, THRUSTER_COLOR[this.save.thruster], n, 9);
    if (this.airTime > 0.28) this.award(JUMP_TIP, "AIR");
    this.airTime = 0;
  }

  private onCrash() {
    this.hitCool = 0.45;
    this.shake = Math.min(16, this.shake + 8);
    this.audio.crash();
    this.chaos = Math.min(100, this.chaos + 16);
    this.particles.burst(this.car.x, this.car.y, "#d7dde3", 8, 6);
    if (!this.run) return;
    this.run.crashes += 1;
    if (this.run.mission.fragile) {
      this.run.dents += 1;
      this.radio(this.run.dents >= 3 ? "She felt that. The fare is over." : "Easy. She felt that.");
      if (this.run.dents >= 3) this.fail("June is done with this cab. The fare is lost.");
    }
  }

  private touchTraffic() {
    const speed = Math.hypot(this.car.vx, this.car.vy);
    for (const car of this.actors.cars) {
      const dx = this.car.x - car.x;
      const dy = this.car.y - car.y;
      if (dx * dx + dy * dy > 220) continue;
      const cfx = Math.cos(car.heading);
      const cfy = Math.sin(car.heading);
      const along = dx * cfx + dy * cfy;
      const side = dx * -cfy + dy * cfx;
      const over = Math.abs(along) < car.halfL + 1.05 && Math.abs(side) < car.halfW + 0.85;
      if (this.car.z > 2) {
        if (over && speed > 6 && car.seen !== this.hopSerial) {
          car.seen = this.hopSerial;
          this.hopClears += 1;
          const amount = CLEAR_PAY * this.hopClears;
          if (this.run && this.mode === "play") this.run.jumpCash += amount;
          this.float(`+$${amount} CLEARED`, "#d6ff73", this.hopClears * 1.4);
          this.audio.cash();
        }
        continue;
      }
      if (over) {
        if (car.hit <= 0) {
          car.hit = 0.55;
          this.onCrash();
          this.car.vx *= 0.5;
          this.car.vy *= 0.5;
          const d = Math.hypot(dx, dy) || 1;
          this.car.vx += (dx / d) * 5;
          this.car.vy += (dy / d) * 5;
          if (this.mode !== "play") return;
        }
      } else if (Math.abs(along) < car.halfL + 2.4 && Math.abs(side) < car.halfW + 1.6 && speed > 9 && car.near <= 0) {
        car.near = 2.3;
        this.chaos = Math.min(100, this.chaos + 4);
        this.award(NEAR_TIP, "NEAR");
      }
    }
    for (const ped of this.actors.peds) {
      const ox = Math.cos(ped.heading + Math.PI / 2) * ped.side;
      const oy = Math.sin(ped.heading + Math.PI / 2) * ped.side;
      const d = Math.hypot(ped.x + ox - this.car.x, ped.y + oy - this.car.y);
      if (this.car.z > 2) continue;
      if (d < 1.9) {
        if (ped.scare <= 0) {
          ped.scare = 0.9;
          const nx = (this.car.x - ped.x) / (d || 1);
          const ny = (this.car.y - ped.y) / (d || 1);
          ped.sx = -nx * 7;
          ped.sy = -ny * 7;
          this.chaos = Math.min(100, this.chaos + 14);
          this.float("WATCH IT", "#ffd7a8");
        }
      } else if (d < 3.3 && speed > 8 && ped.near <= 0) {
        ped.near = 2.3;
        this.chaos = Math.min(100, this.chaos + 4);
        this.award(NEAR_TIP, "NEAR");
      }
    }
  }

  private touchPolice() {
    if (!this.run || this.car.z > 2.2) return;
    for (const cop of this.actors.cops) {
      const d = Math.hypot(cop.x - this.car.x, cop.y - this.car.y);
      if (d > 2.7 || this.fineCool > 0) continue;
      this.fineCool = 7;
      this.save.cash = Math.max(0, this.save.cash - FINE);
      this.persist();
      this.chaos = Math.min(100, this.chaos + 6);
      this.shake = 8;
      this.float(`-$${FINE} FINE`, "#ff5d6c");
      this.radio(MARA.fine);
      const nx = (this.car.x - cop.x) / (d || 1);
      const ny = (this.car.y - cop.y) / (d || 1);
      this.car.vx += nx * 9;
      this.car.vy += ny * 9;
    }
  }

  private stepMission(dt: number) {
    const run = this.run;
    if (!run || this.mode !== "play") return;
    run.timeLeft -= dt;
    if (run.timeLeft <= 10 && !run.warnedTime) {
      run.warnedTime = true;
      this.radio(`Mara: ${pickLine(MARA.lowTime, 1)}`);
    }
    if (run.timeLeft <= 10 && run.timeLeft > 0) {
      const sec = Math.ceil(run.timeLeft);
      if (sec !== this.tickSec) {
        this.tickSec = sec;
        this.audio.tick(run.timeLeft < 5);
      }
    }
    if (run.timeLeft <= 0) {
      this.fail("Time's up. The fare is lost.");
      return;
    }
    if (run.riding) {
      this.lineTimer -= dt;
      if (this.lineTimer <= 0) {
        const line = run.passenger.lines[run.lineIndex % run.passenger.lines.length];
        run.lineIndex += 1;
        this.lineTimer = 9.5;
        this.say(line);
      }
    }
    const heat = run.mission.heat ?? 62;
    if (this.chaos >= heat && !run.warnedChaos) {
      run.warnedChaos = true;
      this.radio(`Mara: ${pickLine(MARA.chaos, 2)}`);
    }
    if (this.chaos >= heat && this.copCool <= 0 && this.actors.cops.length < (this.chaos > 85 ? 2 : 1)) {
      const bx = this.car.x - Math.cos(this.car.heading) * 78;
      const by = this.car.y - Math.sin(this.car.heading) * 78;
      this.actors.spawnCop(bx, by, this.car.heading);
      this.copCool = 3;
    }
    if (this.chaos < heat - 18) this.actors.clearCops();
    const d = Math.hypot(run.target.x - this.car.x, run.target.y - this.car.y);
    if (d > 20) return;
    if (this.car.z > 6.5) {
      if (this.nag <= 0) {
        this.nag = 4;
        this.radio(`Mara: ${MARA.tooHigh}`);
      }
      return;
    }
    this.reach();
  }

  private tickSec = -1;
  private stuck = 0;
  private hopClears = 0;
  private hopSerial = 1;

  private reach() {
    const run = this.run;
    if (!run) return;
    const stop = run.mission.stops[run.stop];
    if (!stop) return;
    if (stop.kind === "pickup") {
      run.riding = true;
      run.stop += 1;
      run.lineIndex = 1;
      this.lineTimer = 8.6;
      this.audio.pickup();
      this.say(run.passenger.lines[0]);
      this.radio(`Mara: ${pickLine(MARA.pickup, run.index)}`);
      this.aim();
      return;
    }
    this.bank();
    run.stop += 1;
    run.jumpCash = 0;
    run.nearCash = 0;
    run.styleCash = 0;
    run.crashes = 0;
    run.combo = 1;
    if (run.stop >= run.mission.stops.length) {
      this.succeed();
      return;
    }
    const hand = run.mission.handoff;
    if (hand && run.stop === hand.atStop) {
      run.passenger = PASSENGERS[hand.passenger];
      run.lineIndex = 1;
      this.lineTimer = 8.6;
      this.say(run.passenger.lines[0]);
      this.radio("Mara: Handoff. Priya Shah has the back seat. Professionally late.");
    } else {
      this.radio(`Mara: ${pickLine(MARA.drop, run.stop)}`);
    }
    this.aim();
  }

  private bank() {
    const run = this.run;
    if (!run) return;
    const stop = run.mission.stops[run.stop];
    const base = stop?.base ?? run.mission.baseFare;
    const time = Math.floor(run.timeLeft) * TIME_PER_SECOND;
    const speed = Math.hypot(this.car.vx, this.car.vy);
    const smooth = speed < 10 ? SMOOTH_BONUS : 0;
    const clean = run.mission.fragile ? (run.dents === 0 ? VIP_BONUS : 0) : run.crashes === 0 ? CLEAN_BONUS : 0;
    const paid = base + time + smooth + clean + run.jumpCash + run.nearCash + run.styleCash;
    run.lastPaid = { base, time, smooth, clean, jump: run.jumpCash, near: run.nearCash, style: run.styleCash, paid };
    run.banked += paid;
    this.save.cash += paid;
    this.persist();
    this.audio.success();
    this.float(`+$${paid} BANKED`, "#8eebff");
  }

  private aim() {
    const run = this.run;
    if (!run) return;
    const stop = run.mission.stops[run.stop];
    if (!stop) return;
    const lm = this.city.landmark(stop.at);
    const road = this.city.nearestRoad(lm.x, lm.y);
    run.target = { x: road.x, y: road.y, name: lm.name };
  }

  private spray(dt: number) {
    const speed = Math.hypot(this.car.vx, this.car.vy);
    const count = this.save.quality === "high" ? 2 : 1;
    if (this.car.z > 0 || this.car.charge > 0.15 || this.lastThrottle > 0.35) {
      const color = THRUSTER_COLOR[this.save.thruster];
      for (const jet of this.car.thrusters()) {
        for (let i = 0; i < count; i++) {
          this.particles.spawn(
            jet.x,
            jet.y,
            -Math.cos(this.car.heading) * (6 + Math.random() * 8) + (Math.random() - 0.5) * 2,
            -Math.sin(this.car.heading) * (6 + Math.random() * 8) + (Math.random() - 0.5) * 2,
            0.18 + Math.random() * 0.16,
            0.2 + Math.random() * 0.25,
            color,
          );
        }
      }
    } else if (speed > 12 && this.car.z <= 0 && !this.city.waterAt(this.car.x, this.car.y)) {
      this.particles.spawn(this.car.x, this.car.y, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.25, 0.22, "rgba(210,206,196,0.7)");
    }
    void dt;
  }

  private follow(dt: number) {
    const look = 13;
    const tx = this.car.x + Math.cos(this.car.heading) * look;
    const ty = this.car.y + Math.sin(this.car.heading) * look;
    const k = 1 - Math.exp(-dt * 4);
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
    const speed = Math.hypot(this.car.vx, this.car.vy);
    const zoom = Math.max(10.1, 12.3 - speed * 0.04);
    this.camera.zoom += (zoom - this.camera.zoom) * (1 - Math.exp(-dt * 2));
  }

  private draw(now: number) {
    const ctx = this.ctx;
    const night = nightAmount(this.clock, this.save.timeMode);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = mix(SKY_DAY, SKY_NIGHT, night);
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    const mag = this.reduceMotion ? this.shake * 0.25 : this.shake;
    const sx = Math.sin(now * 0.05) * mag;
    const sy = Math.cos(now * 0.045) * mag;
    ctx.save();
    ctx.translate(this.viewW / 2 + sx, this.viewH / 2 + sy);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    const hw = this.viewW / 2 / this.camera.zoom + 40;
    const hh = this.viewH / 2 / this.camera.zoom + 40;
    const view = {
      minX: this.camera.x - hw,
      maxX: this.camera.x + hw,
      minY: this.camera.y - hh,
      maxY: this.camera.y + hh,
    };
    this.city.draw(ctx, view, night, this.save.quality, this.clock, this.camera.x, this.camera.y);
    if (this.run && (this.mode === "play" || this.mode === "pause")) this.drawBeacon(ctx, night);
    this.actors.draw(ctx, this.clock, view.minX, view.minY, view.maxX, view.maxY, this.save.quality === "high");
    if (this.car.charge > 0.02 && this.mode === "play") {
      ctx.strokeStyle = THRUSTER_COLOR[this.save.thruster];
      ctx.lineWidth = 0.16;
      ctx.beginPath();
      ctx.arc(this.car.x, this.car.y, 3.3, -Math.PI / 2, -Math.PI / 2 + this.car.charge * Math.PI * 2);
      ctx.stroke();
    }
    this.car.draw(
      ctx,
      this.save.skin,
      this.save.thruster,
      this.mode === "play" ? this.lastSteer : 0,
      this.mode === "play" ? this.lastThrottle : 0.4,
      this.clock,
      this.save.quality === "high",
    );
    this.particles.draw(ctx);
    ctx.restore();
    this.drawOverlay();
  }

  private drawBeacon(ctx: CanvasRenderingContext2D, night: number) {
    const run = this.run;
    if (!run) return;
    const stop = run.mission.stops[run.stop];
    const color = stop?.kind === "pickup" ? "#8eebff" : "#ffc56b";
    const pulse = 7.5 + Math.sin(this.clock * 4) * 1.3;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 0.28;
    ctx.beginPath();
    ctx.arc(run.target.x, run.target.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = night > 0.4 ? 0.28 : 0.16;
    ctx.fillStyle = color;
    ctx.fillRect(run.target.x - 0.35, run.target.y - 12, 0.7, 12);
    ctx.restore();
  }

  private drawOverlay() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const floater of this.floaters) {
      const p = this.worldToScreen(floater.x, floater.y - floater.age * 10);
      ctx.globalAlpha = Math.max(0, 1 - floater.age / 1.15);
      ctx.fillStyle = floater.color;
      ctx.font = "600 15px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(floater.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    if (this.run && (this.mode === "play" || this.mode === "pause")) {
      const p = this.worldToScreen(this.run.target.x, this.run.target.y);
      const margin = 48;
      const inside = p.x > margin && p.y > margin && p.x < this.viewW - margin && p.y < this.viewH - margin;
      if (!inside) {
        const ang = Math.atan2(p.y - this.viewH / 2, p.x - this.viewW / 2);
        const edge = edgeOf(this.viewW / 2, this.viewH / 2, ang, margin, this.viewW, this.viewH);
        ctx.save();
        ctx.translate(edge.x, edge.y);
        ctx.rotate(ang);
        ctx.fillStyle = "#ffc56b";
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-8, 7);
        ctx.lineTo(-8, -7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      this.drawMinimap();
    }
  }

  private drawMinimap() {
    const mw = 168;
    const mh = 118;
    const x = this.viewW - mw - 14;
    const y = this.viewH - mh - (this.touchOn ? 206 : 16);
    const map = this.city.drawMinimapBase(this.ctx, x, y, mw, mh);
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(214,228,236,0.35)";
    ctx.strokeRect(x + 0.5, y + 0.5, mw - 1, mh - 1);
    if (this.run) {
      ctx.fillStyle = "#ffc56b";
      ctx.beginPath();
      ctx.arc(map.sx(this.run.target.x), map.sy(this.run.target.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const cop of this.actors.cops) {
      ctx.fillStyle = "#ff5d6c";
      ctx.fillRect(map.sx(cop.x) - 2, map.sy(cop.y) - 2, 4, 4);
    }
    ctx.fillStyle = "#f4fbff";
    ctx.beginPath();
    ctx.arc(map.sx(this.car.x), map.sy(this.car.y), 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(214,228,236,0.7)";
    ctx.font = "600 10px Oswald, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("N", x + 8, y + 16);
  }

  private worldToScreen(wx: number, wy: number) {
    return {
      x: (wx - this.camera.x) * this.camera.zoom + this.viewW / 2,
      y: (wy - this.camera.y) * this.camera.zoom + this.viewH / 2,
    };
  }

  private objective() {
    const run = this.run;
    if (!run || (this.mode !== "play" && this.mode !== "pause")) return "";
    const stop = run.mission.stops[run.stop];
    if (!stop) return run.mission.title;
    const who = run.passenger.name.split(" ")[0];
    const dist = Math.round(Math.hypot(run.target.x - this.car.x, run.target.y - this.car.y));
    if (stop.kind === "pickup") return `Pick up ${who} · ${run.target.name} · ${dist}m`;
    const drops = run.mission.stops.filter((s) => s.kind === "dropoff").length;
    const index = run.mission.stops.slice(0, run.stop + 1).filter((s) => s.kind === "dropoff").length;
    const prefix = drops > 1 ? `Drop ${index} of ${drops}` : "Drop off";
    return `${prefix} ${who} · ${run.target.name} · ${dist}m`;
  }

  private escrow() {
    if (!this.run) return 0;
    return this.run.jumpCash + this.run.nearCash + this.run.styleCash;
  }

  private award(base: number, label: string) {
    const run = this.run;
    if (!run?.riding || this.mode !== "play") return;
    const now = performance.now() / 1000;
    if (now - run.lastStyle <= COMBO_WINDOW) run.combo += 1;
    else run.combo = 1;
    run.lastStyle = now;
    run.maxCombo = Math.max(run.maxCombo, run.combo);
    const amount = base * run.combo;
    if (label === "AIR") run.jumpCash += amount;
    else if (label === "NEAR") run.nearCash += amount;
    else run.styleCash += amount;
    this.float(`+$${amount} ${label}${run.combo > 1 ? ` x${run.combo}` : ""}`, "#d6ff73");
    this.audio.cash();
  }

  private float(text: string, color: string, lift = 0) {
    this.floaters.push({ x: this.car.x, y: this.car.y - 2 - lift, text, color, age: 0 });
    if (this.floaters.length > 8) this.floaters.shift();
  }

  private say(line: string) {
    if (!this.run) return;
    this.bubbleAge = 0;
    ui.bubble(this.run.passenger.name, line, this.run.passenger.hue);
    speak(line, this.save.voice, this.save.muted, 1.05);
  }

  private radio(line: string) {
    this.radioAge = 0;
    ui.radio(line);
  }

  private confirm() {
    if (this.mode === "brief") this.begin();
    else if (this.mode === "title") this.action("start");
    else if (this.mode === "pause") this.setMode("play");
    else if (this.mode === "result" && this.lastResult?.success) this.action("next");
  }

  private action(act: string, arg?: string) {
    this.audio.unlock();
    if (act === "start") {
      const next = MISSIONS.findIndex((m, i) => unlocked(this.save.cleared, i) && !this.save.cleared.includes(m.id));
      this.openBrief((next === -1 ? MISSIONS[0] : MISSIONS[next]).id);
    } else if (act === "mission" && arg) this.openBrief(arg);
    else if (act === "accept") this.begin();
    else if (act === "title") this.toTitle();
    else if (act === "credits") this.setMode("credits");
    else if (act === "pause") {
      if (this.mode === "play") this.setMode("pause");
      else if (this.mode === "pause") this.setMode("play");
      else if (this.mode === "brief" || this.mode === "credits" || this.mode === "garage") this.toTitle();
    } else if (act === "resume") this.setMode("play");
    else if (act === "retry") this.begin();
    else if (act === "next") this.next();
    else if (act === "garage") this.openGarage();
    else if (act === "garage-back") this.closeGarage();
    else if (act === "mute") this.toggleMute();
    else if (act === "voice") {
      this.save.voice = !this.save.voice;
      if (!this.save.voice) window.speechSynthesis?.cancel();
      this.persist();
    } else if (act === "quality") {
      this.save.quality = this.save.quality === "high" ? "low" : "high";
      this.particles = new Particles(this.save.quality === "high" ? 260 : 110);
      this.actors.spawn(this.city, this.save.quality);
      this.persist();
      this.resize();
    } else if (act === "time") {
      const order = ["cycle", "day", "night"] as const;
      const i = order.indexOf(this.save.timeMode);
      this.save.timeMode = order[(i + 1) % order.length];
      this.persist();
    } else if (act === "buy" && arg) this.buy(arg);
    else if (act === "equip" && arg) this.equip(arg);
    ui.sync(this.save);
  }

  private toggleMute() {
    this.save.muted = !this.save.muted;
    this.audio.setMuted(this.save.muted);
    this.persist();
    ui.sync(this.save);
  }

  private openBrief(id: string) {
    const index = MISSIONS.findIndex((m) => m.id === id);
    if (index < 0 || !unlocked(this.save.cleared, index)) return;
    this.pending = MISSIONS[index];
    this.mode = "brief";
    ui.renderBrief(this.pending);
    ui.show("brief");
    this.syncChrome();
    speak(this.pending.briefing, this.save.voice, this.save.muted, 0.92);
  }

  private begin() {
    const mission = this.pending ?? this.run?.mission ?? missionById("first-light");
    const index = MISSIONS.findIndex((m) => m.id === mission.id);
    const passenger = PASSENGERS[mission.passenger];
    this.pending = mission;
    this.run = {
      mission,
      index,
      stop: 0,
      target: { x: 0, y: 0, name: "" },
      riding: false,
      passenger,
      timeLeft: mission.timeLimit,
      jumpCash: 0,
      nearCash: 0,
      styleCash: 0,
      crashes: 0,
      dents: 0,
      combo: 1,
      maxCombo: 1,
      lastStyle: 0,
      banked: 0,
      lastPaid: { ...ZERO_PAID },
      warnedTime: false,
      warnedChaos: false,
      lineIndex: 0,
    };
    this.aim();
    const road = this.city.nearestRoad(this.run.target.x, this.run.target.y);
    const backX = road.x - road.tx * 40;
    const backY = road.y - road.ty * 40;
    const spot = this.city.shove(backX, backY, this.car.radius);
    const heading = Math.atan2(road.y - spot.y, road.x - spot.x);
    this.car.reset(spot.x, spot.y, heading);
    this.chaos = mission.startChaos ?? 0;
    this.actors.clearCops();
    this.floaters = [];
    this.tickSec = -1;
    this.mode = "play";
    ui.bubble(null, null);
    ui.radio("");
    ui.show("play");
    window.speechSynthesis?.cancel();
    this.syncChrome();
    this.lineTimer = 8.6;
  }

  private succeed() {
    const run = this.run;
    if (!run) return;
    if (!this.save.cleared.includes(run.mission.id)) this.save.cleared.push(run.mission.id);
    this.persist();
    const paid = run.lastPaid;
    const lines = [
      { label: "Base fare", amount: paid.base },
      { label: `Time left (${Math.floor(run.timeLeft)}s)`, amount: paid.time },
      { label: "Jump tips", amount: paid.jump },
      { label: "Near misses", amount: paid.near },
      { label: "Style", amount: paid.style },
      { label: paid.clean === VIP_BONUS ? "VIP calm" : "Clean leg", amount: paid.clean },
      { label: "Smooth stop", amount: paid.smooth },
      { label: "Earlier drops", amount: run.banked - paid.paid },
    ];
    const next = run.index + 1 < MISSIONS.length;
    const view: ResultView = {
      success: true,
      title: run.mission.title,
      reason: next ? "Mara has another one if you want it." : "Shift complete. The Loop can wait.",
      lines,
      total: run.banked,
      penalty: 0,
      wallet: this.save.cash,
      note: run.maxCombo >= 2 ? `Best style combo x${run.maxCombo}.` : "No combo that leg. The street is still there.",
      nextLabel: next ? "Next fare" : "Back to the Loop",
    };
    this.lastResult = view;
    this.mode = "result";
    ui.renderResult(view);
    ui.show("result");
    this.syncChrome();
  }

  private fail(reason: string) {
    if (this.mode !== "play" || !this.run) return;
    const penalty = failPenalty(this.run.index);
    this.save.cash = Math.max(0, this.save.cash - penalty);
    this.persist();
    this.audio.fail();
    window.speechSynthesis?.cancel();
    const view: ResultView = {
      success: false,
      title: this.run.mission.title,
      reason,
      lines: [],
      total: 0,
      penalty,
      wallet: this.save.cash,
      note: "Tips on this leg stayed in escrow and vanished with the fare. Drops you already banked stay in the wallet.",
      nextLabel: "Retry",
    };
    this.lastResult = view;
    this.mode = "result";
    ui.renderResult(view);
    ui.show("result");
    ui.setVignette("none");
    this.syncChrome();
  }

  private next() {
    if (!this.run) return this.toTitle();
    const i = this.run.index + 1;
    if (i < MISSIONS.length) this.openBrief(MISSIONS[i].id);
    else this.toTitle();
  }

  private openGarage() {
    this.returnTo = this.mode === "play" || this.mode === "pause" ? "pause" : this.mode === "result" ? "result" : "title";
    if (this.mode === "play") this.mode = "pause";
    this.mode = "garage";
    ui.renderGarage(this.save);
    ui.show("garage");
    this.syncChrome();
  }

  private closeGarage() {
    if (this.returnTo === "pause" && this.run) this.setMode("pause");
    else if (this.returnTo === "result" && this.lastResult) {
      this.mode = "result";
      ui.renderResult(this.lastResult);
      ui.show("result");
      this.syncChrome();
    } else this.toTitle();
  }

  private buy(id: string) {
    const item = SHOP.find((entry) => entry.id === id);
    if (!item || !canBuy(this.save, item)) return;
    this.save.cash -= item.price;
    if (item.kind === "engine" && item.level) this.save.engine = item.level;
    if (item.kind === "handling" && item.level) this.save.handling = item.level;
    if (item.kind === "jump" && item.level) this.save.jump = item.level;
    if (item.skin && !this.save.skins.includes(item.skin)) {
      this.save.skins.push(item.skin);
      this.save.skin = item.skin;
    }
    if (item.thruster && !this.save.thrusters.includes(item.thruster)) {
      this.save.thrusters.push(item.thruster);
      this.save.thruster = item.thruster;
    }
    this.persist();
    ui.renderGarage(this.save);
  }

  private equip(arg: string) {
    const [kind, id] = arg.split(":");
    if (kind === "skin" && this.save.skins.includes(id as SkinId)) this.save.skin = id as SkinId;
    if (kind === "thrust" && this.save.thrusters.includes(id as ThrusterId)) this.save.thruster = id as ThrusterId;
    this.persist();
    ui.renderGarage(this.save);
  }

  private setMode(mode: Mode) {
    this.mode = mode;
    if (mode === "title") this.toTitle();
    else if (mode === "play") {
      ui.show("play");
      this.syncChrome();
    } else if (mode === "pause") {
      ui.show("pause");
      ui.sync(this.save);
      window.speechSynthesis?.cancel();
      this.syncChrome();
    } else if (mode === "credits") {
      ui.show("credits");
      this.syncChrome();
    }
  }

  private toTitle() {
    this.mode = "title";
    this.chaos = 0;
    this.actors.clearCops();
    if (!this.park.x) this.parkTitle();
    ui.show("title");
    ui.renderMissions(this.save);
    ui.bubble(null, null);
    ui.radio("");
    ui.setVignette("none");
    this.syncChrome();
    this.quoteTimer = 0;
  }

  private persist() {
    writeSave(this.save);
    ui.sync(this.save);
  }
}

function edgeOf(cx: number, cy: number, ang: number, inset: number, w: number, h: number) {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  let t = 1e9;
  if (dx > 0.001) t = Math.min(t, (w - inset - cx) / dx);
  if (dx < -0.001) t = Math.min(t, (inset - cx) / dx);
  if (dy > 0.001) t = Math.min(t, (h - inset - cy) / dy);
  if (dy < -0.001) t = Math.min(t, (inset - cy) / dy);
  return { x: cx + dx * t, y: cy + dy * t };
}

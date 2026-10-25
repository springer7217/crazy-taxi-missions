export type Control = {
  throttle: number;
  steer: number;
  drift: boolean;
  jumpHeld: boolean;
  pauseEdge: boolean;
  muteEdge: boolean;
  confirmEdge: boolean;
};

const KEY_THROTTLE = new Set(["KeyW", "ArrowUp"]);
const KEY_BRAKE = new Set(["KeyS", "ArrowDown"]);
const KEY_LEFT = new Set(["KeyA", "ArrowLeft"]);
const KEY_RIGHT = new Set(["KeyD", "ArrowRight"]);

export class Input {
  private keys = new Set<string>();
  private stickX = 0;
  private stickY = 0;
  private stickOn = false;
  private jumpBtn = false;
  private driftBtn = false;
  private pauseEdge = false;
  private muteEdge = false;
  private confirmEdge = false;
  private pointer = -1;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (this.tracked(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === "Escape" || e.code === "KeyP") {
        this.pauseEdge = true;
        e.preventDefault();
      }
      if (e.code === "KeyM") this.muteEdge = true;
      if (e.code === "Enter") this.confirmEdge = true;
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener("blur", () => this.keys.clear());
    this.bindStick();
    this.bindHold("btn-jump", (v) => {
      this.jumpBtn = v;
    });
    this.bindHold("btn-drift", (v) => {
      this.driftBtn = v;
    });
  }

  private tracked(code: string) {
    return (
      KEY_THROTTLE.has(code) ||
      KEY_BRAKE.has(code) ||
      KEY_LEFT.has(code) ||
      KEY_RIGHT.has(code) ||
      code === "Space" ||
      code === "ShiftLeft" ||
      code === "ShiftRight"
    );
  }

  private bindHold(id: string, set: (v: boolean) => void) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      set(true);
    };
    const up = (e: PointerEvent) => {
      set(false);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", () => set(false));
  }

  private bindStick() {
    const stick = document.getElementById("stick");
    const nub = document.getElementById("nub");
    if (!stick || !nub) return;
    const max = 42;
    const move = (clientX: number, clientY: number) => {
      const rect = stick.getBoundingClientRect();
      const ox = rect.left + rect.width / 2;
      const oy = rect.top + rect.height / 2;
      let dx = clientX - ox;
      let dy = clientY - oy;
      const mag = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(max, mag);
      dx = (dx / mag) * clamped;
      dy = (dy / mag) * clamped;
      this.stickX = dx / max;
      this.stickY = dy / max;
      nub.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    stick.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.pointer = e.pointerId;
      this.stickOn = true;
      stick.setPointerCapture(e.pointerId);
      move(e.clientX, e.clientY);
    });
    stick.addEventListener("pointermove", (e) => {
      if (!this.stickOn || e.pointerId !== this.pointer) return;
      move(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer && this.pointer !== -1) return;
      this.stickOn = false;
      this.pointer = -1;
      this.stickX = 0;
      this.stickY = 0;
      nub.style.transform = "translate(0px, 0px)";
    };
    stick.addEventListener("pointerup", end);
    stick.addEventListener("pointercancel", end);
  }

  read(): Control {
    let throttle = 0;
    let steer = 0;
    if ([...KEY_THROTTLE].some((k) => this.keys.has(k))) throttle += 1;
    if ([...KEY_BRAKE].some((k) => this.keys.has(k))) throttle -= 1;
    if ([...KEY_LEFT].some((k) => this.keys.has(k))) steer -= 1;
    if ([...KEY_RIGHT].some((k) => this.keys.has(k))) steer += 1;
    if (steer === 0) steer = this.stickX;
    if (throttle === 0 && this.stickOn) throttle = -this.stickY;
    const jumpHeld = this.keys.has("Space") || this.jumpBtn;
    const drift = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.driftBtn;
    const control: Control = {
      throttle: Math.max(-1, Math.min(1, throttle)),
      steer: Math.max(-1, Math.min(1, steer)),
      drift,
      jumpHeld,
      pauseEdge: this.pauseEdge,
      muteEdge: this.muteEdge,
      confirmEdge: this.confirmEdge,
    };
    this.pauseEdge = false;
    this.muteEdge = false;
    this.confirmEdge = false;
    return control;
  }
}

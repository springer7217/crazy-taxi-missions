/**
 * Original procedural score and effects. No samples, no copyrighted audio.
 * A minor vamp, eighth-note grid. Tempo jumps when a fare drops under 10 seconds.
 */

function midi(semi: number, base: number) {
  return base * 2 ** (semi / 12);
}

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private thrustGain: GainNode | null = null;
  private thrustFilter: BiquadFilterNode | null = null;
  private siren: { a: OscillatorNode; b: OscillatorNode; g: GainNode } | null = null;
  private charge: { o: OscillatorNode; g: GainNode } | null = null;
  private noise: AudioBuffer | null = null;
  private next = 0;
  private step = 0;
  bpm = 96;
  muted = false;
  private unlocked = false;

  unlock() {
    if (this.unlocked) {
      if (this.ctx?.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = 0.16;
    this.music.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.85;
    this.sfx.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.thrustFilter = ctx.createBiquadFilter();
    this.thrustFilter.type = "bandpass";
    this.thrustFilter.frequency.value = 180;
    this.thrustFilter.Q.value = 0.7;
    this.thrustGain = ctx.createGain();
    this.thrustGain.gain.value = 0;
    src.connect(this.thrustFilter);
    this.thrustFilter.connect(this.thrustGain);
    this.thrustGain.connect(this.sfx);
    src.start();
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    const g = ctx.createGain();
    a.type = "square";
    b.type = "square";
    a.frequency.value = 640;
    b.frequency.value = 860;
    g.gain.value = 0;
    a.connect(g);
    b.connect(g);
    g.connect(this.sfx);
    a.start();
    b.start();
    this.siren = { a, b, g };
    this.next = ctx.currentTime + 0.1;
    this.unlocked = true;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) window.speechSynthesis?.cancel();
    this.master?.gain.setTargetAtTime(muted ? 0 : 1, this.ctx?.currentTime ?? 0, 0.03);
  }

  update(thrust: number, airborne: boolean, charge: number, charging: boolean, sirenOn: boolean) {
    if (!this.ctx || !this.thrustGain || !this.thrustFilter || !this.music) return;
    const now = this.ctx.currentTime;
    const drive = Math.max(0, Math.min(1, thrust)) * 0.5 + (airborne ? 0.35 : 0) + charge * 0.2;
    this.thrustGain.gain.setTargetAtTime(drive * 0.18, now, 0.05);
    this.thrustFilter.frequency.setTargetAtTime(140 + drive * 520 + (airborne ? 180 : 0), now, 0.05);
    if (charging && charge > 0.04) {
      if (!this.charge) this.startCharge();
      this.charge!.o.frequency.setTargetAtTime(170 + charge * 780, now, 0.04);
      this.charge!.g.gain.setTargetAtTime(0.025 + charge * 0.04, now, 0.04);
    } else if (this.charge) this.stopCharge();
    if (this.siren) {
      const wob = (Math.sin(now * 7) + 1) / 2;
      this.siren.a.frequency.setTargetAtTime(580 + wob * 260, now, 0.03);
      this.siren.b.frequency.setTargetAtTime(820 - wob * 180, now, 0.03);
      this.siren.g.gain.setTargetAtTime(sirenOn ? 0.045 : 0, now, 0.08);
    }
    const eighth = 60 / this.bpm / 2;
    let guard = 0;
    while (this.next < now + 0.25 && guard++ < 8) {
      this.schedule(this.step % 32, this.next);
      this.step++;
      this.next += eighth;
    }
  }

  private schedule(step: number, time: number) {
    if (!this.ctx || !this.music || !this.sfx || !this.noise) return;
    const bass = [0, 0, 0, 7, 5, 5, 5, 3, -2, -2, 0, 3, -5, -5, -2, 0];
    const idx = Math.floor(step / 2);
    if (step % 2 === 0) this.tone(time, midi(bass[idx] ?? 0, 55), 0.18, "triangle", 0.2, this.music);
    const lead = [0, 7, 3, 10, 7, 12, 3, 0, 7, 15, 12, 7, 3, 10, 7, 3];
    if (step % 2 === 0 && step % 4 !== 2) this.tone(time, midi(lead[idx] ?? 0, 440), 0.16, "square", 0.045, this.music);
    if (step % 8 === 0) this.kick(time);
    if (step % 8 === 4) this.snare(time);
    if (step % 2 === 1) this.hat(time);
  }

  private tone(time: number, freq: number, dur: number, type: OscillatorType, gain: number, dest: AudioNode) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(dest);
    o.start(time);
    o.stop(time + dur + 0.02);
  }

  private kick(time: number) {
    if (!this.ctx || !this.music) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, time);
    o.frequency.exponentialRampToValueAtTime(48, time + 0.12);
    g.gain.setValueAtTime(0.28, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    o.connect(g);
    g.connect(this.music);
    o.start(time);
    o.stop(time + 0.18);
  }

  private snare(time: number) {
    if (!this.ctx || !this.music || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.music);
    src.start(time);
    src.stop(time + 0.14);
  }

  private hat(time: number) {
    if (!this.ctx || !this.music || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.04, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.music);
    src.start(time);
    src.stop(time + 0.05);
  }

  private startCharge() {
    if (!this.ctx || !this.sfx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = 180;
    g.gain.value = 0;
    o.connect(g);
    g.connect(this.sfx);
    o.start();
    this.charge = { o, g };
  }

  private stopCharge() {
    if (!this.charge || !this.ctx) return;
    const { o, g } = this.charge;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    o.stop(this.ctx.currentTime + 0.08);
    this.charge = null;
  }

  land() {
    this.blipNoise(0.18, 400, 0.2);
    if (!this.ctx || !this.sfx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(180, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(55, this.ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.12, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.2);
    o.connect(g);
    g.connect(this.sfx);
    o.start();
    o.stop(this.ctx.currentTime + 0.22);
  }

  pickup() {
    if (!this.ctx || !this.sfx) return;
    this.tone(this.ctx.currentTime, 660, 0.12, "sine", 0.12, this.sfx);
    this.tone(this.ctx.currentTime + 0.09, 990, 0.16, "sine", 0.1, this.sfx);
  }

  success() {
    if (!this.ctx || !this.sfx) return;
    const now = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(now + i * 0.07, f, 0.16, "triangle", 0.08, this.sfx!));
  }

  fail() {
    if (!this.ctx || !this.sfx) return;
    this.tone(this.ctx.currentTime, 196, 0.28, "sawtooth", 0.06, this.sfx);
    this.tone(this.ctx.currentTime + 0.12, 130, 0.34, "triangle", 0.08, this.sfx);
  }

  crash() {
    this.blipNoise(0.28, 220, 0.28);
    if (!this.ctx || !this.sfx) return;
    this.tone(this.ctx.currentTime, 90, 0.2, "square", 0.08, this.sfx);
  }

  tick(urgent: boolean) {
    if (!this.ctx || !this.sfx) return;
    this.tone(this.ctx.currentTime, urgent ? 1480 : 980, 0.06, "square", urgent ? 0.07 : 0.045, this.sfx);
  }

  cash() {
    if (!this.ctx || !this.sfx) return;
    this.tone(this.ctx.currentTime, 880, 0.08, "sine", 0.06, this.sfx);
  }

  private blipNoise(dur: number, freq: number, gain: number) {
    if (!this.ctx || !this.sfx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfx);
    src.start(now);
    src.stop(now + dur + 0.02);
  }
}

export function speak(text: string, enabled: boolean, muted: boolean, pitch = 1) {
  const synth = window.speechSynthesis;
  if (!enabled || muted || !synth) return;
  try {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.04;
    utter.pitch = pitch;
    utter.lang = "en-US";
    const voices = synth.getVoices();
    const voice =
      voices.find((v) => /en[-_]US/i.test(v.lang) && /samantha|google|natural|aria|jenny/i.test(v.name)) ||
      voices.find((v) => /en/i.test(v.lang));
    if (voice) utter.voice = voice;
    synth.cancel();
    synth.speak(utter);
  } catch {
    /* text bubbles still carry the line */
  }
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function angNorm(a: number) {
  const t = Math.PI * 2;
  a %= t;
  if (a > Math.PI) a -= t;
  if (a < -Math.PI) a += t;
  return a;
}

export function money(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

export function formatTime(s: number) {
  const c = Math.max(0, s);
  if (c < 10) return c.toFixed(1);
  const m = Math.floor(c / 60);
  const sec = Math.floor(c % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function hash01(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

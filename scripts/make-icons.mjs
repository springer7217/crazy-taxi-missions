import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, t, data, crc]);
}

function insideRound(x, y, size, r) {
  const s = size - 1;
  if (x >= r && x <= s - r && y >= r && y <= s - r) return true;
  if (x >= r && x <= s - r) return y >= 0 && y <= s;
  if (y >= r && y <= s - r) return x >= 0 && x <= s;
  const cx = x < r ? r : s - r;
  const cy = y < r ? r : s - r;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = Math.round(size * 0.18);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      if (!insideRound(x, y, size, r)) {
        raw[i + 3] = 0;
        continue;
      }
      let red = 7;
      let green = 16;
      let blue = 24;
      const nx = (x / size - 0.5) * 2;
      const ny = (y / size - 0.5) * 2;
      const body = ((nx * 1.05) ** 2) / 0.72 + ((ny + 0.05) ** 2) / 0.22;
      if (body < 1) {
        const sheen = Math.max(0, 1 - Math.abs(ny + 0.02) * 6);
        red = 168 + sheen * 70;
        green = 176 + sheen * 60;
        blue = 186 + sheen * 50;
      }
      const glass = ((nx * 1.2) ** 2) / 0.42 + ((ny + 0.16) ** 2) / 0.08;
      if (glass < 1 && body < 1) {
        red = 120;
        green = 168;
        blue = 188;
      }
      const jetL = (nx + 0.62) ** 2 + (ny - 0.18) ** 2;
      const jetR = (nx - 0.62) ** 2 + (ny - 0.18) ** 2;
      if (jetL < 0.02 || jetR < 0.02) {
        red = 92;
        green = 225;
        blue = 255;
      }
      raw[i] = red;
      raw[i + 1] = green;
      raw[i + 2] = blue;
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", png(192));
writeFileSync("public/icons/icon-512.png", png(512));
console.log("icons written");

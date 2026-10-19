/** Tiny PNG encoder for the simulated album covers of the mock bridge (no image dependency). */
import { crc32, deflateSync } from "node:zlib";

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** RGB PNG from a per-pixel function returning [r, g, b] (0..255). */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Abstract "album cover": diagonal gradient between two colors with a soft sun disc. */
export function mockCover(from: string, to: string, size = 256): Buffer {
  const a = hex(from);
  const b = hex(to);
  return encodePng(size, size, (x, y) => {
    const t = (x + y) / (2 * size);
    const dx = x - size * 0.62;
    const dy = y - size * 0.4;
    const d = Math.sqrt(dx * dx + dy * dy) / (size * 0.24);
    const sun = d < 1 ? 0.55 : Math.max(0, 0.25 - (d - 1) * 0.4);
    const stripe = Math.sin((y / size) * Math.PI * 14) > 0.92 && y > size * 0.62 ? 0.12 : 0;
    return [0, 1, 2].map((i) => Math.round(Math.min(255, a[i]! + (b[i]! - a[i]!) * t + (255 - a[i]!) * (sun + stripe) * 0.6))) as [number, number, number];
  });
}

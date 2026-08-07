/**
 * Emits placeholder PWA icons so "Add to Home Screen" installs with a real
 * icon today. Replace public/pwa-*.png with the actual Helix logo when the
 * branding assets land — this script is only a stand-in.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Solid background with a centred white square standing in for the mark. */
function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const inset = Math.round(size * 0.3);

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0; // Filter type: none.
    for (let x = 0; x < size; x++) {
      const mark = x >= inset && x < size - inset && y >= inset && y < size - inset;
      const v = mark ? 255 : 0;
      raw.fill(v, rowStart + 1 + x * 3, rowStart + 1 + x * 3 + 3);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/pwa-${size}.png`, import.meta.url), png(size));
}

writeFileSync(
  new URL("../public/favicon.svg", import.meta.url),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="7" fill="#000"/>' +
    '<path d="M11 9v14M21 9v14M11 16h10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>' +
    "</svg>\n",
);

console.log("wrote public/pwa-192.png, public/pwa-512.png, public/favicon.svg");

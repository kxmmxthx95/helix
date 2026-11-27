export type RawImage = { data: Uint8ClampedArray; width: number; height: number };

export function toGray(img: RawImage): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (img.data[j]! * 77 + img.data[j + 1]! * 151 + img.data[j + 2]! * 28) >> 8;
  return out;
}

/** Local-mean threshold (Bradley): ink (1) where a pixel is clearly darker than its neighbourhood; copes with shadows and uneven light. */
export function adaptiveBinarize(gray: Uint8ClampedArray, w: number, h: number, windowFrac = 1 / 12, darker = 0.15): Uint8Array {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x]!;
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1]! + row;
    }
  }
  const half = Math.max(8, Math.round(w * windowFrac) >> 1);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w, x + half + 1);
      const sum = integral[y1 * (w + 1) + x1]! - integral[y0 * (w + 1) + x1]! - integral[y1 * (w + 1) + x0]! + integral[y0 * (w + 1) + x0]!;
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = gray[y * w + x]! < mean * (1 - darker) ? 1 : 0;
    }
  }
  return out;
}

export type Component = { minX: number; minY: number; maxX: number; maxY: number; area: number; cx: number; cy: number };

/** 4-connected blobs of ink with at least `minArea` pixels. */
export function components(bin: Uint8Array, w: number, h: number, minArea: number): Component[] {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Component[] = [];
  for (let start = 0; start < bin.length; start++) {
    if (!bin[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let minX = w, minY = h, maxX = 0, maxY = 0, area = 0, sx = 0, sy = 0;
    while (sp > 0) {
      const p = stack[--sp]!;
      const x = p % w;
      const y = (p / w) | 0;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && bin[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && bin[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && bin[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && bin[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    if (area >= minArea) out.push({ minX, minY, maxX, maxY, area, cx: sx / area, cy: sy / area });
  }
  return out;
}

/** Scales an image so its long side is at most `max` px (box average); returns the same image when already small. */
export function downscale(img: RawImage, max: number): RawImage {
  const k = Math.max(img.width, img.height) / max;
  if (k <= 1) return img;
  const w = Math.round(img.width / k);
  const h = Math.round(img.height / k);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y * k);
    const sy1 = Math.max(sy0 + 1, Math.min(img.height, Math.floor((y + 1) * k)));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * k);
      const sx1 = Math.max(sx0 + 1, Math.min(img.width, Math.floor((x + 1) * k)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) {
        const i = (yy * img.width + xx) * 4;
        r += img.data[i]!; g += img.data[i + 1]!; b += img.data[i + 2]!; n++;
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

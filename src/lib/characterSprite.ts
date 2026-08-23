/**
 * Full-body walking character, composited from Liberated Pixel Cup (LPC) layer
 * sprites in public/character/ — CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0, see
 * public/character/CREDITS.md. Each layer PNG holds the walk cycle only
 * (4 directions x 9 frames, 64px cells), cropped from the full LPC sheet.
 */
import type { CharacterOptions } from "@/lib/database.types";

export const SKIN_OPTIONS: CharacterOptions["skin"][] = ["light", "amber", "brown"];
export const HAIR_OPTIONS: CharacterOptions["hair"][] = ["messy", "parted_side_bangs", "swoop_side"];
export const OUTFIT_COLOR_OPTIONS: CharacterOptions["outfitColor"][] = ["blue", "red", "green"];
export const HAT_OPTIONS: CharacterOptions["hat"][] = [null, "hairtie", "thick"];

export const HAIR_LABEL: Record<CharacterOptions["hair"], string> = {
  messy: "ยุ่ง",
  parted_side_bangs: "แสกข้าง",
  swoop_side: "ปัดข้าง",
};

export const HAT_LABEL: Record<NonNullable<CharacterOptions["hat"]>, string> = {
  hairtie: "ผ้าคาดผม",
  thick: "ผ้าคาดหนา",
};

export const SKIN_SWATCH: Record<CharacterOptions["skin"], string> = {
  light: "#f2cba0",
  amber: "#d9a066",
  brown: "#8a5a35",
};

export const OUTFIT_SWATCH: Record<CharacterOptions["outfitColor"], string> = {
  blue: "#3b6ea5",
  red: "#a53b3b",
  green: "#3b8a4e",
};

const HAIR_FILE: Record<CharacterOptions["hair"], string> = {
  messy: "hair_messy_brown.png",
  parted_side_bangs: "hair_partedsidebangs_black.png",
  swoop_side: "hair_swoopside_blonde.png",
};

const HAT_FILE: Record<NonNullable<CharacterOptions["hat"]>, string> = {
  hairtie: "hat_hairtie_red.png",
  thick: "hat_thick_blue.png",
};

export const DEFAULT_CHARACTER_OPTIONS: CharacterOptions = {
  skin: "light",
  hair: "messy",
  outfitColor: "blue",
  hat: null,
};

export function randomCharacterOptions(): CharacterOptions {
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]!;
  return {
    skin: pick(SKIN_OPTIONS),
    hair: pick(HAIR_OPTIONS),
    outfitColor: pick(OUTFIT_COLOR_OPTIONS),
    hat: pick(HAT_OPTIONS),
  };
}

/** Draw order low to high, matching each layer's zPos in the LPC sheet definitions. */
function layerFiles(opts: CharacterOptions): string[] {
  const files = [
    `body_${opts.skin}.png`,
    "legs_blue.png",
    `torso_${opts.outfitColor}.png`,
    `head_${opts.skin}.png`,
    HAIR_FILE[opts.hair],
  ];
  if (opts.hat) files.push(HAT_FILE[opts.hat]);
  return files;
}

export const CELL = 64;
export const FRAMES_PER_DIRECTION = 9;
export type WalkDirection = "up" | "left" | "down" | "right";
const DIRECTION_ROW: Record<WalkDirection, number> = { up: 0, left: 1, down: 2, right: 3 };

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let entry = imageCache.get(src);
  if (!entry) {
    entry = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    imageCache.set(src, entry);
  }
  return entry;
}

/** Composites all layers for one direction's 9-frame walk strip onto an offscreen canvas. */
async function renderWalkStrip(opts: CharacterOptions, direction: WalkDirection): Promise<HTMLCanvasElement> {
  const images = await Promise.all(layerFiles(opts).map((f) => loadImage(`/character/${f}`)));
  const row = DIRECTION_ROW[direction];
  const canvas = document.createElement("canvas");
  canvas.width = CELL * FRAMES_PER_DIRECTION;
  canvas.height = CELL;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (const img of images) {
    ctx.drawImage(img, 0, row * CELL, canvas.width, CELL, 0, 0, canvas.width, CELL);
  }
  return canvas;
}

const stripCache = new Map<string, Promise<HTMLCanvasElement>>();
function optionsKey(opts: CharacterOptions, direction: WalkDirection) {
  return `${opts.skin}|${opts.hair}|${opts.outfitColor}|${opts.hat ?? "none"}|${direction}`;
}

/** Cached per options+direction — re-walks of the same outfit reuse the composited strip. */
export function getWalkStrip(opts: CharacterOptions, direction: WalkDirection): Promise<HTMLCanvasElement> {
  const key = optionsKey(opts, direction);
  let entry = stripCache.get(key);
  if (!entry) {
    entry = renderWalkStrip(opts, direction);
    stripCache.set(key, entry);
  }
  return entry;
}

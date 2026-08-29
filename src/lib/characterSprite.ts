/**
 * Walking character sprite, picked from the Ninja Adventure Asset Pack
 * (CC0, pixel-boy/AAA — see public/ninja/README.md). Each character's
 * walk.png is a 64x64 sheet: 4 cols (down/up/left/right) x 4 frames, 16px cells.
 */
import type { CharacterOptions } from "@/lib/database.types";

export const CHARACTER_IDS = [
  "Boy", "CamouflageGreen", "CamouflageRed", "CaveLion", "CaveLion2", "Cavegirl", "Cavegirl2",
  "Caveman", "Caveman2", "DemonGreen", "DemonRed", "EggBoy", "EggGirl", "Eskimo", "FighterRed",
  "FighterWhite", "Flam", "GladiatorBlue", "GoldStatue", "GreenPig", "Hunter", "Inspector",
  "Knight", "KnightGold", "Lion", "LionBoy", "LionOrange", "LionYellow", "ManGreen", "MaskFrog",
  "MaskGoldRacoon", "MaskRacoon", "Master", "Monk", "Monk2", "Monkey", "MonkeyBoxerBlue",
  "MonkeyBoxerRed", "NinjaBlue", "NinjaBlue2", "NinjaBomb", "NinjaDark", "NinjaEskimo",
  "NinjaFire", "NinjaGray", "NinjaGreen", "NinjaLeaf", "NinjaMageBlack", "NinjaMageOrange",
  "NinjaMasked", "NinjaRed", "NinjaRed2", "NinjaThunder", "NinjaWater", "NinjaYellow", "Noble",
  "OldMan", "OldMan2", "OldMan3", "Pig", "Princess", "RedGladiator", "RedNinja3",
  "RobotCamouflage", "RobotGreen", "RobotGrey", "Samurai", "SamuraiBlue", "SamuraiRed", "Shaman",
  "ShamanLion", "Skeleton", "SkeletonDemon", "SorcererBlack", "SorcererOrange", "Spirit",
  "Statue", "Sultan", "Sultan2", "Tengu", "Tengu2", "Vampire", "Village6", "Villager",
  "Villager2", "Villager3", "Villager4", "Villager5", "Villager6", "Woman",
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export const DEFAULT_CHARACTER_OPTIONS: CharacterOptions = { characterId: "NinjaGreen" };

export function randomCharacterOptions(): CharacterOptions {
  return { characterId: CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)]! };
}

export const CELL = 16;
export const FRAMES_PER_DIRECTION = 4;
export type WalkDirection = "up" | "left" | "down" | "right";
const DIRECTION_COL: Record<WalkDirection, number> = { down: 0, up: 1, left: 2, right: 3 };

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

/** Slices one direction's 4-frame walk strip out of the character's sheet onto an offscreen canvas. */
async function renderWalkStrip(opts: CharacterOptions, direction: WalkDirection): Promise<HTMLCanvasElement> {
  const sheet = await loadImage(`/ninja/characters/${opts.characterId}/walk.png`);
  const col = DIRECTION_COL[direction];
  const canvas = document.createElement("canvas");
  canvas.width = CELL * FRAMES_PER_DIRECTION;
  canvas.height = CELL;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let frame = 0; frame < FRAMES_PER_DIRECTION; frame++) {
    ctx.drawImage(sheet, col * CELL, frame * CELL, CELL, CELL, frame * CELL, 0, CELL, CELL);
  }
  return canvas;
}

const stripCache = new Map<string, Promise<HTMLCanvasElement>>();

/** Cached per character+direction — re-walks of the same character reuse the sliced strip. */
export function getWalkStrip(opts: CharacterOptions, direction: WalkDirection): Promise<HTMLCanvasElement> {
  const key = `${opts.characterId}|${direction}`;
  let entry = stripCache.get(key);
  if (!entry) {
    entry = renderWalkStrip(opts, direction);
    stripCache.set(key, entry);
  }
  return entry;
}

/** Presets for the character-avatar builder (Profile page) — simple flat SVG, no external art assets. */

export const SKIN_TONES = ["#F5D0A9", "#E8B589", "#C68642", "#8D5524", "#5A3825"] as const;
export const HAIR_COLORS = ["#2B2118", "#6B4423", "#B87333", "#E8C547", "#7A7A7A", "#D64545"] as const;
export const BG_COLORS = ["#DDEBF7", "#FDE8D7", "#E3F2E1", "#F3E1F5", "#FFF3C4", "#E1E8F5"] as const;
export const HAIR_STYLES = ["short", "bowl", "spiky", "long", "bald"] as const;

export type CharacterAvatar = {
  skin: string;
  hairColor: string;
  hairStyle: (typeof HAIR_STYLES)[number];
  bg: string;
};

export function randomCharacterAvatar(): CharacterAvatar {
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]!;
  return {
    skin: pick(SKIN_TONES),
    hairColor: pick(HAIR_COLORS),
    hairStyle: pick(HAIR_STYLES),
    bg: pick(BG_COLORS),
  };
}

function hair(style: CharacterAvatar["hairStyle"], color: string): string {
  switch (style) {
    case "bald":
      return "";
    case "bowl":
      return `<path d="M28 46a36 36 0 0 1 72 0v6H28z" fill="${color}"/>`;
    case "spiky":
      return `<path d="M26 48c2-22 16-34 38-34s36 12 38 34c-4-6-10-6-13 0-3-8-9-8-12 0-3-9-10-9-13 0-3-9-10-9-13 0-3-8-9-8-12 0-3-6-9-6-13 0z" fill="${color}"/>`;
    case "long":
      return `<path d="M26 50c-2-26 14-38 38-38s40 12 38 38l-6 40h-10V54c0-4-3-6-6-4l-2 36h-10l-2-40c0-4-6-4-6 0l-2 40H58l-2-36c-3-2-6 0-6 4v36H40z" fill="${color}"/>`;
    case "short":
    default:
      return `<path d="M27 47a37 37 0 0 1 74 0v4c-6-10-16-16-37-16s-31 6-37 16z" fill="${color}"/>`;
  }
}

/** Renders a self-contained 256x256 SVG string for the given options — becomes the uploaded avatar image. */
export function renderCharacterAvatarSvg(opts: CharacterAvatar): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
  <rect width="128" height="128" fill="${opts.bg}"/>
  <circle cx="64" cy="70" r="38" fill="${opts.skin}"/>
  <circle cx="50" cy="68" r="4" fill="#2B2118"/>
  <circle cx="78" cy="68" r="4" fill="#2B2118"/>
  <path d="M50 86q14 12 28 0" stroke="#8A5A3C" stroke-width="3" fill="none" stroke-linecap="round"/>
  ${hair(opts.hairStyle, opts.hairColor)}
</svg>`;
}

export function characterAvatarToFile(opts: CharacterAvatar): File {
  const svg = renderCharacterAvatarSvg(opts);
  return new File([svg], "avatar.svg", { type: "image/svg+xml" });
}

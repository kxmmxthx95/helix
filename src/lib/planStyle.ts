import type { ComponentType } from "react";
import {
  BookIcon,
  BrushIcon,
  FlaskIcon,
  FormulaIcon,
  GlobeIcon,
  HeartIcon,
  LanguageIcon,
  LaptopIcon,
  LeafIcon,
  MusicIcon,
  PeopleIcon,
  PlanetIcon,
  SportIcon,
} from "@/components/icons";
import { subjectShade, type AreaHue } from "@/lib/subjectColor";

// ผังการเรียน tile style: colour reuses the subject-colour hues, icon is a small fixed set.
// Keys are stored in plan_subjects.color / .icon (CHECK constraints in migration 0092).

export const PLAN_HUES: AreaHue[] = ["rose", "blue", "emerald", "amber", "orange", "violet", "cyan", "pink", "slate"];

export const PLAN_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  book: BookIcon,
  flask: FlaskIcon,
  calculator: FormulaIcon,
  globe: GlobeIcon,
  language: LanguageIcon,
  music: MusicIcon,
  brush: BrushIcon,
  sport: SportIcon,
  laptop: LaptopIcon,
  leaf: LeafIcon,
  planet: PlanetIcon,
  people: PeopleIcon,
  heart: HeartIcon,
};

export const DEFAULT_TILE = "bg-muted";

export const planTileClass = (color: string | null) =>
  PLAN_HUES.includes(color as AreaHue) ? subjectShade(color as AreaHue, 1) : DEFAULT_TILE;

export const planIconFor = (icon: string | null) => PLAN_ICONS[icon ?? ""] ?? BookIcon;

import { useCallback, useState } from "react";

export type SceneMode = "rich" | "lite";
type Env = { webgl: boolean; memoryGb?: number; cores?: number; reducedMotion: boolean };

/** Lite when the device can't (WebGL) or probably shouldn't (low RAM/CPU, reduced motion) run the 3D scene. */
export function autoSceneMode(e: Env): SceneMode {
  if (!e.webgl || e.reducedMotion) return "lite";
  if (e.memoryGb !== undefined && e.memoryGb <= 4) return "lite";
  if (e.cores !== undefined && e.cores <= 4) return "lite";
  return "rich";
}

function readEnv(): Env {
  let webgl = false;
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number }; // Chromium only — undefined elsewhere (Safari/Firefox)
  return { webgl, memoryGb: nav.deviceMemory, cores: nav.hardwareConcurrency, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches };
}

const KEY = "helix:scene-mode";
let env: Env | null = null;

/** Auto-detected mode, overridable by the student (remembered on this device). */
export function useSceneMode() {
  env ??= readEnv();
  const [saved, setSaved] = useState<SceneMode | null>(() => {
    try {
      const v = localStorage.getItem(KEY);
      return v === "rich" || v === "lite" ? v : null;
    } catch {
      return null;
    }
  });
  const canRich = env.webgl;
  const mode: SceneMode = canRich ? (saved ?? autoSceneMode(env)) : "lite";
  const toggle = useCallback(() => {
    const next: SceneMode = mode === "rich" ? "lite" : "rich";
    setSaved(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode — the choice just won't persist */
    }
  }, [mode]);
  return { mode, canRich, toggle };
}

/** Scene themes a subject can pick (subjects.scene_theme, migration 0137). Add a key here + a scene in SubjectScene to offer a new one. */
export const SCENE_THEMES: Record<string, { label: string }> = {
  forest: { label: "ป่าเรืองแสง" },
};
export const DEFAULT_SCENE_THEME = "forest";

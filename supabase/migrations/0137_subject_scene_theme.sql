-- Scene theme for the student's stage-map (rich mode). Key into SCENE_THEMES in src/components/scene/themes.ts.
-- Written by admins through the existing subjects_write policy (0007).
alter table subjects add column scene_theme text not null default 'forest';

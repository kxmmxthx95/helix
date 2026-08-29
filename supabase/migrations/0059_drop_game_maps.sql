-- The web scene editor (migrations 0057/0058) is replaced by a Godot HTML5
-- export embedded directly on the dashboard (assets-src/GodotProject, grill
-- decision) — no DB-backed map data needed any more.
drop table if exists game_map_obstacles;
drop table if exists game_maps;
drop function if exists enforce_single_active_game_map();

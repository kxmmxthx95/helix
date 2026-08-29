-- Lets the game editor place more than one prop type per cell (was
-- log_post-only). Sprite files live at public/ninja/tiles/<sprite>.png.
alter table game_map_obstacles
  add column sprite text not null default 'log_post'
  check (sprite in ('log_post', 'barrel', 'crate', 'bookshelf'));

-- Game editor: super_admin authors walkable scenes shown on the student
-- dashboard (replaces the single hardcoded TrainingGroundScene layout).
-- Ground/wall are flat colors, not tile images — the Ninja Adventure Asset
-- Pack ships no flat-repeat tile (only autotile borders / whole-building
-- sprites), same reasoning as the original training-ground scene.
create table game_maps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cols smallint not null check (cols between 4 and 40),
  rows smallint not null check (rows between 4 and 40),
  ground_color text not null default '#adbc3a',
  wall_color text not null default '#4a2f1c',
  -- Exactly one map is shown on the student dashboard at a time.
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Obstacle footprint is always 1x1 (grid-toggle editor, see grill decision) —
-- no w/h columns until a real need for bigger props shows up.
create table game_map_obstacles (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references game_maps(id) on delete cascade,
  x smallint not null,
  y smallint not null,
  unique (map_id, x, y)
);

create trigger game_maps_touch before update on game_maps
  for each row execute function touch_updated_at();

-- Only one active map system-wide: clear the others whenever one is set active.
create or replace function enforce_single_active_game_map() returns trigger
  language plpgsql as $$
begin
  if new.is_active then
    update game_maps set is_active = false where id != new.id and is_active;
  end if;
  return new;
end $$;

create trigger game_maps_single_active before insert or update on game_maps
  for each row execute function enforce_single_active_game_map();

alter table game_maps           enable row level security;
alter table game_map_obstacles  enable row level security;

-- Readable by every signed-in user (it's what renders on their dashboard);
-- only super_admin authors it, reusing can_manage_users() from migration 0001.
create policy game_maps_read on game_maps
  for select to authenticated using (true);
create policy game_maps_write on game_maps
  for all to authenticated using (can_manage_users()) with check (can_manage_users());

create policy game_map_obstacles_read on game_map_obstacles
  for select to authenticated using (true);
create policy game_map_obstacles_write on game_map_obstacles
  for all to authenticated using (can_manage_users()) with check (can_manage_users());

-- Seed the original hardcoded training-ground layout as the active map, so
-- the student dashboard keeps working as-is after this migration.
insert into game_maps (name, cols, rows, is_active)
values ('สนามฝึกนินจา', 14, 10, true);

insert into game_map_obstacles (map_id, x, y)
select id, x, y from game_maps, (values (2,3),(3,3),(6,3),(7,3),(10,3),(11,3),(2,6),(3,6),(6,6),(7,6),(10,6),(11,6)) as t(x,y)
where game_maps.name = 'สนามฝึกนินจา';

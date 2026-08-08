-- learning_areas is a lookup table specifically so a school can add rows
-- like this later — see 0004.
insert into learning_areas (code, name) values ('other', 'อื่นๆ')
on conflict (code) do nothing;

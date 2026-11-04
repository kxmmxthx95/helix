-- Student photos live at students.avatar_path (students/<id>), but most pages show the linked login's
-- profiles.avatar_path. Point the login at the roster photo so they agree (roster photo wins on conflict).
update profiles p
set avatar_path = s.avatar_path
from students s
where s.profile_id = p.id
  and s.avatar_path is not null
  and p.avatar_path is distinct from s.avatar_path;

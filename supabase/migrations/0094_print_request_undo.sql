-- รายการพิมพ์: allow undoing "พิมพ์แล้ว" (printed -> pending). The partial unique index still
-- stops a second pending request for the same file.
create or replace function doc_print_requests_before() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select s.department_id into new.department_id
      from doc_files f
      join doc_lessons l on l.id = f.lesson_id
      join subjects s on s.id = l.subject_id
      where f.id = new.doc_file_id;
    new.status := 'pending';
    new.printed_by := null;
    new.printed_at := null;
  else
    if new.status <> old.status then
      if new.status = 'printed' then
        new.printed_by := auth.uid();
        new.printed_at := now();
      else
        new.printed_by := null;
        new.printed_at := null;
      end if;
    end if;
    -- identity columns never change.
    new.doc_file_id := old.doc_file_id;
    new.department_id := old.department_id;
    new.requested_by := old.requested_by;
  end if;
  return new;
end;
$$;

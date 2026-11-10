-- Verifies 0139 + 0150 against a real project; every write rolls back. NOT run in CI —
-- execute manually against the verified Helix project after applying 0139/0150.
begin;
do $$
declare
  owner_id uuid; cover_id uuid; room uuid; leave_id uuid; cov uuid; n int; d date := current_date;
begin
  select cht.teacher_id, cht.classroom_id into strict owner_id, room
    from classroom_homeroom_teachers cht limit 1;
  select pr.profile_id into strict cover_id from profile_roles pr
    where pr.role = 'teacher' and pr.profile_id <> owner_id limit 1;
  insert into leave_requests (profile_id, leave_type_id, start_date, end_date, reason)
    select owner_id, id, d, d, 'test' from leave_types limit 1 returning id into leave_id;

  -- owner proposes (pending leave allowed)
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  insert into attendance_covers (leave_request_id, date, classroom_id, cover_staff_id, proposed_by)
    values (leave_id, d, room, cover_id, owner_id) returning id into cov;

  -- request -> LINE to the cover (0139)
  reset role;
  select count(*) into n from line_notifications
    where profile_id = cover_id and message like 'มีการขอให้คุณเช็คชื่อแทน%' and created_at >= now() - interval '1 minute';
  if n < 1 then raise exception 'no LINE to cover on request'; end if;

  -- cover cannot write attendance while leave is still pending / cover unconfirmed
  perform set_config('request.jwt.claim.sub', cover_id::text, true);
  set local role authenticated;
  update attendance_covers set status = 'confirmed' where id = cov;
  if has_cover_for_classroom(room, d) then raise exception 'cover active before leave approved'; end if;

  -- confirm -> LINE back to the requester (0150)
  reset role;
  select count(*) into n from line_notifications
    where profile_id = owner_id and message like '%รับเช็คชื่อแทน%แล้ว%' and created_at >= now() - interval '1 minute';
  if n < 1 then raise exception 'no LINE to requester on confirm'; end if;
  perform set_config('request.jwt.claim.sub', cover_id::text, true);
  set local role authenticated;

  -- approve leave -> cover becomes effective; a different date stays denied
  reset role;
  update leave_requests set status = 'approved' where id = leave_id;
  perform set_config('request.jwt.claim.sub', cover_id::text, true);
  set local role authenticated;
  if not has_cover_for_classroom(room, d) then raise exception 'cover not active after approval'; end if;
  if has_cover_for_classroom(room, d + 1) then raise exception 'cover leaked to other date'; end if;

  -- rejecting/cancelling the leave auto-cancels the cover
  reset role;
  update leave_requests set status = 'cancelled' where id = leave_id;
  select count(*) into n from attendance_covers where id = cov and status = 'cancelled';
  if n <> 1 then raise exception 'cover not cancelled with leave'; end if;
end $$;
rollback;

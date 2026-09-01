-- เวรประจำ (fixed daily duty) — grill decision 2026-09-01: a duty point can
-- opt into "ประจำ" mode, one teacher covers it every school day (Mon-Fri)
-- indefinitely instead of a manager assigning it manually each day. No
-- duty_assignments row is created for a fixed point's normal days — only
-- exceptions (a manager override, or a teacher's own transfer request) get a
-- real row. See expandFixedDutyAssignments() in useDutyRoster.ts, which fills
-- the non-exception days back in on the client for "เวรของฉัน"/summary.

alter table duty_points
  add column mode text not null default 'rotating' check (mode in ('rotating', 'fixed')),
  add column fixed_staff_id uuid references profiles on delete restrict;

alter table duty_points
  add constraint duty_points_fixed_staff_required
  check (mode = 'rotating' or fixed_staff_id is not null);

-- The fixed teacher of a point needs to see exceptions on it (a manager
-- override, or their own past requests) even on days the row's staff_id
-- isn't them any more — otherwise "เวรของฉัน" can't tell a normal fixed day
-- from one that's been handed to someone else. Narrow: only rows on a point
-- you're the designated fixed_staff_id for, nothing about anyone else's
-- unrelated duty.
drop policy duty_assignments_read on duty_assignments;
create policy duty_assignments_read on duty_assignments
  for select to authenticated using (
    staff_id = auth.uid()
    or duty_point_id in (select id from duty_points where fixed_staff_id = auth.uid())
    or (can_manage() and (is_org_wide() or staff_id in (
      select id from profiles where department_id = auth_department()
    )))
  );

-- Extend the transfer-request insert check (0063) with a second path: a
-- fixed-duty teacher can request a transfer for a day that has no
-- duty_assignments row yet, by sending duty_point_id + date instead of
-- assignment_id. security definer so it can materialize that row even
-- though duty_assignments_write is manager-only — the checks below are the
-- actual authorization, not the table's RLS.
create or replace function check_duty_transfer_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid;
  v_mode text;
  v_fixed_staff_id uuid;
begin
  if new.assignment_id is not null then
    select staff_id, duty_point_id, date into v_staff_id, new.duty_point_id, new.date
    from duty_assignments where id = new.assignment_id;

    if v_staff_id is distinct from new.requester_id then
      raise exception 'เวรนี้ไม่ได้เป็นของคุณ';
    end if;

    return new;
  end if;

  if new.duty_point_id is null or new.date is null then
    raise exception 'ต้องระบุจุดเวรและวันที่';
  end if;

  select mode, fixed_staff_id into v_mode, v_fixed_staff_id
  from duty_points where id = new.duty_point_id;

  if v_mode is distinct from 'fixed' or v_fixed_staff_id is distinct from new.requester_id then
    raise exception 'เวรนี้ไม่ได้เป็นของคุณ';
  end if;

  insert into duty_assignments (duty_point_id, staff_id, date, created_by)
  values (new.duty_point_id, new.requester_id, new.date, new.requester_id)
  on conflict (duty_point_id, staff_id, date) do nothing
  returning id into new.assignment_id;

  if new.assignment_id is null then
    select id into new.assignment_id from duty_assignments
    where duty_point_id = new.duty_point_id and staff_id = new.requester_id and date = new.date;
  end if;

  return new;
end $$;

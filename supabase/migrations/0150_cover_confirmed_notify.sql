-- ครูแทนกดรับเช็คชื่อแทน -> LINE กลับไปหาครูที่ร้องขอ (เจ้าของใบลา + ผู้เสนอถ้าเป็นคนละคน)
-- ส่วนอื่นของ notify_attendance_cover คงเดิมจาก 0139 (ขอ=INSERT, ปฏิเสธ)
create or replace function notify_attendance_cover() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_name text;
  v_cover text;
begin
  select lr.profile_id, p.first_name || ' ' || p.last_name into v_owner, v_name
  from leave_requests lr join profiles p on p.id = lr.profile_id where lr.id = new.leave_request_id;

  if tg_op = 'INSERT' then
    insert into line_notifications (profile_id, message) values (
      new.cover_staff_id,
      'มีการขอให้คุณเช็คชื่อแทน ' || v_name || ': ' || cover_label(new.classroom_id, new.schedule_entry_id) ||
        ' วันที่ ' || to_char(new.date, 'DD/MM/YYYY') || ' กรุณายืนยันในระบบ');
  elsif new.status = 'declined' and old.status = 'pending' then
    insert into line_notifications (profile_id, message)
    select distinct r.pid,
      'ครูแทนปฏิเสธการเช็คชื่อแทน ' || v_name || ': ' || cover_label(new.classroom_id, new.schedule_entry_id) ||
        ' วันที่ ' || to_char(new.date, 'DD/MM/YYYY') || ' กรุณาหาคนใหม่'
    from (
      select v_owner as pid
      union select pr.profile_id from profile_roles pr where pr.role in ('super_admin', 'director', 'staff')
    ) r;
  elsif new.status = 'confirmed' and old.status = 'pending' then
    select first_name || ' ' || last_name into v_cover from profiles where id = new.cover_staff_id;
    insert into line_notifications (profile_id, message)
    select distinct r.pid,
      v_cover || ' รับเช็คชื่อแทน ' || v_name || ' แล้ว: ' || cover_label(new.classroom_id, new.schedule_entry_id) ||
        ' วันที่ ' || to_char(new.date, 'DD/MM/YYYY')
    from (select v_owner as pid union select new.proposed_by) r;
  end if;
  return new;
end $$;

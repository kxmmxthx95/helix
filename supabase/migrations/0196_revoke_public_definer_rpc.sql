-- 0195 revoked the explicit anon grant, but Postgres also gives EXECUTE to PUBLIC by default and
-- these functions had no REVOKE FROM PUBLIC, so anon still ran them. Revoke PUBLIC too. Every one
-- already has an explicit grant to authenticated and service_role, so signed-in callers are unaffected.

revoke execute on function public.attendance_duties(uuid, date) from public;
revoke execute on function public.auto_clock_out_open_records() from public;
revoke execute on function public.cover_label(uuid, uuid) from public;
revoke execute on function public.cover_sees_student(uuid) from public;
revoke execute on function public.current_student_classroom(uuid) from public;
revoke execute on function public.doc_task_targets(uuid, uuid) from public;
revoke execute on function public.enqueue_attendance_digests() from public;
revoke execute on function public.enqueue_clock_in_reminders() from public;
revoke execute on function public.enqueue_cover_digests() from public;
revoke execute on function public.enqueue_due_assignment_notifications() from public;
revoke execute on function public.exam_attempt_held(uuid) from public;
revoke execute on function public.exam_session_approved(uuid) from public;
revoke execute on function public.leave_summary(public.leave_requests) from public;
revoke execute on function public.notify_leave_approvers(uuid, text) from public;
revoke execute on function public.notify_student_leave_homeroom(uuid, text) from public;
revoke execute on function public.plan_topic_fits_subject(uuid, uuid) from public;
revoke execute on function public.staff_daily_status(date) from public;
revoke execute on function public.teaching_assignment_term_open(uuid) from public;

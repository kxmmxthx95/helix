-- anon can call SECURITY DEFINER functions over RPC, which bypass RLS. These 18 have no
-- auth.uid() / role check, so anyone with the anon key could run them: some insert LINE
-- notifications (notify_leave_approvers, notify_student_leave_homeroom, enqueue_*), one
-- clocks out open time records (auto_clock_out_open_records), others return rows for any id.
-- Callers: the app calls attendance_duties while signed in; cron jobs and triggers run as
-- postgres or service_role, which keep their rights. Only anon loses execute here.
-- Reversible: `grant execute on function ... to anon` per signature.

revoke execute on function public.attendance_duties(uuid, date) from anon;
revoke execute on function public.auto_clock_out_open_records() from anon;
revoke execute on function public.cover_label(uuid, uuid) from anon;
revoke execute on function public.cover_sees_student(uuid) from anon;
revoke execute on function public.current_student_classroom(uuid) from anon;
revoke execute on function public.doc_task_targets(uuid, uuid) from anon;
revoke execute on function public.enqueue_attendance_digests() from anon;
revoke execute on function public.enqueue_clock_in_reminders() from anon;
revoke execute on function public.enqueue_cover_digests() from anon;
revoke execute on function public.enqueue_due_assignment_notifications() from anon;
revoke execute on function public.exam_attempt_held(uuid) from anon;
revoke execute on function public.exam_session_approved(uuid) from anon;
revoke execute on function public.leave_summary(public.leave_requests) from anon;
revoke execute on function public.notify_leave_approvers(uuid, text) from anon;
revoke execute on function public.notify_student_leave_homeroom(uuid, text) from anon;
revoke execute on function public.plan_topic_fits_subject(uuid, uuid) from anon;
revoke execute on function public.staff_daily_status(date) from anon;
revoke execute on function public.teaching_assignment_term_open(uuid) from anon;

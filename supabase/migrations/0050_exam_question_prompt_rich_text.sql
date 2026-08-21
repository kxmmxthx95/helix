-- โจทย์ becomes rich text (Plate.js JSON) — bold/underline/list/KaTeX
-- formula/image, needed everywhere a question prompt renders including the
-- live exam-taking screen (grill decision, 2026-08-21). prompt stays as an
-- app-derived plaintext copy (search-index/preview use only — the exam-bank
-- table row and the session-builder picker) rather than being replaced, so
-- those two read sites don't need to mount a Plate renderer for one
-- truncated line.

alter table exam_questions
  add column prompt_json jsonb not null default '[{"type":"p","children":[{"text":""}]}]'::jsonb;

-- exam_questions_for_attempt is an explicit column allowlist (0047) — the
-- exam-taking client won't receive prompt_json unless it's listed here too.
create or replace view exam_questions_for_attempt with (security_barrier) as
  select id, subject_id, question_type, prompt, points, created_by, created_at, updated_at, prompt_json
  from exam_questions;

-- Public bucket, same shape as avatars (0024) — question images render live
-- during a timed exam, a per-request signed-URL round trip is bad UX there,
-- and access to the question itself is already gated by can_read_exam_question
-- on the exam_questions row; the bucket only needs unguessable (uuid) paths.
insert into storage.buckets (id, name, public)
values ('exam-question-images', 'exam-question-images', true)
on conflict (id) do nothing;

-- Path: ${question_id}/${uuid}.${ext}
create policy exam_question_images_read on storage.objects
  for select using (bucket_id = 'exam-question-images');

create policy exam_question_images_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'exam-question-images' and exists (
      select 1 from exam_questions q
      where q.id = (storage.foldername(name))[1]::uuid
        and can_write_exam_subject(q.subject_id)
    )
  );
create policy exam_question_images_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'exam-question-images' and exists (
      select 1 from exam_questions q
      where q.id = (storage.foldername(name))[1]::uuid
        and can_write_exam_subject(q.subject_id)
    )
  );

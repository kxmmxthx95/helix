import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Collapse } from "@/components/Collapse";
import { useToast } from "@/components/Toast";
import { Field, Select } from "@/components/ui";
import { useAddSessionQuestion, useSessionSets, useTopicSetsTopics } from "@/hooks/useExams";
import type { ExamSession } from "@/lib/database.types";
import { QuestionForm, useQuestionForm } from "@/routes/ExamBank";

/** "เพิ่มข้อสอบ" form of a room. Loaded on demand: it carries the whole question editor (rich text, formulas). */
export default function AddSessionQuestionPanel({ session, open, practice }: { session: ExamSession; open: boolean; practice?: boolean }) {
  const { profile } = useAuth();
  const add = useAddSessionQuestion();
  const toast = useToast();
  // The DB only accepts room questions tagged with a topic of the room's sets (check_exam_session_question_topic).
  const { data: roomSets } = useSessionSets([session.id]);
  const { data: topicsBySet } = useTopicSetsTopics((roomSets?.get(session.id) ?? []).map((x) => x.topic_set_id));
  const topics = [...new Map([...(topicsBySet?.values() ?? [])].flat().map((t) => [t.topic_id, t])).values()];
  const [pickedLesson, setPickedLesson] = useState("");
  const [picked, setPicked] = useState("");
  const lessons = [...new Set(topics.map((t) => t.lesson))];
  const lesson = lessons.includes(pickedLesson) ? pickedLesson : "";
  const lessonTopics = topics.filter((t) => t.lesson === lesson);
  // Nothing is preselected when there is a choice; a lone topic is used as is.
  const topicId = lessonTopics.some((t) => t.topic_id === picked) ? picked : topics.length === 1 ? (topics[0]?.topic_id ?? null) : null;
  const form = useQuestionForm({
    subjectId: session.subject_id,
    planTopicId: topicId,
    teacherId: profile?.id ?? session.teacher_id,
    question: null,
    onSaved: (questionId) => add.mutate({ sessionId: session.id, questionId, practice }, { onError: (e) => toast(e.message || "เพิ่มข้อสอบเข้าห้องไม่สำเร็จ", "error") }),
  });
  return (
    <Collapse open={open}>
      <div className="border-t border-border bg-card p-3">
        {topics.length > 1 && (
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <Field label="บทเรียน">
              <Select value={lesson} placeholder="เลือกบทเรียน" onChange={(e) => setPickedLesson(e.target.value)}>
                {lessons.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="หัวข้อ">
              <Select value={topicId ?? ""} placeholder="เลือกหัวข้อ" disabled={!lesson} onChange={(e) => setPicked(e.target.value)}>
                {lessonTopics.map((t) => (
                  <option key={t.topic_id} value={t.topic_id}>{t.topic}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {topicId ? <QuestionForm form={form} hideTopic /> : <p className="text-xs text-muted-foreground">เลือกบทเรียนและหัวข้อก่อนเพิ่มข้อสอบ</p>}
      </div>
    </Collapse>
  );
}

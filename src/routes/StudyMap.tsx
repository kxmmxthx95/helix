import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Card, Select, Skeleton } from "@/components/ui";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { openDocFile, usePlanOutline, usePlanSubjects, type PlanLinkedFile } from "@/hooks/usePlan";
import { useDepartments } from "@/hooks/useProfiles";
import { useRenameStudyMap, useSaveMapAssignment, useStudyMapAssignment, useStudyMapLibrary, type StudyMapTemplate } from "@/hooks/useStudyMap";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { canManageUsers } from "@/lib/roles";

const ForestScene = lazy(() => import("@/components/StudyMap/ForestScene").then(m => ({ default: m.ForestScene })));
const button = "rounded-lg border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed";

// Mount nothing that can fetch until the direct-URL authorization check passes.
export function StudyMap() {
  const { profile } = useAuth();
  if (!profile) return null;
  if (!canManageUsers(profile.roles)) return <Card>ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  return <StudyMapContent />;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="p-6">ไม่สามารถแสดงภาพ 3D ได้ — เลือกบทเรียนจากรายการด้านล่าง</p> : this.props.children; }
}
/**
 * Map frame with a full-screen mode. The same elements are kept in place (only classes change) so the
 * 3D world is not rebuilt when toggling. Uses the native Fullscreen API when available and falls back
 * to a fixed overlay (iOS Safari, tests). `panel` is the lesson detail: beside the map normally, an
 * overlay (right on desktop, bottom on mobile) while full screen.
 */
function MapFrame({ children, panel }: { children: ReactNode; panel?: (full: boolean) => ReactNode }) {
  const [full, setFull] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFull(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    document.addEventListener("fullscreenchange", onChange); window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("fullscreenchange", onChange); window.removeEventListener("keydown", onKey); };
  }, []);
  useEffect(() => {
    if (!full) { if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {}); return; }
    const el = frame.current; const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    if (el && !document.fullscreenElement) void el.requestFullscreen?.().catch(() => {});
    return () => { document.body.style.overflow = prev; };
  }, [full]);
  return <div ref={frame} className={full ? "fixed inset-0 z-[100] flex bg-[#0d211d]" : "flex flex-col gap-3 lg:flex-row"}>
    <div className="relative min-w-0 flex-1">
      <div className={full ? "h-full w-full overflow-hidden" : "h-[calc(100vh-15rem)] min-h-[420px] overflow-hidden rounded-xl border"}>
        <SceneBoundary><Suspense fallback={<Skeleton className="h-full w-full" />}>{children}</Suspense></SceneBoundary>
      </div>
      <button type="button" aria-pressed={full} onClick={() => setFull(f => !f)} className="absolute right-3 top-3 z-20 rounded-full border border-[#c9e3c9]/70 bg-[#0d211d]/75 px-4 py-1.5 text-sm text-[#f3eedb] hover:bg-[#1d3a30]">
        {full ? "ออกจากเต็มจอ ✕" : "เต็มจอ ⤢"}
      </button>
    </div>
    {panel?.(full)}
  </div>;
}

function StudyMapContent() {
  const [tab, setTab] = useState("library");
  const library = useStudyMapLibrary();
  return <div className="space-y-4 pb-6">
    <div role="tablist" aria-label="แผนที่" className="flex gap-2">
      <button role="tab" aria-selected={tab === "library"} className={button} onClick={() => setTab("library")}>คลังแผนที่</button>
      <button role="tab" aria-selected={tab === "subjects"} className={button} onClick={() => setTab("subjects")}>รายวิชา</button>
    </div>
    {library.isLoading ? <Skeleton className="h-64" /> : library.error ? <p role="alert">โหลดคลังแผนที่ไม่สำเร็จ กรุณาลองใหม่ <button className={button} onClick={() => void library.refetch()}>ลองใหม่</button></p> : !library.data?.length ? <Card>ยังไม่มีแผนที่ในคลัง</Card> :
      <div role="tabpanel">{tab === "library" ? <LibraryMap key={library.data[0]!.id} map={library.data[0]!} /> : <Subjects maps={library.data} />}</div>}
  </div>;
}
function LibraryMap({ map }: { map: StudyMapTemplate }) {
  const [name, setName] = useState(map.name);
  const [message, setMessage] = useState("");
  const rename = useRenameStudyMap();
  return <div className="space-y-3">
    <MapFrame><ForestScene nodes={[]} selectedId={null} onSelect={() => {}} /></MapFrame>
    <form className="flex flex-wrap items-end gap-2" onSubmit={async e => {
      e.preventDefault(); setMessage("");
      try { await rename.mutateAsync({ id: map.id, name }); setMessage("บันทึกชื่อแล้ว"); }
      catch { setMessage("บันทึกชื่อไม่สำเร็จ กรุณาลองใหม่"); }
    }}>
      <label className="flex flex-col gap-1 text-sm">ชื่อแผนที่<input className="rounded-lg border bg-background px-3 py-2" value={name} maxLength={100} required onChange={e => setName(e.target.value)} /></label>
      <button className={button} disabled={rename.isPending || !name.trim() || name.trim() === map.name}>บันทึกชื่อ</button>
    </form>
    <p role="status" className="text-sm">{message}</p>
  </div>;
}
function Subjects({ maps }: { maps: StudyMapTemplate[] }) {
  const departments = useDepartments();
  const [dept, setDept] = useState("");
  const [subjectId, setSubject] = useState("");
  const [gradeId, setGrade] = useState("");
  const subjects = usePlanSubjects(dept || null);
  const grades = useGradeLevels(dept || null);
  const subject = subjects.data?.find(s => s.id === subjectId);
  return <div className="space-y-4">
    <Select aria-label="แผนก" placeholder="เลือกแผนก" value={dept} onChange={e => { setDept(e.target.value); setSubject(""); setGrade(""); }}>
      {departments.data?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
    </Select>
    {(departments.error || subjects.error || grades.error) && <p role="alert">โหลดรายวิชาหรือชั้นเรียนไม่สำเร็จ กรุณาโหลดหน้าใหม่</p>}
    {(departments.isLoading || (dept && (subjects.isLoading || grades.isLoading))) && <Skeleton className="h-32" />}
    {!dept ? <Card>เลือกแผนกเพื่อดูรายวิชา</Card> : !subject ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.data?.map(s => <button key={s.id} className="rounded-xl border p-5 text-left hover:bg-muted" onClick={() => {setSubject(s.id); setGrade("");}}><strong>{s.name}</strong><p className="mt-1 text-sm text-muted-foreground">เลือกชั้นเรียนและแผนที่</p></button>)}
      {subjects.data?.length === 0 && <Card>ยังไม่มีรายวิชาในผังการเรียน</Card>}
    </div> : <>
      <div className="flex flex-wrap items-center gap-2"><button className={button} onClick={() => {setSubject("");setGrade("");}}>กลับรายวิชา</button><h2 className="font-semibold">{subject.name}</h2></div>
      <div className="flex flex-wrap gap-2" aria-label="ชั้นเรียน">{grades.data?.map(g => <button key={g.id} aria-pressed={gradeId === g.id} className={`${button} ${gradeId === g.id ? "bg-muted font-semibold" : ""}`} onClick={() => setGrade(g.id)}>{gradeShortLabel(g.code)}</button>)}</div>
      {!grades.data?.length && !grades.isLoading && <p>ยังไม่มีชั้นเรียนในแผนกนี้</p>}
      {gradeId ? <SubjectMap key={`${subjectId}:${gradeId}`} subjectId={subjectId} gradeId={gradeId} maps={maps} /> : <p className="text-sm text-muted-foreground">เลือกชั้นเรียนเพื่อดูตัวอย่างแผนที่</p>}
    </>}
  </div>;
}
function SubjectMap({ subjectId, gradeId, maps }: { subjectId: string; gradeId: string; maps: StudyMapTemplate[] }) {
  const outline = usePlanOutline(subjectId);
  const assignment = useStudyMapAssignment(subjectId, gradeId);
  const save = useSaveMapAssignment();
  const [draft, setDraft] = useState<string | null>(null);
  const [selectedId, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const mapId = draft ?? assignment.data?.map_id ?? maps[0]!.id;
  // usePlanOutline already orders lessons and their topics; never persist duplicate stages.
  const lessons = (outline.data ?? []).filter(l => l.grade_level_id === gradeId);
  const selected = lessons.find(l => l.id === selectedId);
  if (assignment.isLoading || outline.isLoading) return <Skeleton className="h-64" />;
  if (assignment.error || outline.error) return <p role="alert">โหลดแผนที่หรือบทเรียนไม่สำเร็จ <button className={button} onClick={() => {void assignment.refetch();void outline.refetch();}}>ลองใหม่</button></p>;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="แผนที่สำหรับวิชาและชั้นนี้" className="w-auto" value={mapId} onChange={e => {setDraft(e.target.value);setMessage("");}}>{maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
      <button className={button} disabled={save.isPending || mapId === assignment.data?.map_id} onClick={async () => {
        setMessage("");
        try {await save.mutateAsync({plan_subject_id:subjectId,grade_level_id:gradeId,map_id:mapId});setMessage("บันทึกแผนที่แล้ว");}
        catch {setMessage("บันทึกแผนที่ไม่สำเร็จ กรุณาลองใหม่");}
      }}>{save.isPending ? "กำลังบันทึก…" : "บันทึกแผนที่"}</button>
      <span className="text-sm text-muted-foreground">{assignment.data ? "แผนที่ที่บันทึกไว้" : "ตัวอย่าง — ยังไม่ได้บันทึก"}</span>
    </div>
    <p role="status" className="text-sm">{message}</p>
    <p className="text-sm text-muted-foreground">กล้องคงที่ · เลือกด่านด้วยหมายเลข ปุ่มก่อนหน้า/ถัดไป หรือลูกศรซ้ายขวา แล้วกด “เปิดบทเรียน” · ทุกด่านเปิดดูได้</p>
    <MapFrame panel={full => selected ? <aside aria-label="รายละเอียดบทเรียน" className={full ? "absolute inset-x-3 bottom-24 z-20 max-h-[40%] overflow-auto rounded-xl border bg-card p-4 text-card-foreground shadow-xl sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-14 sm:max-h-none sm:w-80" : "max-h-[45vh] overflow-auto rounded-xl border bg-card p-4 lg:max-h-[calc(100vh-15rem)] lg:w-80 lg:shrink-0"}>
      <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{selected.name}</h3><button className={button} onClick={() => setSelected(null)} aria-label="ปิดรายละเอียด">ปิด</button></div>
      <LinkedFiles files={selected.files} />
      {!selected.topics.length ? <p className="mt-3 text-sm text-muted-foreground">ยังไม่มีหัวข้อ</p> : <ol className="mt-3 list-decimal space-y-3 pl-5">{selected.topics.map(t => <li key={t.id}>{t.name}<LinkedFiles files={t.files} /></li>)}</ol>}
    </aside> : null}>
      <ForestScene nodes={lessons.map(l => ({id:l.id,name:l.name}))} selectedId={selectedId} onSelect={setSelected} />
    </MapFrame>
    {!lessons.length ? <Card>ยังไม่มีบทเรียนในผังการเรียนสำหรับวิชาและชั้นนี้ เมื่อเพิ่มบทเรียน ด่านจะปรากฏอัตโนมัติ</Card> : <ol aria-label="ด่านบทเรียน" className="flex flex-wrap gap-2">{lessons.map((l,i) => <li key={l.id}><button className={button} aria-pressed={l.id === selectedId} onClick={() => setSelected(l.id)}>{i+1}. {l.name}</button></li>)}</ol>}
  </div>;
}
function LinkedFiles({ files }: { files: PlanLinkedFile[] }) {
  const [error, setError] = useState(false);
  return <div className="mt-2 space-y-1">
    {files.map(link => link.file ? <button key={link.linkId} className="block text-left text-sm underline underline-offset-2" onClick={async () => {
      setError(false);
      try {if (!await openDocFile(link.file!.file_path)) setError(true);} catch {setError(true);}
    }}>{link.file.title || link.file.file_name}</button> : <p key={link.linkId} className="text-sm text-muted-foreground">ไม่มีสิทธิ์อ่านไฟล์นี้หรือไฟล์ถูกลบแล้ว</p>)}
    {error && <p role="alert" className="text-sm text-destructive">เปิดไฟล์ไม่สำเร็จ กรุณาลองใหม่</p>}
  </div>;
}

import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useToast } from "@/components/Toast";
import { Avatar, Button, BuddhistDateSelect, Card, Field, Input, Spinner } from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { useLearningAreas } from "@/hooks/useCurriculum";
import { useAllGradeLevels } from "@/hooks/useCurriculumStructure";
import { avatarUrl, useUploadAvatar } from "@/hooks/useAvatar";
import { LINE_LINK_CODE_TTL_MINUTES, useGenerateLinkCode } from "@/hooks/useLineLink";
import { useDepartments, useUpdateMyProfile, type MyProfileEdit } from "@/hooks/useProfiles";
import { profileFullName } from "@/lib/database.types";
import { PREFIXES, roleLabels, STUDENT_PREFIXES } from "@/lib/roles";
import { PrefixNameFields } from "@/routes/Users";

function pickEditable(p: MyProfileEdit): MyProfileEdit {
  const { prefix, first_name, last_name, email, national_id, date_of_birth } = p;
  return { prefix, first_name, last_name, email, national_id, date_of_birth };
}

export function Profile() {
  const { profile, myStudent, refreshProfile } = useAuth();
  const toast = useToast();
  const { data: departments = [] } = useDepartments();
  const { data: gradeLevels = [] } = useAllGradeLevels();
  const { data: learningAreas = [] } = useLearningAreas();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const update = useUpdateMyProfile();

  const [draft, setDraft] = useState<MyProfileEdit | null>(null);

  if (!profile) return null;

  const current = draft ?? pickEditable(profile);
  const isStudent = profile.roles.includes("student");
  const isTeacher = profile.roles.includes("teacher");
  const department = departments.find((d) => d.id === profile.department_id);
  const gradeLevel = myStudent ? gradeLevels.find((g) => g.id === myStudent.grade_level_id) : undefined;
  const learningArea = learningAreas.find((a) => a.id === profile.learning_area_id);
  const dirty = draft !== null;

  function save() {
    if (!profile) return;
    update.mutate(
      { id: profile.id, ...current },
      {
        onSuccess: async () => {
          await refreshProfile();
          setDraft(null);
          toast("บันทึกข้อมูลสำเร็จ");
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card className="flex items-center gap-4">
        <AvatarUpload />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{profileFullName(profile)}</p>
          <p className="text-xs text-muted-foreground">{roleLabels(profile.roles)}</p>
        </div>
      </Card>

      <Card className="space-y-3">
        <PrefixNameFields
          prefix={current.prefix}
          firstName={current.first_name}
          lastName={current.last_name}
          prefixes={isStudent ? STUDENT_PREFIXES : PREFIXES}
          onChange={(patch) => setDraft({ ...current, ...patch })}
        />

        <Field label="อีเมล (ข้อมูลติดต่อ)">
          <Input
            type="email"
            value={current.email ?? ""}
            onChange={(e) => setDraft({ ...current, email: e.target.value || null })}
          />
        </Field>

        <Field label="เบอร์โทร (รหัสเข้าระบบ — แก้ไม่ได้)">
          <Input value={profile.phone ?? ""} disabled readOnly />
        </Field>

        <Field label="เลขบัตรประชาชน">
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={current.national_id ?? ""}
            onChange={(e) =>
              setDraft({ ...current, national_id: e.target.value.replace(/\D/g, "").slice(0, 13) || null })
            }
            pattern="[0-9]{13}"
            minLength={13}
            maxLength={13}
            title="เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก"
          />
        </Field>

        <Field label="วันเดือนปีเกิด">
          <BuddhistDateSelect
            value={current.date_of_birth ?? ""}
            onChange={(v) => setDraft({ ...current, date_of_birth: v || null })}
          />
        </Field>

        {department && (
          <Field label="แผนก">
            <Input value={department.name} disabled readOnly />
          </Field>
        )}

        <Button className="w-full" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
        </Button>
      </Card>

      <LineLinkCard />

      {isStudent && myStudent && (
        <Card className="space-y-2">
          <p className="text-sm font-semibold">ข้อมูลนักเรียน</p>
          <Field label="รหัสนักเรียน">
            <Input value={myStudent.student_code} disabled readOnly />
          </Field>
          <Field label="ระดับชั้น">
            <Input value={gradeLevel?.name ?? "—"} disabled readOnly />
          </Field>
        </Card>
      )}

      {isTeacher && (
        <Card className="space-y-2">
          <p className="text-sm font-semibold">ข้อมูลครูผู้สอน</p>
          <Field label="รหัสครู">
            <Input value={profile.teacher_code ?? "—"} disabled readOnly />
          </Field>
          <Field label="กลุ่มสาระการเรียนรู้">
            <Input value={learningArea?.name ?? "—"} disabled readOnly />
          </Field>
        </Card>
      )}

      {isParent && children.length > 0 && (
        <Card className="space-y-2">
          <p className="text-sm font-semibold">บุตรหลาน</p>
          <ul className="divide-y divide-border text-sm">
            {children.map((c) => (
              <li key={c.id} className="py-1.5">
                {c.first_name} {c.last_name} <span className="text-xs text-muted-foreground">({c.student_code})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * ผูกบัญชี LINE — the school's OA already has a Messaging API channel, so
 * linking happens by sending a one-time code as a chat message (see
 * supabase/functions/line-webhook) rather than an OAuth redirect. Status is
 * just profiles.line_user_id; "ตรวจสอบอีกครั้ง" re-pulls the profile since
 * the actual link only happens once the LINE message round-trips.
 */
function LineLinkCard() {
  const { profile, refreshProfile } = useAuth();
  const generate = useGenerateLinkCode();
  const [code, setCode] = useState<string | null>(null);

  if (!profile) return null;
  const linked = !!profile.line_user_id;

  return (
    <Card className="space-y-2">
      <p className="text-sm font-semibold">บัญชี LINE</p>
      {linked ? (
        <p className="text-sm text-success">ผูกบัญชีแล้ว</p>
      ) : code ? (
        <div className="space-y-2 text-sm">
          <p>
            ส่งข้อความ <span className="font-mono text-base font-semibold">{code}</span> ไปยัง LINE
            ทางการของโรงเรียน ภายใน {LINE_LINK_CODE_TTL_MINUTES} นาที
          </p>
          <Button variant="outline" size="sm" onClick={() => void refreshProfile()}>
            ตรวจสอบอีกครั้ง
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">ยังไม่ได้ผูกบัญชี — จะได้รับแจ้งเตือนงาน/คะแนนทาง LINE</p>
          <Button
            size="sm"
            disabled={generate.isPending}
            onClick={() => generate.mutate(profile.id, { onSuccess: setCode })}
          >
            {generate.isPending ? <Spinner className="h-3 w-3" /> : "สร้างรหัสผูกบัญชี"}
          </Button>
        </>
      )}
    </Card>
  );
}

/** Same self-upload flow as the sidebar avatar button (AppShell), duplicated here since this page needs its own file input + trigger. */
function AvatarUpload() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const uploadAvatar = useUploadAvatar();
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);

  if (!profile) return null;
  const src = avatarUrl(profile);

  async function onChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile) return;
    try {
      await uploadAvatar.mutateAsync({ file, profileId: profile.id });
      await refreshProfile();
    } catch {
      toast("อัปโหลดรูปไม่สำเร็จ", "error");
    }
  }

  return (
    <div>
      <button type="button" onClick={() => inputEl?.click()} title="เปลี่ยนรูปโปรไฟล์" className="rounded-full">
        <Avatar name={profileFullName(profile)} src={src} className="h-16 w-16 text-lg" />
      </button>
      <input ref={setInputEl} type="file" accept="image/*" className="hidden" onChange={onChosen} />
    </div>
  );
}

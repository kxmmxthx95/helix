import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { CameraIcon, Moon, Monitor, NotificationIcon, ProfileIcon, ShieldIcon, Sun } from "@/components/icons";
import { useTheme, type ThemePreference } from "@/components/ThemeProvider";
import { useToast } from "@/components/Toast";
import { Avatar, Button, BuddhistDateSelect, Field, Input, PasswordInput, Spinner } from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { useLearningAreas } from "@/hooks/useCurriculum";
import { useAllGradeLevels } from "@/hooks/useCurriculumStructure";
import { avatarUrl, useUploadAvatar } from "@/hooks/useAvatar";
import { LINE_LINK_CODE_TTL_MINUTES, useGenerateLinkCode } from "@/hooks/useLineLink";
import { useDepartments, useUpdateMyProfile, type MyProfileEdit } from "@/hooks/useProfiles";
import { profileFullName } from "@/lib/database.types";
import { PREFIXES, roleLabels, STUDENT_PREFIXES } from "@/lib/roles";
import { AddressInputs, pickAddress } from "@/routes/Roster";
import { PrefixNameFields } from "@/routes/Users";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

function pickEditable(p: MyProfileEdit): MyProfileEdit {
  const { prefix, first_name, last_name, email, national_id, date_of_birth } = p;
  return { prefix, first_name, last_name, email, national_id, date_of_birth, ...pickAddress(p) };
}

type Section = "personal" | "security" | "notifications" | "display";

const SECTIONS: { id: Section; label: string; icon: typeof ProfileIcon }[] = [
  { id: "personal", label: "ข้อมูลส่วนตัว", icon: ProfileIcon },
  { id: "security", label: "ความปลอดภัย", icon: ShieldIcon },
  { id: "notifications", label: "การแจ้งเตือน", icon: NotificationIcon },
  { id: "display", label: "การแสดงผล", icon: Sun },
];

export function Profile() {
  const { profile, myStudent, refreshProfile, signOut } = useAuth();
  const toast = useToast();
  const { data: departments = [] } = useDepartments();
  const { data: gradeLevels = [] } = useAllGradeLevels();
  const { data: learningAreas = [] } = useLearningAreas();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const update = useUpdateMyProfile();

  const [draft, setDraft] = useState<MyProfileEdit | null>(null);
  const [section, setSection] = useState<Section>("personal");
  const [avatarInput, setAvatarInput] = useState<HTMLInputElement | null>(null);
  const uploadAvatar = useUploadAvatar();

  if (!profile) return null;

  const current = draft ?? pickEditable(profile);
  const isStudent = profile.roles.includes("student");
  const isTeacher = profile.roles.includes("teacher");
  const department = departments.find((d) => d.id === profile.department_id);
  const gradeLevel = myStudent ? gradeLevels.find((g) => g.id === myStudent.grade_level_id) : undefined;
  const learningArea = learningAreas.find((a) => a.id === profile.learning_area_id);
  const dirty = draft !== null;
  const src = avatarUrl(profile);

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

  async function onAvatarChosen(e: React.ChangeEvent<HTMLInputElement>) {
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
    <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <input ref={setAvatarInput} type="file" accept="image/*" className="hidden" onChange={onAvatarChosen} />

      <aside className="h-fit overflow-hidden rounded-xl bg-card shadow-card">
        <div className="h-28 bg-gradient-to-br from-accent/25 via-accent/10 to-purple-300/30" />
        <div className="-mt-14 flex flex-col items-center px-4 pb-4 text-center">
          <div className="relative">
            <Avatar name={profileFullName(profile)} src={src} className="h-28 w-28 border-4 border-card text-3xl" />
            <button
              type="button"
              aria-label="เปลี่ยนรูปโปรไฟล์"
              disabled={uploadAvatar.isPending}
              onClick={() => avatarInput?.click()}
              className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background shadow-sm"
            >
              {uploadAvatar.isPending ? <Spinner className="h-4 w-4" /> : <CameraIcon className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-3 text-lg font-bold">{profileFullName(profile)}</p>
          <p className="text-xs text-muted-foreground">{roleLabels(profile.roles)}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {isStudent && gradeLevel && (
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">{gradeLevel.name}</span>
            )}
            {isTeacher && learningArea && (
              <span className="rounded-full bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-600 dark:text-purple-300">
                {learningArea.name}
              </span>
            )}
            {department && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{department.name}</span>
            )}
          </div>
        </div>

        <nav className="space-y-1 border-t border-border p-3" aria-label="หมวดโปรไฟล์">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={section === s.id}
              onClick={() => setSection(s.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                section === s.id ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
          ))}
        </nav>

        {isStudent && (
          // Game shell has no sidebar — sign-out lives here (+ the ⚙ on the home screen).
          <div className="border-t border-border p-3">
            <Button variant="outline" className="w-full" onClick={signOut}>
              ออกจากระบบ
            </Button>
          </div>
        )}
      </aside>

      <section className="min-w-0 space-y-4 rounded-xl bg-card shadow-card p-4 sm:p-5">
        {section === "personal" && (
          <>
            <SectionHeader icon={<ProfileIcon className="h-6 w-6" />} title="ข้อมูลส่วนตัว" description="ข้อมูลจะแสดงในระบบสำหรับการติดต่อและเอกสารทางราชการ">
              <Button variant="outline" disabled={uploadAvatar.isPending} onClick={() => avatarInput?.click()}>
                <CameraIcon className="h-3.5 w-3.5" /> แก้ไขรูปโปรไฟล์
              </Button>
            </SectionHeader>

            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <PrefixNameFields
                prefix={current.prefix}
                firstName={current.first_name}
                lastName={current.last_name}
                prefixes={isStudent ? STUDENT_PREFIXES : PREFIXES}
                onChange={(patch) => setDraft({ ...current, ...patch })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="อีเมล (ข้อมูลติดต่อ)">
                <Input
                  type="email"
                  value={current.email ?? ""}
                  onChange={(e) => setDraft({ ...current, email: e.target.value || null })}
                />
              </Field>
              <Field label="เบอร์โทรศัพท์ (รหัสเข้าระบบ — แก้ไม่ได้)">
                <Input value={profile.phone ?? ""} disabled readOnly />
              </Field>
            </div>

            <Field label="เลขบัตรประจำตัวประชาชน">
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

            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              {department && (
                <Field label="แผนก">
                  <Input value={department.name} disabled readOnly />
                </Field>
              )}
              {isTeacher && (
                <Field label="กลุ่มสาระการเรียนรู้">
                  <Input value={learningArea?.name ?? "—"} disabled readOnly />
                </Field>
              )}
              {isTeacher && (
                <Field label="รหัสครู">
                  <Input value={profile.teacher_code ?? "—"} disabled readOnly />
                </Field>
              )}
              {isStudent && myStudent && (
                <>
                  <Field label="รหัสนักเรียน">
                    <Input value={myStudent.student_code} disabled readOnly />
                  </Field>
                  <Field label="ระดับชั้น">
                    <Input value={gradeLevel?.name ?? "—"} disabled readOnly />
                  </Field>
                </>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">ที่อยู่</p>
              <AddressInputs value={current} onChange={(patch) => setDraft({ ...current, ...patch })} />
            </div>

            {isParent && children.length > 0 && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-semibold">บุตรหลาน</p>
                <ul className="divide-y divide-border text-sm">
                  {children.map((c) => (
                    <li key={c.id} className="py-1.5">
                      {c.first_name} {c.last_name} <span className="text-xs text-muted-foreground">({c.student_code})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" disabled={!dirty || update.isPending} onClick={() => setDraft(null)}>
                ยกเลิก
              </Button>
              <Button onClick={save} disabled={!dirty || update.isPending}>
                {update.isPending ? <Spinner className="h-3 w-3" /> : "บันทึกข้อมูล"}
              </Button>
            </div>
          </>
        )}

        {section === "security" && <SecuritySection />}

        {section === "notifications" && (
          <>
            <SectionHeader icon={<NotificationIcon className="h-6 w-6" />} title="การแจ้งเตือน" description="รับแจ้งเตือนงานและคะแนนทาง LINE" />
            <LineLinkCard />
          </>
        )}

        {section === "display" && <DisplaySection />}
      </section>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** Self-service password change — same supabase.auth.updateUser call the onboarding gate uses. */
function SecuritySection() {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (password.length < 8) return setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
    if (password !== confirm) return setError("รหัสผ่านไม่ตรงกัน");
    setPending(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (authError) return setError(authError.message);
    setPassword("");
    setConfirm("");
    toast("เปลี่ยนรหัสผ่านสำเร็จ");
  }

  return (
    <>
      <SectionHeader icon={<ShieldIcon className="h-6 w-6" />} title="ความปลอดภัย" description="เปลี่ยนรหัสผ่านสำหรับเข้าสู่ระบบ" />
      <form onSubmit={submit} className="max-w-md space-y-3">
        <Field label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="ยืนยันรหัสผ่านใหม่">
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} autoComplete="new-password" />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={!password || pending}>
          {pending ? <Spinner className="h-3 w-3" /> : "เปลี่ยนรหัสผ่าน"}
        </Button>
      </form>
    </>
  );
}

function DisplaySection() {
  const { preference, setPreference } = useTheme();
  const options: { id: ThemePreference; label: string; icon: React.ReactNode }[] = [
    { id: "light", label: "โหมดสว่าง", icon: <Sun className="h-5 w-5" /> },
    { id: "dark", label: "โหมดมืด", icon: <Moon className="h-5 w-5" /> },
    { id: "system", label: "ตามระบบ", icon: <Monitor className="h-5 w-5" /> },
  ];
  return (
    <>
      <SectionHeader icon={<Sun className="h-6 w-6" />} title="การแสดงผล" description="เลือกธีมของหน้าจอ (จำค่าไว้ในอุปกรณ์นี้)" />
      <div className="grid max-w-md grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={preference === o.id}
            onClick={() => setPreference(o.id)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-xs font-medium transition-colors",
              preference === o.id ? "border-foreground bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </>
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
    <div className="space-y-2 rounded-xl border border-border p-4">
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
    </div>
  );
}

import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { X } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input, PasswordInput, Select, Spinner } from "@/components/ui";
import {
  useDeleteStudentContact,
  useSaveStudentContact,
  useStudentContacts,
  type StudentContactDraft,
} from "@/hooks/useStudentContacts";
import type { BloodType, GuardianRelationship, Student } from "@/lib/database.types";
import { ONBOARDING_STEPS, REQUIRED_ADDRESS_KEYS, REQUIRED_GUARDIAN_COUNT, type OnboardingStep } from "@/lib/onboarding";
import {
  AddressInputs,
  BLOOD_TYPE_LABEL,
  FAMILY_STATUSES,
  RELATIONSHIP_LABEL,
  pickAddress,
  textareaClass,
} from "@/routes/Roster";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Full-screen gate shown in place of the app until a student's required
 * profile fields are filled and their DOB-derived password replaced — see
 * migration 0022 / src/lib/onboarding.ts. Rendered from App.tsx's Gate(),
 * not a routed page — it blocks every path, not just one.
 */
export function Onboarding({ step }: { step: OnboardingStep }) {
  const { myStudent, refreshOnboarding, signOut } = useAuth();
  const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.key === step);
  // Non-students only ever hit the "password" step (see AuthProvider.loadOnboarding)
  // — the rest of the stepper below is student-only, so skip its chrome for them.
  const isStudentStepper = myStudent !== null || step !== "password";

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="font-heading text-lg font-bold">
            {isStudentStepper ? "กรอกข้อมูลให้ครบก่อนใช้งาน" : "ตั้งรหัสผ่านก่อนใช้งาน"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isStudentStepper
              ? "ข้อมูลนี้จำเป็นสำหรับการติดต่อและความปลอดภัยของบัญชีนักเรียน"
              : "รหัสผ่านเริ่มต้นของบัญชีนี้ตั้งขึ้นอัตโนมัติ — เปลี่ยนเป็นรหัสผ่านของตัวเองก่อนใช้งานต่อ"}
          </p>
        </div>

        {isStudentStepper && (
          <ol className="flex items-center gap-1.5">
            {ONBOARDING_STEPS.map((s, i) => (
              <li
                key={s.key}
                title={s.label}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i < currentIndex ? "bg-success" : i === currentIndex ? "bg-foreground" : "bg-border",
                )}
              />
            ))}
          </ol>
        )}

        <Card>
          <h2 className="mb-4 text-sm font-semibold">{ONBOARDING_STEPS[currentIndex]?.label}</h2>
          {step === "password" && <PasswordStep onDone={refreshOnboarding} />}
          {step === "identity" && myStudent && <IdentityStep student={myStudent} onDone={refreshOnboarding} />}
          {step === "contact" && myStudent && <ContactStep student={myStudent} onDone={refreshOnboarding} />}
          {step === "guardians" && myStudent && (
            <GuardiansStep studentId={myStudent.id} onDone={refreshOnboarding} />
          )}
          {step === "health" && myStudent && <HealthStep student={myStudent} onDone={refreshOnboarding} />}
        </Card>

        <button
          type="button"
          className="tappable block w-full text-center text-xs text-muted-foreground underline"
          onClick={signOut}
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}

function ErrorText({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-sm text-destructive">{error}</p>;
}

function PasswordStep({ onDone }: { onDone: () => Promise<void> }) {
  const { session } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (password !== confirm) {
      setError("รหัสผ่านไม่ตรงกัน");
      return;
    }
    setPending(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      if (session) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ must_change_password: false })
          .eq("id", session.user.id);
        if (profileError) throw profileError;
      }
      toast("ตั้งรหัสผ่านสำเร็จ");
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตั้งรหัสผ่านไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        รหัสผ่านเริ่มต้นที่ระบบตั้งให้ ใช้ล็อกอินครั้งแรกได้ครั้งเดียว — ตั้งรหัสผ่านใหม่ของตัวเองก่อนใช้งานต่อ
      </p>
      <Field label="รหัสผ่านใหม่">
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          autoComplete="new-password"
          required
        />
      </Field>
      <Field label="ยืนยันรหัสผ่านใหม่">
        <PasswordInput
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          autoComplete="new-password"
          required
        />
      </Field>
      <ErrorText error={error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Spinner className="h-3 w-3" /> : "ตั้งรหัสผ่าน"}
      </Button>
    </form>
  );
}

function IdentityStep({ student, onDone }: { student: Student; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => ({
    national_id: student.national_id ?? "",
    ...pickAddress(student),
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const { error: err } = await supabase
        .from("students")
        .update({ national_id: draft.national_id || null, ...pickAddress(draft) })
        .eq("id", student.id);
      if (err) throw err;
      toast("บันทึกข้อมูลสำเร็จ");
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="เลขบัตรประชาชน">
        <Input
          value={draft.national_id}
          onChange={(e) => setDraft({ ...draft, national_id: e.target.value })}
          inputMode="numeric"
          required
        />
      </Field>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">ที่อยู่</p>
        <AddressInputs
          value={draft}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
          required={REQUIRED_ADDRESS_KEYS}
        />
      </div>
      <ErrorText error={error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Spinner className="h-3 w-3" /> : "บันทึกและถัดไป"}
      </Button>
    </form>
  );
}

function ContactStep({ student, onDone }: { student: Student; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [phone, setPhone] = useState(student.phone ?? "");
  const [email, setEmail] = useState(student.email ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const { error: err } = await supabase.from("students").update({ phone, email }).eq("id", student.id);
      if (err) throw err;
      toast("บันทึกข้อมูลสำเร็จ");
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="เบอร์โทรศัพท์">
        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </Field>
      <Field label="อีเมล">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <ErrorText error={error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Spinner className="h-3 w-3" /> : "บันทึกและถัดไป"}
      </Button>
    </form>
  );
}

function GuardiansStep({ studentId, onDone }: { studentId: string; onDone: () => Promise<void> }) {
  const { data: contacts = [] } = useStudentContacts(studentId);
  const deleteContact = useDeleteStudentContact();
  const [adding, setAdding] = useState<GuardianRelationship | null>(null);

  if (adding) {
    return <GuardianForm studentId={studentId} relationship={adding} onDone={() => setAdding(null)} />;
  }

  const hasFather = contacts.some((c) => c.relationship === "father");
  const hasMother = contacts.some((c) => c.relationship === "mother");
  const enough = contacts.length >= REQUIRED_GUARDIAN_COUNT;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        ต้องมีผู้ปกครองอย่างน้อย {REQUIRED_GUARDIAN_COUNT} คน (บิดา/มารดา หรือผู้ปกครองอื่นแทนได้)
      </p>

      {contacts.length > 0 && (
        <ul className="divide-y divide-border">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <p>
                  {RELATIONSHIP_LABEL[c.relationship]}
                  {c.relationship === "other" && c.relationship_note ? ` (${c.relationship_note})` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.prefix}
                  {c.first_name} {c.last_name} · {c.phone || "—"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="ลบผู้ปกครอง"
                onClick={() => deleteContact.mutate(c.id)}
                disabled={deleteContact.isPending}
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        {!hasFather && (
          <button
            type="button"
            className="flex-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => setAdding("father")}
          >
            + เพิ่มบิดา
          </button>
        )}
        {!hasMother && (
          <button
            type="button"
            className="flex-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => setAdding("mother")}
          >
            + เพิ่มมารดา
          </button>
        )}
      </div>
      <button
        type="button"
        className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
        onClick={() => setAdding("other")}
      >
        + เพิ่มผู้ปกครองอื่น
      </button>

      <Button type="button" className="w-full" disabled={!enough} onClick={onDone}>
        ถัดไป
      </Button>
    </div>
  );
}

function GuardianForm({
  studentId,
  relationship,
  onDone,
}: {
  studentId: string;
  relationship: GuardianRelationship;
  onDone: () => void;
}) {
  const save = useSaveStudentContact();
  const toast = useToast();
  const [draft, setDraft] = useState<StudentContactDraft>({
    student_id: studentId,
    relationship,
    relationship_note: null,
    prefix: null,
    first_name: "",
    last_name: "",
    phone: null,
    email: null,
    house_no: null,
    village_no: null,
    alley: null,
    road: null,
    subdistrict: null,
    district: null,
    province: null,
    postal_code: null,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await save.mutateAsync(draft);
      toast("บันทึกข้อมูลผู้ปกครองสำเร็จ");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Button type="button" variant="outline" size="sm" onClick={onDone}>
        ← กลับ
      </Button>

      {relationship === "other" && (
        <Field label="ระบุความสัมพันธ์">
          <Input
            value={draft.relationship_note ?? ""}
            onChange={(e) => setDraft({ ...draft, relationship_note: e.target.value || null })}
            placeholder="เช่น ปู่, ย่า, ญาติ, ผู้อุปการะ"
            required
          />
        </Field>
      )}

      <Field label="คำนำหน้า">
        <Select value={draft.prefix ?? ""} onChange={(e) => setDraft({ ...draft, prefix: e.target.value || null })}>
          <option value="">— ไม่ระบุ —</option>
          <option value="นาย">นาย</option>
          <option value="นาง">นาง</option>
          <option value="นางสาว">นางสาว</option>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ชื่อ">
          <Input value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} required />
        </Field>
        <Field label="นามสกุล">
          <Input value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} required />
        </Field>
      </div>

      <Field label="เบอร์โทรศัพท์">
        <Input
          type="tel"
          value={draft.phone ?? ""}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value || null })}
          required
        />
      </Field>

      <Field label="อีเมล">
        <Input
          type="email"
          value={draft.email ?? ""}
          onChange={(e) => setDraft({ ...draft, email: e.target.value || null })}
        />
      </Field>

      <ErrorText error={error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
      </Button>
    </form>
  );
}

function HealthStep({ student, onDone }: { student: Student; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [draft, setDraft] = useState({
    blood_type: student.blood_type,
    family_status: student.family_status ?? "",
    chronic_disease: student.chronic_disease ?? "",
    drug_allergy: student.drug_allergy ?? "",
    food_allergy: student.food_allergy ?? "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !draft.blood_type ||
      !draft.family_status.trim() ||
      !draft.chronic_disease.trim() ||
      !draft.drug_allergy.trim() ||
      !draft.food_allergy.trim()
    ) {
      setError('กรอกให้ครบทุกช่อง (พิมพ์ "ไม่มี" ได้ถ้าไม่มี)');
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const { error: err } = await supabase.from("students").update(draft).eq("id", student.id);
      if (err) throw err;
      toast("บันทึกข้อมูลสำเร็จ เข้าใช้งานได้แล้ว");
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="หมู่เลือด">
        <Select
          value={draft.blood_type ?? ""}
          onChange={(e) => setDraft({ ...draft, blood_type: (e.target.value || null) as BloodType | null })}
          placeholder="เลือกหมู่เลือด"
          required
        >
          {(Object.keys(BLOOD_TYPE_LABEL) as BloodType[]).map((b) => (
            <option key={b} value={b}>
              {BLOOD_TYPE_LABEL[b]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="สถานภาพครอบครัว">
        <Select
          value={draft.family_status}
          onChange={(e) => setDraft({ ...draft, family_status: e.target.value })}
          placeholder="เลือกสถานภาพครอบครัว"
          required
        >
          {FAMILY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="โรคประจำตัว">
        <textarea
          className={textareaClass}
          value={draft.chronic_disease}
          onChange={(e) => setDraft({ ...draft, chronic_disease: e.target.value })}
          placeholder='พิมพ์ "ไม่มี" ถ้าไม่มี'
          required
        />
      </Field>

      <Field label="ยาที่แพ้">
        <textarea
          className={textareaClass}
          value={draft.drug_allergy}
          onChange={(e) => setDraft({ ...draft, drug_allergy: e.target.value })}
          placeholder='พิมพ์ "ไม่มี" ถ้าไม่มี'
          required
        />
      </Field>

      <Field label="อาหารที่แพ้">
        <textarea
          className={textareaClass}
          value={draft.food_allergy}
          onChange={(e) => setDraft({ ...draft, food_allergy: e.target.value })}
          placeholder='พิมพ์ "ไม่มี" ถ้าไม่มี'
          required
        />
      </Field>

      <ErrorText error={error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Spinner className="h-3 w-3" /> : "บันทึกและเข้าใช้งาน"}
      </Button>
    </form>
  );
}

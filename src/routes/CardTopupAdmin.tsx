import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { DesktopIcon, Search } from "@/components/icons";
import { Button, Field, Input, Spinner, Switch } from "@/components/ui";
import {
  useCashiers,
  useResetPin,
  useSaveTerminal,
  useTerminals,
} from "@/hooks/useCardTopup";
import type { PosTerminal } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");

/** The terminal id this device selected on the sale screen (same key as CardTopupPos). */
function thisDeviceTerminal(): string {
  try {
    return localStorage.getItem("helix-pos-terminal") ?? "";
  } catch {
    return "";
  }
}

type Form = { id?: string; name: string; active: boolean };

/** เครื่องขาย — terminals (add / rename / on-off) and cashier PIN resets. */
export function TerminalsTab() {
  const toast = useToast();
  const { data: terminals = [], isLoading } = useTerminals();
  const { data: cashiers = [] } = useCashiers();
  const save = useSaveTerminal();
  const resetPin = useResetPin();
  const [form, setForm] = useState<Form | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"on" | "off" | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const here = thisDeviceTerminal();

  const onCount = terminals.filter((t) => t.active).length;
  const offCount = terminals.length - onCount;
  const q = query.trim().toLowerCase();
  const shown = terminals.filter((t) => {
    if (filter === "on" && !t.active) return false;
    if (filter === "off" && t.active) return false;
    return !q || t.name.toLowerCase().includes(q);
  });
  const canSave = !!form && form.name.trim() !== "" && !save.isPending;

  const run = (p: Promise<unknown>, ok: string) => p.then(() => toast(ok), (e) => toast(errMsg(e), "error"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !canSave) return;
    try {
      await save.mutateAsync(form.id ? { id: form.id, name: form.name.trim(), active: form.active } : { name: form.name.trim() });
      toast(form.id ? "บันทึกแล้ว" : "เพิ่มเครื่องขายแล้ว");
      setForm(null);
    } catch (err) {
      toast(errMsg(err), "error");
    }
  }

  async function setActive(t: PosTerminal, active: boolean) {
    setToggling(t.id);
    try {
      await save.mutateAsync({ id: t.id, active });
      toast(active ? `เปิดใช้งาน ${t.name}` : `ปิดใช้งาน ${t.name}`);
    } catch (err) {
      toast(errMsg(err), "error");
    } finally {
      setToggling(null);
    }
  }

  const chip = (active: boolean) =>
    cn(
      "tappable flex h-12 shrink-0 items-center rounded-full border px-5 text-lg font-semibold transition-colors",
      active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-foreground/5",
    );

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        {/* Title row */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-ui text-2xl font-semibold">เครื่องขาย ({terminals.length})</h2>
          <div className="relative ml-auto min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              className="h-14 !pl-12 text-lg"
              placeholder="ค้นหาชื่อเครื่อง"
              aria-label="ค้นหาเครื่องขาย"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button className="h-14 px-6 text-lg" onClick={() => setForm({ name: "", active: true })}>
            เพิ่มเครื่องขาย
          </Button>
        </div>

        {/* Filter row */}
        <div className="scrollbar-hidden flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="สถานะเครื่องขาย">
          <button type="button" role="tab" aria-selected={filter === null} className={chip(filter === null)} onClick={() => setFilter(null)}>
            ทั้งหมด
          </button>
          {onCount > 0 && (
            <button type="button" role="tab" aria-selected={filter === "on"} className={chip(filter === "on")} onClick={() => setFilter("on")}>
              เปิดใช้งาน ({onCount})
            </button>
          )}
          {offCount > 0 && (
            <button type="button" role="tab" aria-selected={filter === "off"} className={chip(filter === "off")} onClick={() => setFilter("off")}>
              ปิดใช้งาน ({offCount})
            </button>
          )}
        </div>

        {isLoading && <Spinner className="mx-auto size-8" />}
        {!isLoading && terminals.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-lg text-muted-foreground">ยังไม่มีเครื่องขาย — กด "เพิ่มเครื่องขาย"</p>
        )}
        {!isLoading && terminals.length > 0 && shown.length === 0 && (
          <p className="px-4 py-12 text-center text-lg text-muted-foreground">ไม่พบเครื่องขายที่ตรงกับการค้นหา</p>
        )}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((t) => (
            <li key={t.id} className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setForm({ id: t.id, name: t.name, active: t.active })}
                aria-label={`แก้ไข ${t.name}`}
                className="tappable flex flex-1 flex-col gap-3 p-4 text-left active:bg-foreground/5"
              >
                <span className={cn("flex h-16 w-16 items-center justify-center rounded-2xl bg-muted", !t.active && "opacity-50")}>
                  <DesktopIcon className="h-10 w-10" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className={cn("line-clamp-2 text-xl font-semibold leading-snug", !t.active && "text-muted-foreground")}>{t.name}</span>
                  <span className="text-base text-muted-foreground">เพิ่มเมื่อ {new Date(t.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
                {(t.id === here || !t.active) && (
                  <span className="flex flex-wrap gap-2">
                    {t.id === here && <span className="rounded-full bg-foreground px-3 py-1 text-sm font-semibold text-background">เครื่องนี้</span>}
                    {!t.active && <span className="rounded-full bg-destructive px-3 py-1 text-sm font-semibold text-white">ปิดใช้งาน</span>}
                  </span>
                )}
              </button>
              <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                <span className={cn("text-base font-semibold", t.active ? "text-success" : "text-muted-foreground")}>{t.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
                {toggling === t.id ? (
                  <Spinner className="size-6" />
                ) : (
                  <Switch label={`เปิดใช้งาน ${t.name}`} checked={t.active} disabled={save.isPending} onChange={(v) => void setActive(t, v)} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        <h2 className="font-ui text-2xl font-semibold">รีเซ็ต PIN แคชเชียร์</h2>
        <p className="text-lg text-muted-foreground">หลังรีเซ็ต แคชเชียร์จะตั้ง PIN ใหม่เองเมื่อเติมเงินสดครั้งถัดไป (ปลดล็อกที่ติดอยู่ด้วย)</p>
        {cashiers.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-lg text-muted-foreground">ยังไม่มีบัญชีแคชเชียร์ — สร้างได้ที่เมนูผู้ใช้งาน (บทบาท แคชเชียร์)</p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cashiers.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-lg">
              <span className="min-w-0 truncate font-semibold">{c.name}</span>
              <Button variant="outline" className="h-14 shrink-0 px-5 text-lg" disabled={resetPin.isPending} onClick={() => void run(resetPin.mutateAsync(c.id), "รีเซ็ต PIN แล้ว")}>
                รีเซ็ต PIN
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <Modal
        open={!!form}
        onOpenChange={(o) => !o && setForm(null)}
        title={form?.id ? "แก้ไขเครื่องขาย" : "เพิ่มเครื่องขาย"}
        footer={
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="h-14 flex-1 text-lg" onClick={() => setForm(null)}>
              ยกเลิก
            </Button>
            <Button type="submit" form="terminal-form" className="h-14 flex-1 text-lg" disabled={!canSave}>
              {save.isPending ? <Spinner /> : "บันทึก"}
            </Button>
          </div>
        }
      >
        {form && (
          <form id="terminal-form" onSubmit={submit} className="space-y-4">
            <Field label="ชื่อเครื่อง" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น โรงอาหาร 1" />
            </Field>
            {form.id && <Switch label="เปิดใช้งาน" checked={form.active} onChange={(active) => setForm({ ...form, active })} />}
          </form>
        )}
      </Modal>
    </div>
  );
}

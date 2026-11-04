import { useState } from "react";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input } from "@/components/ui";
import {
  useCashiers,
  useResetPin,
  useSaveTerminal,
  useTerminals,
} from "@/hooks/useCardTopup";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");

/** เครื่องขาย — terminals (reporting only) and cashier PIN resets. */
export function TerminalsTab() {
  const toast = useToast();
  const { data: terminals = [] } = useTerminals();
  const { data: cashiers = [] } = useCashiers();
  const save = useSaveTerminal();
  const resetPin = useResetPin();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const run = (p: Promise<unknown>, ok: string) => p.then(() => toast(ok), (e) => toast(errMsg(e), "error"));

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="space-y-3 self-start">
        <p className="font-ui text-sm font-semibold">เครื่องขาย</p>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void run(save.mutateAsync({ name: name.trim() }), "เพิ่มเครื่องขายแล้ว").then(() => setName(""));
          }}
        >
          <div className="flex-1">
            <Field label="ชื่อเครื่องใหม่">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น โรงอาหาร 1" />
            </Field>
          </div>
          <Button type="submit" disabled={!name.trim() || save.isPending}>
            เพิ่ม
          </Button>
        </form>
        <ul className="space-y-1">
          {terminals.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
              {editing?.id === t.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editing.name.trim()) void run(save.mutateAsync({ id: t.id, name: editing.name.trim() }), "แก้ชื่อแล้ว").then(() => setEditing(null));
                  }}
                >
                  <Input aria-label="ชื่อเครื่อง" value={editing.name} onChange={(e) => setEditing({ id: t.id, name: e.target.value })} />
                  <Button type="submit" size="sm">
                    บันทึก
                  </Button>
                </form>
              ) : (
                <>
                  <span className={cn(!t.active && "text-muted-foreground line-through")}>{t.name}</span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ id: t.id, name: t.name })}>
                      เปลี่ยนชื่อ
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void run(save.mutateAsync({ id: t.id, active: !t.active }), t.active ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว")}>
                      {t.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </Button>
                  </span>
                </>
              )}
            </li>
          ))}
          {terminals.length === 0 && <li className="text-xs text-muted-foreground">ยังไม่มีเครื่องขาย</li>}
        </ul>
      </Card>

      <Card className="space-y-2 self-start">
        <p className="font-ui text-sm font-semibold">รีเซ็ต PIN แคชเชียร์</p>
        <p className="text-xs text-muted-foreground">หลังรีเซ็ต แคชเชียร์จะตั้ง PIN ใหม่เองเมื่อเติมเงินสดครั้งถัดไป (ปลดล็อกที่ติดอยู่ด้วย)</p>
        <ul className="space-y-1">
          {cashiers.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              {c.name}
              <Button size="sm" variant="outline" disabled={resetPin.isPending} onClick={() => void run(resetPin.mutateAsync(c.id), "รีเซ็ต PIN แล้ว")}>
                รีเซ็ต PIN
              </Button>
            </li>
          ))}
          {cashiers.length === 0 && <li className="text-xs text-muted-foreground">ยังไม่มีบัญชีแคชเชียร์ — สร้างได้ที่เมนูผู้ใช้งาน (บทบาท แคชเชียร์)</li>}
        </ul>
      </Card>
    </div>
  );
}

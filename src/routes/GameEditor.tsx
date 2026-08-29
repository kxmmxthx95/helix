import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Spinner, Switch } from "@/components/ui";
import {
  useCreateGameMap,
  useDeleteGameMap,
  useGameMapObstacles,
  useGameMaps,
  useToggleGameMapObstacle,
  useUpdateGameMap,
} from "@/hooks/useGameMaps";
import type { GameMap } from "@/lib/database.types";
import { canManageUsers } from "@/lib/roles";

const TILE_PX = 24;
const DEFAULT_COLS = 14;
const DEFAULT_ROWS = 10;

export function GameEditor() {
  const { profile: me } = useAuth();
  const mayManage = me ? canManageUsers(me.roles) : false;

  if (!mayManage) {
    return <EmptyState title="ไม่มีสิทธิ์เข้าถึง" description="หน้านี้สำหรับผู้ดูแลระบบสูงสุดเท่านั้น" />;
  }

  return <GameEditorContent />;
}

function GameEditorContent() {
  const toast = useToast();
  const { data: maps, isLoading } = useGameMaps();
  const createMap = useCreateGameMap();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const selected = maps?.find((m) => m.id === selectedId) ?? null;

  function create() {
    if (!newName.trim()) return;
    createMap.mutate(
      { name: newName.trim(), cols: DEFAULT_COLS, rows: DEFAULT_ROWS, ground_color: "#adbc3a", wall_color: "#4a2f1c" },
      {
        onSuccess: (map) => {
          setNewName("");
          setSelectedId(map.id);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "สร้างแมปไม่สำเร็จ", "error"),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[260px_1fr]">
      <Card className="space-y-3 p-3">
        <p className="text-sm font-medium">แมปทั้งหมด</p>
        <div className="space-y-1">
          {(maps ?? []).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedId(m.id)}
              className={`tappable flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                m.id === selectedId ? "bg-accent/10 text-accent" : "hover:bg-muted"
              }`}
            >
              <span className="truncate">{m.name}</span>
              {m.is_active && <span className="text-[10px] text-accent">ใช้งานอยู่</span>}
            </button>
          ))}
          {(maps ?? []).length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีแมป</p>}
        </div>
        <div className="flex gap-1.5 border-t pt-3">
          <Input placeholder="ชื่อแมปใหม่" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button size="sm" onClick={create} disabled={createMap.isPending || !newName.trim()}>
            {createMap.isPending ? <Spinner className="h-3 w-3" /> : "เพิ่ม"}
          </Button>
        </div>
      </Card>

      {selected ? <MapEditor map={selected} /> : <EmptyState title="เลือกแมป" description="เลือกแมปทางซ้าย หรือสร้างแมปใหม่" />}
    </div>
  );
}

function MapEditor({ map }: { map: GameMap }) {
  const toast = useToast();
  const { data: obstacles } = useGameMapObstacles(map.id);
  const updateMap = useUpdateGameMap();
  const deleteMap = useDeleteGameMap();
  const toggleObstacle = useToggleGameMapObstacle();

  const obstacleKeys = new Set((obstacles ?? []).map((o) => `${o.x},${o.y}`));

  function isEdge(x: number, y: number) {
    return x === 0 || y === 0 || x === map.cols - 1 || y === map.rows - 1;
  }

  function onCellClick(x: number, y: number) {
    if (isEdge(x, y)) return; // outer ring is always wall — nothing to toggle
    toggleObstacle.mutate(
      { mapId: map.id, x, y, present: obstacleKeys.has(`${x},${y}`) },
      { onError: (err) => toast(err instanceof Error ? err.message : "แก้ไขไม่สำเร็จ", "error") },
    );
  }

  function remove() {
    if (!confirm(`ลบแมป "${map.name}"? ลบแล้วกู้คืนไม่ได้`)) return;
    deleteMap.mutate(map.id, { onError: (err) => toast(err instanceof Error ? err.message : "ลบไม่สำเร็จ", "error") });
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="ชื่อแมป">
          <Input
            value={map.name}
            onChange={(e) => updateMap.mutate({ id: map.id, patch: { name: e.target.value } })}
          />
        </Field>
        <Field label="สีพื้น">
          <input
            type="color"
            value={map.ground_color}
            onChange={(e) => updateMap.mutate({ id: map.id, patch: { ground_color: e.target.value } })}
            className="h-9 w-14 rounded border"
          />
        </Field>
        <Field label="สีกำแพง">
          <input
            type="color"
            value={map.wall_color}
            onChange={(e) => updateMap.mutate({ id: map.id, patch: { wall_color: e.target.value } })}
            className="h-9 w-14 rounded border"
          />
        </Field>
        <div className="flex items-center gap-2">
          <Switch
            checked={map.is_active}
            onChange={(checked) => updateMap.mutate({ id: map.id, patch: { is_active: checked } })}
          />
          <span className="text-sm">ใช้งานอยู่ (นักเรียนเห็นแมปนี้)</span>
        </div>
        <Button variant="outline" size="sm" className="ml-auto text-destructive" onClick={remove}>
          ลบแมป
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">คลิกช่องในตารางเพื่อวาง/ลบเสาฝึก — ขอบนอกเป็นกำแพงเสมอ แก้ไม่ได้</p>

      <div
        className="inline-grid gap-px rounded border bg-border"
        style={{ gridTemplateColumns: `repeat(${map.cols}, ${TILE_PX}px)` }}
      >
        {Array.from({ length: map.rows }, (_, y) =>
          Array.from({ length: map.cols }, (_, x) => {
            const edge = isEdge(x, y);
            const hasObstacle = obstacleKeys.has(`${x},${y}`);
            return (
              <button
                key={`${x},${y}`}
                type="button"
                onClick={() => onCellClick(x, y)}
                disabled={edge}
                title={edge ? "กำแพง" : hasObstacle ? "เสาฝึก (คลิกเพื่อลบ)" : "พื้นว่าง (คลิกเพื่อวางเสาฝึก)"}
                style={{
                  width: TILE_PX,
                  height: TILE_PX,
                  backgroundColor: edge ? map.wall_color : hasObstacle ? "#8a5a35" : map.ground_color,
                }}
                className="tappable disabled:cursor-default"
              />
            );
          }),
        )}
      </div>
    </Card>
  );
}

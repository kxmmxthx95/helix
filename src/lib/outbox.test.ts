import { describe, expect, it } from "vitest";
import { flush, type Op, type OpStore } from "@/lib/outbox";

function memStore(ops: Op[]): OpStore {
  return {
    all: async () => [...ops],
    add: async (op) => void ops.push(op),
    remove: async (id) => void ops.splice(
      ops.findIndex((o) => o.id === id),
      1,
    ),
  };
}

const op = (id: string, createdAt: number): Op => ({
  id,
  createdAt,
  table: "students",
  type: "insert",
  payload: {},
});

describe("outbox flush", () => {
  it("replays oldest-first regardless of storage order", async () => {
    const ops = [op("c", 30), op("a", 10), op("b", 20)];
    const seen: string[] = [];

    const result = await flush(memStore(ops), async (o) => void seen.push(o.id));

    expect(seen).toEqual(["a", "b", "c"]);
    expect(result).toEqual({ sent: 3, pending: 0 });
    expect(ops).toHaveLength(0);
  });

  it("stops at the first failure and keeps it plus everything after it", async () => {
    const ops = [op("a", 10), op("b", 20), op("c", 30)];

    const result = await flush(memStore(ops), async (o) => {
      if (o.id === "b") throw new Error("offline again");
    });

    expect(result.sent).toBe(1);
    expect(result.pending).toBe(2);
    expect(result.failed?.id).toBe("b");
    // "a" was delivered and dropped; "b" and "c" must survive for the next flush.
    expect(ops.map((o) => o.id)).toEqual(["b", "c"]);
  });
});

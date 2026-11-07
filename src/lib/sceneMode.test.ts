import { describe, expect, it } from "vitest";
import { autoSceneMode } from "@/lib/sceneMode";

const base = { webgl: true, reducedMotion: false };

describe("autoSceneMode", () => {
  it("rich on a capable device", () => expect(autoSceneMode({ ...base, memoryGb: 8, cores: 8 })).toBe("rich"));
  it("rich when memory/cores are unknown (Safari/Firefox)", () => expect(autoSceneMode(base)).toBe("rich"));
  it("lite without WebGL", () => expect(autoSceneMode({ ...base, webgl: false })).toBe("lite"));
  it("lite on low RAM", () => expect(autoSceneMode({ ...base, memoryGb: 4 })).toBe("lite"));
  it("lite on few cores", () => expect(autoSceneMode({ ...base, cores: 4 })).toBe("lite"));
  it("lite with reduced motion", () => expect(autoSceneMode({ ...base, reducedMotion: true })).toBe("lite"));
});

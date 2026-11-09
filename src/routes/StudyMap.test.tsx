import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { StudyMap } from "./StudyMap";
const mocks = vi.hoisted(() => ({ departments: vi.fn(() => ({ data: [] })), profile: { roles: ["teacher"] } }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ profile: mocks.profile }) }));
vi.mock("@/hooks/useProfiles", () => ({ useDepartments: mocks.departments }));
vi.mock("@/hooks/usePlan", () => ({ usePlanSubjects: () => ({ data: [] }), usePlanOutline: () => ({ data: [] }) }));
vi.mock("@/hooks/useCurriculumStructure", () => ({ useGradeLevels: () => ({ data: [] }) }));
vi.mock("@/components/ui", () => ({ Card: ({children}: {children: React.ReactNode}) => React.createElement('div', null, children) }));
describe("StudyMap access boundary", () => {
 it.each(['teacher', 'student', 'director', 'staff', 'dept_head', 'dept_director'])('denies a %s direct URL before mounting any data hooks', role => {
  mocks.profile.roles = [role];
  mocks.departments.mockClear();
  expect(renderToString(<StudyMap />)).toContain("ไม่มีสิทธิ์");
  expect(mocks.departments).not.toHaveBeenCalled();
 });
});

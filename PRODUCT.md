# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary: teachers and school staff (เจ้าหน้าที่) using the back-office portal daily, on desktop and on phones/tablets in the classroom. Secondary: students and parents using a separate portal (`/student-login`) that sees only their own or their children's data. Administrators and department heads/directors manage their scope. One person can hold several roles at once.

## Product Purpose
Helix (ระบบจัดการสถานศึกษา) runs a school's daily operations in one installable PWA: timetable, attendance, scores, behavior, leave, documents, teaching plans, exam bank, curriculum, HR (time tracking, leave, duty roster). Success: staff finish routine tasks quickly, including offline, and students and parents see their own records without back-office access.

## Positioning
- Multi-role permissions scoped by department, enforced at the database layer with RLS; `src/lib/roles.ts` only hides UI.
- Offline-first PWA (service-worker cache, IndexedDB outbox) with LINE notifications.
- Academic and HR in one system.
- Students get a game-style portal.

## Operating Context
Used in classrooms and offices on phones, tablets and desktops, often on unreliable networks. Edits by non-student/parent roles are written to `audit_logs`. Access to the system is by admin-created accounts only.

## Capabilities and Constraints
- Stack: React 19, Vite, Tailwind, Supabase, Vercel, framer-motion, react-three-fiber.
- Roles: super_admin, director, dept_head, dept_director (ผู้บริหารแผนก), academic_head, teacher, staff, student, parent.
- Thai is the primary language; UI copy and fonts must handle Thai text (Noto Sans Thai, Prompt, Sarabun, Inter loaded).
- Touch-friendly on phone/tablet, resilient offline.
- Open: LINE LIFF setup, real PWA icons.

## Brand Commitments
- Staff/teacher back-office stays dark (the `<html class="dark">` theme) and glass-style, by intent.
- Student portal is a separate pastel-pink, game-like world (see `docs/design/student-portal-login.md`), not a theme toggle.

## Evidence on Hand
Logo and assets in `public/` (`logo.webp`, `game/*.webp`, `student-login-bg.webp`). No testimonials, customers or metrics exist; do not fabricate.

## Product Principles
1. Task speed over decoration in staff screens; brand lives in precise details.
2. Respect scope: show each role only what it may see and edit.
3. Work offline; never lose a write.
4. Thai-first typography and copy.
5. Students get delight; staff get clarity.

## Accessibility & Inclusion
Thai text rendering with correct line height for vowel and tone marks; touch targets sized for classroom phone/tablet use. No formal standard stated.

# Student Login — Design Notes

Separate login screen for students at `/student-login`, distinct from the
shared staff/teacher login at `/`. Same auth backend (`AuthProvider.signIn` /
`resetPassword`), different visual identity.

## Why a separate page

The original `Login.tsx` is shared across every role (student, teacher,
staff, admin) and stays dark/glass on purpose — it's the enterprise-facing
surface. Students needed something that reads as "for me," not "for the
back office," so this ships as its own route instead of a theme toggle on
the shared page.

## Routing

`Gate()` in `src/App.tsx` picks the login screen by path when there's no
session:

```
!session → location.pathname === "/student-login" ? <StudentLogin /> : <Login />
```

No new top-level `<Route>` — the check happens before `<Routes>` even
mounts, same as the existing `Login` branch.

## Visual direction

Reference: pastel-pink fantasy castle-school illustration (floating
islands, cherry blossoms, clock tower, sakura petals). Swapped in from an
earlier pastel-pink isometric school-courtyard reference — same palette
and mood, replaced wholesale via `STU-BG.png`.

- Full-bleed background image (`public/student-login-bg.webp`, converted
  from the source PNG with `cwebp -q 82`).
- Soft pink gradient wash over the image for text/card contrast at every
  viewport size.
- Glassy white card (`bg-white/80` + `backdrop-blur-xl`), soft shadow —
  no hard offset shadows, no thick ink borders. Rounded `1.75rem`.
- Card position: centered on mobile, pinned to the open plaza on the right
  side of the reference art on wide screens (`lg:justify-end lg:pr-[8vw]`).
- Accent: pink → rose gradient button, rose-tinted inputs
  (`bg-pink-50/60`, `border-pink-200`).
- `GraduationCap` icon in a white rounded badge above the form.
- Framer Motion: card scales/fades in on mount; badge does a small
  overshoot spin-in; submit button squishes on tap.

## Discarded direction

First pass was an Overcooked-style comic UI (checkerboard tiles, thick
black ink borders, hard 4px offset shadows, orange/purple gradient). Fully
built and screenshot-tested, then replaced wholesale once the actual
reference image (pastel kawaii school) came in — kept the same form
structure and auth logic, rewrote every style token.

## Form behavior (shared with staff Login)

- Sign-in: `รหัสนักเรียน / เบอร์โทร` (student code or phone) + password.
- Reset: adds national ID + Buddhist-calendar date of birth
  (`BuddhistDateSelect`), sets a new password via `resetPassword`.
- Sign-in errors are intentionally vague (`รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง`)
  — doesn't reveal which half of the credential pair was wrong. Reset
  surfaces the server's real message since there's no credential pair to
  protect there. Same tradeoff as `Login.tsx`.

## Files

| File | Purpose |
|---|---|
| `src/routes/StudentLogin.tsx` | the page |
| `src/App.tsx` | path-based branch in `Gate()` |
| `public/student-login-bg.webp` | background art |
| `tailwind.config.js` | no custom tokens needed (uses stock `pink`/`rose` palette) |

## Open questions / follow-ups

- No entry point links to `/student-login` yet (typed URL only) — decide
  whether the shared `Login.tsx` should link out to it, or whether it's
  meant to be the QR-code / bookmarked URL students get directly.
- Not yet verified against real Supabase auth in a browser — checked with
  Playwright against the dev server, form wiring only (mock-free, but no
  real sign-in attempted).

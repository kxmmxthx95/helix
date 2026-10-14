---
target: Dashboard
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/kim/Desktop/Helix/src/routes/Dashboard.tsx"
target_fingerprint: "sha256:ded2d6879c0c83e0cd6de1a739c66b1666aa55510efdc9c2d750856a9c7a66f0"
target_path: /Users/kim/Desktop/Helix/src/routes/Dashboard.tsx
timestamp: 2026-10-14T15-32-19Z
slug: src-routes-dashboard-tsx
---
Method: dual-agent (source-based, no live browser)
Score 19/40 (Poor). Staff landing renders only greeting + optional clock; all other sections student/parent-only.
P0 staff dashboard empty (Dashboard.tsx:73-104). Fix: role-scoped modules. /impeccable layout, onboard
P1 no cards/hierarchy; greeting text-2xl; parents grouped by section not child. /impeccable layout, typeset
P1 isError never read; failed queries show false empty/zero data; cancel leave has no onError. /impeccable harden
P2 32px touch targets, link ~16px. /impeccable adapt
P2 raw ISO dates, Thai leading. /impeccable typeset
Bugs: todayIso() uses UTC (wrong 00:00-07:00 Bangkok); academic-year window uses calendar year.
Detector: Dashboard.tsx 0 findings; ui.tsx:369 11px and AppShell.tsx:657,660 9px off type ramp (advisory).

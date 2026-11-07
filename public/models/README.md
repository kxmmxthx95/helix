# Scene models (.glb)

The stage map's 3D scene (`src/components/scene`) draws low-poly stand-ins from code.
Drop a file here named after a slot and it replaces that stand-in automatically — no code change:

| file | what | notes |
|---|---|---|
| `tree.glb` | round tree | ~2 units tall |
| `pine.glb` | cone tree | ~2.2 units tall |
| `willow.glb` | glowing willow | ~2 units tall |
| `bush.glb` | bush | ~0.8 units tall |
| `mushroom.glb` | mushroom | ~1 unit tall |
| `rock.glb` | rock | ~0.8 units tall |
| `crystal.glb` | glowing crystal | ~1 unit tall |
| `arch.glb` | stone arch over the path | ~2.4 wide; the opening faces ±Z (the path runs through it) |

Spec: binary glTF (`.glb`), ≤ ~200 KB each, 1 unit = 1 metre, origin at the **base centre** (y = 0 is the ground),
facing +Z. Instances are randomly rotated about Y and scaled 0.8–1.25×. Keep materials simple (baked colour / emissive).
The island/ground and path tiles are procedural only.
Missing file = stand-in is used. Models load lazily and only in rich mode.

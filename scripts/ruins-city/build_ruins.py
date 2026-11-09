"""Overgrown-city kit (bright cartoon style). Original geometry + generated textures, no reference pixels.
Run: /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/ruins-city/build_ruins.py
Blender Z-up, front of every asset faces -Y, metres. Exported Y-up GLB, one file per asset.
"""
import bpy, math, random, json, pathlib
import numpy as np
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/overgrown'; TEX = OUT / 'textures'; SRC = ROOT / 'art/overgrown'
for d in (OUT, TEX, SRC): d.mkdir(parents=True, exist_ok=True)
random.seed(12)
N = 512
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)


# ------------------------------------------------------------------ textures
def fnoise(freq, seed, aniso=(1, 1)):
    r = np.random.default_rng(seed); F = np.fft.fft2(r.standard_normal((N, N)))
    fy, fx = np.meshgrid(np.fft.fftfreq(N) * N, np.fft.fftfreq(N) * N, indexing='ij')
    flt = np.exp(-(fx ** 2 / (2 * (freq * aniso[1]) ** 2) + fy ** 2 / (2 * (freq * aniso[0]) ** 2)))
    o = np.real(np.fft.ifft2(F * flt)); return (o - o.min()) / (o.max() - o.min())


def lerp(a, b, t): return np.array(a)[None, None, :] * (1 - t[..., None]) + np.array(b)[None, None, :] * t[..., None]


YY, XX = np.mgrid[0:N, 0:N] / N


def dots(base, n, rad, light, dark, seed):
    r = np.random.default_rng(seed); out = base.copy()
    for _ in range(n):
        cy, cx = r.integers(0, N, 2); rr = int(r.integers(rad[0], rad[1])); sh = r.random()
        y0, y1, x0, x1 = max(cy - rr, 0), min(cy + rr, N), max(cx - rr, 0), min(cx + rr, N)
        yy, xx = np.mgrid[y0:y1, x0:x1]; d = np.hypot(yy - cy, (xx - cx) * 1.25) / rr
        m = d < 1; k = (sh * .6 + .4 * np.clip(1 - (yy - cy + rr * .4) / (2 * rr), 0, 1))[..., None]; col = np.array(dark) + (np.array(light) - np.array(dark)) * k
        patch = out[y0:y1, x0:x1]; patch[m] = col[m] * (1 - .35 * d[m][:, None])
    return out


def tex_ivy(seed, light, mid, dark):
    t = fnoise(9, seed); base = lerp(dark, mid, t); return dots(base, 1700, (5, 12), light, mid, seed + 1)


def tex_plaster(c0, c1, seed, stain=.5):
    t = .55 + .3 * fnoise(14, seed) + .15 * fnoise(60, seed + 1)
    rgb = lerp(c0, c1, t)
    streak = fnoise(45, seed + 2, aniso=(.06, 1)); rgb *= (1 - stain * .32 * np.clip((streak - .45) * 3, 0, 1))[..., None]
    rgb *= (1 - .25 * np.clip(YY - .75, 0, 1) * 4 * fnoise(20, seed + 3))[..., None]
    rgb = rgb * (1 - .25 * (np.abs(np.sin(XX * math.tau * 3)) < .01)[..., None])
    return rgb


def tex_patina(seed):
    t = .5 + .35 * fnoise(11, seed) + .15 * fnoise(70, seed + 1)
    rgb = lerp((.20, .55, .53), (.60, .86, .78), np.clip(t, 0, 1))
    streak = fnoise(55, seed + 2, aniso=(.05, 1)); rgb = rgb * (1 - .35 * np.clip((streak - .5) * 3, 0, 1))[..., None]
    rust = np.clip((fnoise(40, seed + 3) - .66) * 7, 0, 1) * np.clip((streak - .35) * 3, 0, 1)
    rgb = rgb * (1 - rust[..., None] * .8) + np.array((.58, .36, .16)) * (rust[..., None] * .8)
    return rgb


def tex_stone(seed, c0, c1, rows=6):
    t = .5 + .3 * fnoise(18, seed) + .2 * fnoise(80, seed + 1)
    rgb = lerp(c0, c1, np.clip(t, 0, 1))
    line = (np.abs(np.sin(YY * math.tau * rows / 2)) < .035) | (np.abs(np.sin((XX + (np.floor(YY * rows) % 2) * .5 / 3) * math.tau * 1.5)) < .03)
    rgb[line] *= .55
    moss = np.clip((fnoise(16, seed + 4) - .55) * 4, 0, 1)[..., None]
    return rgb * (1 - moss) + np.array((.35, .6, .15)) * moss


def tex_grass(seed):
    t = fnoise(10, seed); rgb = lerp((.38, .66, .15), (.64, .86, .26), t)
    blades = fnoise(120, seed + 1); rgb *= (.85 + .3 * blades)[..., None]
    patch = np.clip((fnoise(7, seed + 2) - .6) * 6, 0, 1)[..., None]
    return rgb * (1 - patch * .5) + np.array((.8, .9, .3)) * patch * .25


def tex_pathblend(seed):
    g = tex_grass(seed)
    centre = .5 + .06 * np.sin(YY * math.tau) + .03 * np.sin(YY * math.tau * 3 + 1)
    edge = .17 + .05 * (fnoise(30, seed + 5) - .5)
    d = np.abs(XX - centre) - edge
    m = np.clip(-d * 40, 0, 1)
    dirt = lerp((.62, .46, .26), (.82, .66, .40), .5 + .4 * fnoise(25, seed + 6) * np.ones((N, N)))
    dirt *= (.88 + .2 * fnoise(110, seed + 7))[..., None]
    rim = np.clip(1 - np.abs(d) * 30, 0, 1)[..., None]
    out = g * (1 - m[..., None]) + dirt * m[..., None]
    return out * (1 - rim * .08)


def tex_dirt(seed):
    return lerp((.58, .42, .22), (.80, .64, .38), .45 + .4 * fnoise(20, seed)) * (.9 + .2 * fnoise(100, seed + 1))[..., None]


def tex_wood(seed, c0=(.28, .16, .08), c1=(.60, .38, .18)):
    t = .5 + .3 * np.sin(YY * math.tau * 9 + fnoise(8, seed) * 4) * .5 + .3 * fnoise(60, seed + 1, aniso=(1, .05))
    rgb = lerp(c0, c1, np.clip(t, 0, 1)); rgb[(np.abs(np.sin(XX * math.tau * 4)) < .02)] *= .5; return rgb


def tex_awning(c0, c1):
    s = (np.floor(XX * 10) % 2)[..., None]; base = np.array(c0)[None, None, :] * s + np.array(c1)[None, None, :] * (1 - s)
    return base * (.92 + .1 * fnoise(30, 9))[..., None]


def tex_water(seed):
    caustic = np.exp(-np.abs(np.sin(XX * math.tau * 5 + fnoise(6, seed) * 6) * np.sin(YY * math.tau * 4 + fnoise(6, seed + 1) * 6)) * 14)
    return lerp((.08, .55, .55), (.45, .92, .85), np.clip(.3 + .3 * fnoise(8, seed + 2) + .45 * caustic, 0, 1))


def tex_fall(seed):
    s = fnoise(60, seed, aniso=(.04, 1)); return lerp((.55, .86, .95), (1, 1, 1), np.clip(s * 1.4, 0, 1))


def tex_van(seed):
    base = lerp((.80, .82, .78), (.95, .96, .93), fnoise(12, seed))
    streak = fnoise(40, seed + 1, aniso=(.06, 1)); base *= (1 - .3 * np.clip((streak - .45) * 3, 0, 1))[..., None]
    moss = np.clip((fnoise(9, seed + 2) - .58) * 5, 0, 1)[..., None]
    base = base * (1 - moss) + np.array((.4, .68, .2)) * moss
    rust = np.clip((fnoise(30, seed + 3) - .72) * 8, 0, 1)[..., None]; return base * (1 - rust * .6) + np.array((.6, .34, .15)) * rust * .6


def tex_car(seed):
    base = lerp((.18, .72, .62), (.40, .88, .76), fnoise(12, seed))
    streak = fnoise(40, seed + 1, aniso=(.06, 1)); base *= (1 - .25 * np.clip((streak - .5) * 3, 0, 1))[..., None]
    rust = np.clip((fnoise(28, seed + 3) - .68) * 8, 0, 1)[..., None]; return base * (1 - rust * .7) + np.array((.55, .32, .14)) * rust * .7


def flat(c): return np.ones((N, N, 3)) * np.array(c)[None, None, :] * (.95 + .08 * fnoise(30, 3))[..., None]


TEXGEN = {
    'patina': lambda: tex_patina(1), 'patina_dark': lambda: flat((.08, .27, .27)),
    'ivy': lambda: tex_ivy(2, (.72, .92, .22), (.36, .70, .14), (.10, .38, .10)),
    'leaf': lambda: tex_ivy(3, (.80, .95, .30), (.45, .78, .18), (.18, .50, .12)),
    'plaster_a': lambda: tex_plaster((.80, .72, .50), (.95, .90, .72), 4), 'plaster_b': lambda: tex_plaster((.52, .70, .72), (.80, .92, .88), 5),
    'plaster_c': lambda: tex_plaster((.82, .55, .42), (.97, .80, .66), 6), 'plaster_d': lambda: tex_plaster((.55, .55, .58), (.80, .80, .82), 7),
    'glass': lambda: flat((.16, .26, .34)), 'frame': lambda: flat((.88, .85, .74)), 'roof_slab': lambda: tex_stone(8, (.45, .45, .46), (.70, .70, .68), 2),
    'wood': lambda: tex_wood(9), 'wood_light': lambda: tex_wood(10, (.5, .32, .16), (.82, .58, .30)),
    'awning': lambda: tex_awning((.20, .40, .75), (.95, .95, .92)), 'awning_red': lambda: tex_awning((.82, .25, .18), (.97, .94, .88)),
    'stone': lambda: tex_stone(11, (.50, .46, .40), (.80, .76, .66)), 'stone_grey': lambda: tex_stone(12, (.42, .44, .43), (.72, .74, .70), 3),
    'grass': lambda: tex_grass(13), 'pathblend': lambda: tex_pathblend(13), 'dirt': lambda: tex_dirt(14),
    'water': lambda: tex_water(15), 'waterfall': lambda: tex_fall(16),
    'vanwhite': lambda: tex_van(17), 'carteal': lambda: tex_car(18), 'tire': lambda: flat((.10, .11, .12)),
    'gold': lambda: flat((.95, .72, .20)), 'bumper': lambda: flat((.55, .57, .58)), 'crate': lambda: tex_wood(19, (.62, .36, .12), (.92, .62, .24)),
}
MATS = {}
ROUGH = {'water': .2, 'glass': .15, 'gold': .4, 'patina': .75}


def mat(name):
    if name in MATS: return MATS[name]
    rgb = np.clip(TEXGEN[name](), 0, 1); rgba = np.ones((N, N, 4), dtype=np.float32); rgba[:, :, :3] = rgb
    img = bpy.data.images.new('og_' + name, width=N, height=N, alpha=False); img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(TEX / (name + '.png')); img.file_format = 'PNG'; img.save()
    m = bpy.data.materials.new('og_' + name); m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']; tx = m.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img
    m.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = ROUGH.get(name, .88)
    bs.inputs['Specular IOR Level'].default_value = .2
    MATS[name] = m; return m


# ------------------------------------------------------------------ geometry helpers
cur = []


def box_uv(ob, s):
    me = ob.data; layer = me.uv_layers.active or me.uv_layers.new(name='UVMap'); off = (hash(ob.name) % 97) / 97.0
    for p in me.polygons:
        axis = max(range(3), key=lambda k: abs(p.normal[k])); a0, a1 = [k for k in range(3) if k != axis]
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co; layer.data[li].uv = (co[a0] * s + off, co[a1] * s + off)


def place(ob, m, uvs, smooth, rot=(0, 0, 0)):
    ob.data.materials.clear(); ob.data.materials.append(mat(m)); ob.rotation_euler = rot
    for p in ob.data.polygons: p.use_smooth = smooth
    box_uv(ob, uvs); cur.append(ob); return ob


def cube(name, loc, size, m, rot=(0, 0, 0), bevel=.03, uvs=.5):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); ob = bpy.context.object; ob.name = name
    ob.dimensions = size; bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        md = ob.modifiers.new('b', 'BEVEL'); md.width = min(bevel, min(size) * .3); md.segments = 2; bpy.ops.object.modifier_apply(modifier='b')
    return place(ob, m, uvs, False, rot)


def ell(name, loc, rad, m, seg=24, rings=14, rot=(0, 0, 0), uvs=.5, jitter=0.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc); ob = bpy.context.object; ob.name = name
    if jitter:
        for v in ob.data.vertices: v.co *= 1 + random.uniform(-jitter, jitter)
    ob.scale = rad; bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return place(ob, m, uvs, True, rot)


def blob(name, loc, r, m='ivy', squash=(1, 1, .75), uvs=.6):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=loc); ob = bpy.context.object; ob.name = name
    for v in ob.data.vertices: v.co *= 1 + random.uniform(-.16, .16)
    ob.scale = (r * squash[0], r * squash[1], r * squash[2]); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.rotation_euler = (0, 0, random.uniform(0, 6)); return place(ob, m, uvs, True, ob.rotation_euler)


def cyl(name, loc, r, h, m, verts=24, rot=(0, 0, 0), uvs=.5, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc); ob = bpy.context.object; ob.name = name
    return place(ob, m, uvs, smooth, rot)


def cone(name, base, direction, length, r, m):
    d = Vector(direction).normalized(); c = Vector(base) + d * length / 2
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=r, radius2=0, depth=length, location=c); ob = bpy.context.object; ob.name = name
    return place(ob, m, .5, True, Vector((0, 0, 1)).rotation_difference(d).to_euler())


MANIFEST = []


def finish(aid, label, ground=True):
    for o in bpy.data.objects: o.select_set(False)
    for o in cur: o.select_set(True)
    bpy.context.view_layer.objects.active = cur[0]; bpy.ops.object.join(); ob = bpy.context.object; ob.name = aid
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    md = ob.modifiers.new('t', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier='t')
    if ground:
        mn = min(v.co.z for v in ob.data.vertices)
        for v in ob.data.vertices: v.co.z -= mn
    ob.data.update(); tris = len(ob.data.polygons)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    path = OUT / (aid + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT')
    MANIFEST.append({'id': aid, 'label': label, 'file': aid + '.glb', 'triangles': tris, 'bytes': path.stat().st_size})
    bpy.ops.object.delete(); cur.clear()
    for me in list(bpy.data.meshes):
        if me.users == 0: bpy.data.meshes.remove(me)
    print('BUILT', aid, tris, path.stat().st_size)


# ------------------------------------------------------------------ assets
def build_statue():
    P, D = 'patina', 'patina_dark'
    ell('skull', (0, 0, 0), (.95, 1.05, 1.3), P, 48, 32)
    ell('nose', (0, -1.0, -.1), (.14, .32, .55), P, rot=(math.radians(14), 0, 0))
    for sx in (-1, 1):
        ell('nostril', (sx * .13, -1.1, -.3), (.12, .13, .1), P)
        ell('lid', (sx * .38, -.93, .2), (.26, .11, .11), P)
        ell('eyeslit', (sx * .38, -1.01, .19), (.21, .04, .035), D)
        ell('cheek', (sx * .55, -.82, -.28), (.32, .24, .3), P)
        ell('hair side', (sx * .92, .0, .12), (.4, .95, 1.05), P)
        ell('hair low', (sx * .95, .3, -.5), (.36, .85, .6), P)
        ell('hair fringe', (sx * .46, -.72, .6), (.52, .38, .32), P)
        ell('shoulder', (sx * 1.2, .5, -1.55), (.8, 1.1, .8), P)
    ell('brow', (0, -.9, .34), (.8, .23, .14), P)
    ell('lip up', (0, -.98, -.5), (.3, .1, .07), P); ell('lip low', (0, -.96, -.62), (.26, .1, .07), P)
    ell('mouthline', (0, -1.05, -.555), (.26, .03, .025), D)
    ell('chin', (0, -.8, -.86), (.4, .3, .3), P)
    ell('bun', (0, .95, .0), (.9, .5, 1.1), P); ell('hair top', (0, .05, .62), (1.0, 1.05, .75), P)
    cyl('neck', (0, .15, -1.25), .65, 1.0, P, 32); ell('robe', (0, .65, -1.9), (1.6, 1.3, .9), P)
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=.13, major_segments=48, minor_segments=12, location=(0, .02, .8)); band = bpy.context.object
    band.scale = (1.03, 1.12, 1.0); bpy.ops.object.transform_apply(scale=True); place(band, P, .5, True)
    for i in range(10):
        a = math.radians(-80 + i * 160 / 9); ell('slit', (math.sin(a) * 1.04, -math.cos(a) * 1.13, .8), (.045, .035, .1), D, 10, 8, rot=(0, 0, -a))
    for i in range(7):
        a = math.radians(-78 + i * 156 / 6); L = 1.9 - .5 * abs(a) / math.radians(78)
        cone('spike', (math.sin(a) * .98, -math.cos(a) * 1.05, .88), (math.sin(a) * .85, -math.cos(a) * .8, .6), L, .14, P)
    for i in range(16):
        a = random.uniform(0, math.tau); z = random.uniform(.3, 1.2)
        blob('ivy tuft', (math.cos(a) * .9 * (1 - z / 2), math.sin(a) * 1.0 * (1 - z / 2), z * 1.0), random.uniform(.16, .3), 'ivy')
    for i in range(7): blob('ivy crown', (random.uniform(-.8, .8), random.uniform(.2, 1), random.uniform(.9, 1.1)), random.uniform(.2, .32), 'leaf')
    finish('statue-head', 'Giant statue head (original stylization)')


def building(aid, label, w, d, floors, plaster, seed):
    random.seed(seed); fh = 1.15; H = floors * fh
    cube('body', (0, 0, H / 2), (w, d, H), plaster, bevel=.04, uvs=.28)
    cube('base band', (0, 0, .12), (w + .1, d + .1, .24), 'stone_grey', uvs=.4)
    cube('roof slab', (0, 0, H + .06), (w + .2, d + .2, .14), 'roof_slab', uvs=.4)
    cols = max(2, int(w / .95)); 
    for f in range(floors):
        for c in range(cols):
            if random.random() < .08: continue
            x = -w / 2 + (c + .5) * w / cols; z = .85 + f * fh
            for face, (px, py, sx, sy) in enumerate([(x, -d / 2 - .01, .52, .04)]):
                cube('win', (px, py, z), (sx, .05, .62), 'glass', bevel=0, uvs=.5)
                cube('sill', (px, py - .02, z - .36), (sx + .14, .09, .06), 'frame', bevel=.01)
        for c in range(max(2, int(d / .95))):
            y = -d / 2 + (c + .5) * d / max(2, int(d / .95)); z = .85 + f * fh
            if random.random() < .08: continue
            cube('win side', (w / 2 + .01, y, z), (.05, .52, .62), 'glass', bevel=0)
    cube('door', (random.uniform(-w / 4, w / 4), -d / 2 - .01, .55), (.7, .05, .9), 'wood', bevel=.01)
    for i in range(2): cube('parapet', (0, (-1 if i else 1) * (d / 2 + .07), H + .24), (w + .2, .1, .36), plaster, bevel=.02, uvs=.3)
    cyl('tank', (random.uniform(-w / 4, w / 4), random.uniform(-d / 4, d / 4), H + .6), .35, .8, 'wood', 14)
    for i in range(int(40 + floors * 8)):
        side = random.random()
        if side < .35: p = (random.choice((-1, 1)) * w / 2, random.uniform(-d / 2, d / 2), random.uniform(.5, H))
        elif side < .7: p = (random.uniform(-w / 2, w / 2), -d / 2, random.uniform(.4, H))
        else: p = (random.uniform(-w / 2, w / 2), random.uniform(-d / 2, d / 2), H + random.uniform(.05, .2))
        blob('ivy', p, random.uniform(.2, .5), 'ivy' if random.random() < .6 else 'leaf')
    for i in range(8):
        x = random.uniform(-w / 2, w / 2); blob('ivy curtain', (x, -d / 2 - .08, H - random.uniform(.6, 2.2)), .3, 'ivy', squash=(.7, .45, 2.0))
    for i in range(6): blob('roof bush', (random.uniform(-w / 2, w / 2), random.uniform(-d / 2, d / 2), H + .3), random.uniform(.3, .55), 'leaf')
    finish(aid, label)


def build_shop():
    random.seed(21)
    cube('floor', (0, 0, .06), (2.9, 2.3, .12), 'stone_grey')
    cube('back', (0, .95, .85), (2.6, .14, 1.6), 'plaster_a', uvs=.4); cube('wall l', (-1.3, 0, .85), (.14, 2.0, 1.6), 'plaster_a', uvs=.4); cube('wall r', (1.3, 0, .85), (.14, 2.0, 1.6), 'plaster_a', uvs=.4)
    cube('interior', (0, .86, .85), (2.4, .02, 1.4), 'glass', bevel=0)
    cube('roof', (0, 0, 1.78), (3.0, 2.4, .16), 'roof_slab', uvs=.4)
    cube('counter', (0, -.3, .45), (2.1, .55, .7), 'wood_light'); cube('counter top', (0, -.3, .82), (2.25, .65, .08), 'wood')
    for i in range(5): cube('crate', (-.8 + i * .4, .35, .3), (.34, .34, .34), 'crate', rot=(0, 0, random.uniform(-.2, .2)))
    cube('shelf', (0, .8, 1.1), (2.1, .2, .06), 'wood')
    for i in range(4): cube('goods', (-.7 + i * .45, .78, 1.22), (.28, .15, .2), 'awning_red' if i % 2 else 'awning', bevel=.02)
    cube('awning', (0, -1.38, 1.62), (3.0, 1.0, .07), 'awning', rot=(math.radians(-22), 0, 0), bevel=.01, uvs=.35)
    cube('valance', (0, -1.78, 1.38), (3.0, .05, .24), 'awning', bevel=.01, uvs=.35)
    cube('sign', (0, -.55, 2.2), (1.9, .12, .6), 'wood', uvs=.5)
    bpy.ops.object.text_add(location=(0, -.64, 2.2)); t = bpy.context.object; t.data.body = 'SHOP'; t.data.size = .42; t.data.extrude = .035
    t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'; t.rotation_euler = (math.pi / 2, 0, 0); bpy.ops.object.convert(target='MESH'); t = bpy.context.object
    t.data.materials.append(mat('gold')); box_uv(t, 1.0); cur.append(t)
    for sx in (-1.7, 1.7):
        cyl('barrel', (sx, -.9, .3), .28, .6, 'wood', 18); cyl('band', (sx, -.9, .22), .29, .05, 'bumper', 18); cyl('band', (sx, -.9, .4), .29, .05, 'bumper', 18)
    cyl('barrel', (1.45, -1.35, .3), .26, .55, 'wood', 18)
    for i in range(34):
        p = (random.uniform(-1.5, 1.5), random.uniform(-1.1, 1.1), 1.9 + random.uniform(0, .2)) if i < 22 else (random.choice((-1.35, 1.35)), random.uniform(-1, 1), random.uniform(.3, 1.7))
        blob('ivy', p, random.uniform(.18, .38), 'ivy' if i % 3 else 'leaf')
    finish('shop-awning', 'Small shop with striped awning')


def wheels(positions, r=.32, w=.24):
    for p in positions:
        cyl('tire', p, r, w, 'tire', 20, rot=(math.pi / 2, 0, 0)); cyl('hub', (p[0], p[1] + (-.02 if p[1] < 0 else .02), p[2]), r * .5, w + .02, 'bumper', 14, rot=(math.pi / 2, 0, 0))


def build_van():
    random.seed(31)
    cube('body', (0, 0, .95), (2.7, 1.2, 1.1), 'vanwhite', bevel=.12, uvs=.3); cube('hood', (1.55, 0, .62), (.8, 1.15, .55), 'vanwhite', bevel=.1, uvs=.3)
    cube('windshield', (1.3, 0, 1.2), (.06, .95, .5), 'glass', rot=(0, math.radians(-18), 0), bevel=0)
    for sy in (-.61, .61): cube('window', (.85, sy, 1.2), (.9, .03, .42), 'glass', bevel=0); cube('window rear', (-.55, sy, 1.2), (.6, .03, .42), 'glass', bevel=0)
    cube('bumper f', (1.98, 0, .38), (.14, 1.2, .2), 'bumper'); cube('bumper b', (-1.38, 0, .38), (.14, 1.2, .2), 'bumper')
    wheels([(sx, sy, .32) for sx in (1.1, -.85) for sy in (-.62, .62)])
    for i in range(9): blob('moss', (random.uniform(-1.1, 1.0), random.uniform(-.45, .45), 1.55 + random.uniform(0, .1)), random.uniform(.18, .34), 'leaf', squash=(1.2, 1, .45))
    for i in range(3): blob('vine', (random.uniform(-1, .4), -.62, random.uniform(.7, 1.3)), .2, 'ivy', squash=(.9, .4, 1.2))
    finish('van-wrecked', 'Abandoned moss-covered van')


def build_car():
    random.seed(32)
    cube('body', (0, 0, .55), (2.9, 1.3, .6), 'carteal', bevel=.12, uvs=.3); cube('cabin', (-.2, 0, 1.0), (1.5, 1.1, .5), 'carteal', bevel=.12, uvs=.3)
    cube('windshield', (.6, 0, 1.0), (.05, .95, .42), 'glass', rot=(0, math.radians(28), 0), bevel=0); cube('rear glass', (-1.0, 0, 1.0), (.05, .95, .4), 'glass', rot=(0, math.radians(-28), 0), bevel=0)
    for sy in (-.56, .56): cube('window', (-.2, sy, 1.02), (1.1, .03, .36), 'glass', bevel=0)
    cube('bumper f', (1.5, 0, .35), (.12, 1.3, .18), 'bumper'); cube('bumper b', (-1.5, 0, .35), (.12, 1.3, .18), 'bumper')
    wheels([(sx, sy, .3) for sx in (.95, -.95) for sy in (-.66, .66)], .3)
    for i in range(7): blob('moss', (random.uniform(-.9, .6), random.uniform(-.4, .4), 1.3 + random.uniform(0, .08)), random.uniform(.16, .3), 'leaf', squash=(1.2, 1, .45))
    finish('car-wrecked', 'Abandoned teal car')


def build_stairs():
    random.seed(41)
    for i in range(9): cube('step', (0, i * .5, .11 * (i + 1)), (2.4, .5, .22 * (i + 1)), 'stone', bevel=.03, uvs=.5)
    for sx in (-1.3, 1.3):
        for i in range(9): cube('wall', (sx, i * .5, .11 * (i + 1) + .17), (.22, .5, .22 * (i + 1) + .34), 'stone_grey', bevel=.03, uvs=.5)
    for i in range(24): blob('ivy', (random.choice((-1.3, 1.3, random.uniform(-1.1, 1.1))), random.uniform(0, 4.3), random.uniform(.2, 1.6)), random.uniform(.14, .3), 'ivy' if i % 2 else 'leaf')
    finish('stairs-stone', 'Overgrown stone stairs')


def tile(aid, label, m, size=8.0, n=16, hump=.06):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=n, y_subdivisions=n, size=size); ob = bpy.context.object; ob.name = aid
    r = np.random.default_rng(5)
    for v in ob.data.vertices:
        if abs(v.co.x) < size / 2 - .01 and abs(v.co.y) < size / 2 - .01: v.co.z = (r.random() - .5) * hump
    me = ob.data; layer = me.uv_layers.active or me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co; layer.data[li].uv = (co.x / size + .5, co.y / size + .5)
    ob.data.materials.append(mat(m))
    for p in me.polygons: p.use_smooth = True
    cur.append(ob); return ob


def build_pond():
    tile('pond-ground', '', 'grass')
    cyl('mud', (0, 0, .03), 2.45, .05, 'dirt', 40); cyl('water', (0, 0, .07), 2.15, .06, 'water', 40, uvs=.3)
    for i in range(16):
        a = i * math.tau / 16 + random.uniform(-.1, .1); ell('rim stone', (math.cos(a) * 2.38, math.sin(a) * 2.38, .12), (.34, .26, .18), 'stone_grey', 12, 8, rot=(0, 0, a), jitter=.1)
    for i in range(10): blob('reed', (math.cos(i) * 2.7, math.sin(i * 1.3) * 2.7, .3), .22, 'leaf', squash=(.8, .8, 1.3))
    finish('pond-small', 'Small pond with rim stones', ground=False)


def build_fall():
    for i in range(6): cube('fall', (0, -.05 * i * 0.4, 3.0 - i * .5), (.42 - i * .01, .1, .52), 'waterfall', bevel=0, uvs=.4)
    for i in range(7): ell('splash', (random.uniform(-.4, .4), -.1, .15), (.22, .16, .16), 'waterfall', 10, 8)
    finish('waterfall-stream', 'Thin waterfall ribbon', ground=True)


def build_tree():
    random.seed(51)
    cyl('trunk', (0, 0, .8), .2, 1.6, 'wood', 12); cyl('flare', (0, 0, .15), .36, .3, 'wood', 12)
    for i in range(6): blob('crown', (random.uniform(-.55, .55), random.uniform(-.55, .55), 1.9 + random.uniform(-.3, .8)), random.uniform(.55, .85), 'leaf', squash=(1, 1, .85))
    finish('tree-round', 'Round cartoon tree')


def build_bush():
    random.seed(52)
    for i in range(4): blob('bush', (random.uniform(-.35, .35), random.uniform(-.35, .35), .3 + random.uniform(0, .15)), random.uniform(.3, .5), 'ivy' if i % 2 else 'leaf')
    finish('bush-round', 'Round bush')


build_statue()
building('building-ivy-a', 'Ivy tower (cream, 7 floors)', 4.0, 3.6, 7, 'plaster_a', 61)
building('building-ivy-b', 'Ivy block (green-grey, 5 floors)', 4.8, 3.8, 5, 'plaster_b', 62)
building('building-ivy-c', 'Ivy low-rise (peach, 3 floors)', 3.6, 3.2, 3, 'plaster_c', 63)
build_shop(); build_van(); build_car(); build_stairs()
tile('ground-grass', 'Grass tile 8x8', 'grass'); finish('ground-grass', 'Grass ground tile 8x8 m', ground=False)
tile('ground-path', 'Dirt path tile 8x8', 'pathblend'); finish('ground-path', 'Dirt path tile 8x8 m (continues along Y)', ground=False)
build_pond(); build_fall(); build_tree(); build_bush()
(OUT / 'manifest.json').write_text(json.dumps({'pack': 'overgrown-city', 'style': 'bright cartoon 3D', 'assets': MANIFEST}, indent=1, ensure_ascii=False))
bpy.ops.wm.save_as_mainfile(filepath=str(SRC / 'overgrown-kit.blend'))
print('RUINS_COMPLETE', len(MANIFEST), sum(a['triangles'] for a in MANIFEST))

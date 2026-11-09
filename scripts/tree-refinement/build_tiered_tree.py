"""Tiered-canopy fantasy tree (original). Blender 5.2 CLI; no reference pixels used.
Run: /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/tree-refinement/build_tiered_tree.py

Silhouette direction: short twisted trunk with a mossy flare, 5 flat-bottomed
dome canopies stacked off-axis, ragged fringe, dark plum undersides, yellow-green tops.
"""
import bpy, bmesh, math, random, pathlib, numpy as np
from mathutils import Vector

R = pathlib.Path(__file__).resolve().parents[2]
OUT = R / 'public/models/tree-refinement'; OUT.mkdir(parents=True, exist_ok=True)
TEX = OUT / 'textures'; TEX.mkdir(exist_ok=True)
SOURCE = R / 'art/tree-refinement'; SOURCE.mkdir(parents=True, exist_ok=True)
NAME = 'tiered-canopy-elder'
random.seed(4107)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 8; scene.cycles.bake_type = 'EMIT'
parts = []


def mesh(name, vs, fs, kind, **props):
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(me); bm.free(); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    ob['surface'] = kind
    for k, v in props.items(): ob[k] = v
    for p in me.polygons: p.use_smooth = True
    parts.append(ob)
    return ob


def tube(name, points, radii, twist=0.0):
    pts = [Vector(p) for p in points]
    pp = [pts[0]] + pts + [pts[-1]]; rr = [radii[0]] + radii + [radii[-1]]
    samples = []
    for i in range(1, len(pp) - 2):
        for k in range(8):
            t = k / 8
            p = .5 * ((2 * pp[i]) + (-pp[i - 1] + pp[i + 1]) * t + (2 * pp[i - 1] - 5 * pp[i] + 4 * pp[i + 1] - pp[i + 2]) * t * t + (-pp[i - 1] + 3 * pp[i] - 3 * pp[i + 1] + pp[i + 2]) * t * t * t)
            samples.append((p, rr[i] * (1 - t) + rr[i + 1] * t))
    samples.append((pts[-1], radii[-1]))
    vs = []; fs = []; n = 20
    for i, (p, r) in enumerate(samples):
        tg = (samples[min(i + 1, len(samples) - 1)][0] - samples[max(i - 1, 0)][0]).normalized()
        u = tg.cross(Vector((0, 1, 0)))
        if u.length < .05: u = tg.cross(Vector((1, 0, 0)))
        u.normalize(); v = tg.cross(u).normalized()
        for j in range(n):
            a = j * math.tau / n
            ridge = 1 + .13 * math.sin(a * 4 + i * twist) + .05 * math.sin(a * 9 - i * .17)
            vs.append(p + r * ridge * (u * math.cos(a) + v * math.sin(a)))
        if i:
            for j in range(n):
                fs.append(((i - 1) * n + j, (i - 1) * n + (j + 1) % n, i * n + (j + 1) % n, i * n + j))
    fs.append(tuple(reversed(range(n))))
    fs.append(tuple((len(samples) - 1) * n + j for j in range(n)))
    return mesh(name, vs, fs, 'wood')


# ---- trunk: short, thick, twisting, with a wide mossy flare ----------------------------
tube('trunk', [(0.15, 0, 0.02), (0.05, .05, .45), (-.12, .1, 1.0), (.1, .08, 1.6), (-.1, .04, 2.3), (-.2, 0, 3.1), (-.05, 0, 3.8)],
     [.78, .55, .46, .4, .33, .24, .1], twist=.35)
for i, (ang, l) in enumerate([(0.2, 1.25), (1.5, 1.0), (2.6, 1.2), (3.8, 1.3), (4.9, 1.0), (5.7, 1.15)]):
    x, y = math.cos(ang), math.sin(ang)
    tube('flare root %d' % i, [(0, 0, .75), (x * .45, y * .42, .3), (x * .9, y * .8, .1), (x * l, y * l, .035)], [.26, .24, .12, .015])
# branches carrying the canopies
for name, ps, rs in [
    ('branch A', [(0, 0, 1.45), (-.5, 0, 1.7), (-.95, 0, 2.0)], [.3, .2, .1]),
    ('branch B', [(0.05, 0, 1.6), (.65, .05, 1.85), (1.2, .1, 2.15)], [.27, .17, .08]),
    ('branch C', [(-.1, 0, 2.5), (-.35, 0, 2.95), (-.3, 0, 3.3)], [.26, .18, .1]),
    ('branch D', [(-.15, 0, 3.0), (.35, .05, 3.35), (.9, .1, 3.7)], [.2, .13, .07]),
    ('branch E', [(-.1, 0, 3.6), (.2, 0, 4.0), (.5, 0, 4.45)], [.14, .1, .06]),
]:
    tube(name, ps, rs)

# ---- canopies --------------------------------------------------------------------------
# (x, y, base z, rx, ry, height)
CANOPIES = [(-.95, 0, 1.95, 1.6, 1.4, 1.45), (1.25, .1, 2.1, 1.2, 1.08, 1.2), (-.3, 0, 3.25, 1.4, 1.2, 1.15),
            (.95, .1, 3.7, .95, .85, .85), (.5, 0, 4.5, .78, .7, .8)]
PROFILE = [(0.0, 1.0), (.2, .985), (.42, .93), (.62, .84), (.8, .68), (.93, .5), (1.0, .34), (1.0, .22), (.93, .12),
           (.78, .045), (.55, .0), (.3, .035), (.12, .09), (0.0, .11)]
NA = 132
for ci, (cx, cy, cz, rx, ry, h) in enumerate(CANOPIES):
    ph = random.uniform(0, 6)
    vs = []; fs = []
    for pi_, (rn, zn) in enumerate(PROFILE):
        for j in range(NA):
            a = j * math.tau / NA
            clump = .06 * math.sin(a * 5 + ph + rn * 3) + .035 * math.sin(a * 11 - ph) + .03 * math.sin(a * 17 + rn * 9)
            rad = rn * (1 + clump)
            z = zn * h
            # ragged fringe on the rim / underside edge
            if 5 <= pi_ <= 9:
                lobe = max(0, math.cos(a * 9 + ph + .8 * math.sin(a * 3 + ph))) ** 2          # wide soft droops
                tuft = max(0, math.cos(a * 27 - ph * 1.7 + 1.3 * math.sin(a * 5))) ** 2        # small ragged tufts
                fr = lobe * .2 + tuft * lobe * .14 + tuft * .05
                z -= fr * h * (.9 if pi_ >= 7 else .4)
                rad *= 1 + .03 * math.sin(a * 31 + ph)
            # soft bumpy top
            if pi_ <= 4:
                z += .055 * math.sin(a * 6 + rn * 8 + ph) * rn + .03 * math.sin(a * 13 - rn * 11) * rn
            vs.append((cx + rx * rad * math.cos(a), cy + ry * rad * math.sin(a), cz + z))
    for pi_ in range(len(PROFILE) - 1):
        for j in range(NA):
            fs.append((pi_ * NA + j, pi_ * NA + (j + 1) % NA, (pi_ + 1) * NA + (j + 1) % NA, (pi_ + 1) * NA + j))
    # cap bottom centre
    fs.append(tuple((len(PROFILE) - 1) * NA + j for j in range(NA)))
    fs.append(tuple(reversed(range(NA))))
    mesh('canopy %d' % ci, vs, fs, 'foliage', cz=cz, ch=h, seed=ph)

# ---- one object, unique UVs ------------------------------------------------------------
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
for o in parts:
    o.data.update()
# pigment (vertex colour -> baked texture)
for ob in parts:
    me = ob.data; attr = me.color_attributes.new(name='Pigment', type='FLOAT_COLOR', domain='CORNER')
    mattr = me.color_attributes.new(name='Mask', type='FLOAT_COLOR', domain='CORNER')
    mval = 0.0 if ob.get('surface') == 'wood' else 1.0
    for li in range(len(me.loops)): mattr.data[li].color = (mval, mval, mval, 1)
    wood = ob.get('surface') == 'wood'; seed = ob.get('seed', 0.0); cz = ob.get('cz', 0.0); ch = ob.get('ch', 1.0)
    for poly in me.polygons:
        for li in poly.loop_indices:
            vert = me.vertices[me.loops[li].vertex_index]; p = vert.co; n = vert.normal
            if wood:
                ang = math.atan2(p.y, p.x + .1)
                grain = math.sin(ang * 14 + p.z * 2.0 + math.sin(p.z * 3.1) * .9)
                t = .4 + .16 * grain + .08 * math.sin(ang * 31 - p.z * 4)
                lo = np.array((.05, .032, .02)); hi = np.array((.27, .19, .08)); col = lo + (hi - lo) * t
                moss = np.clip(1.2 - p.z / 1.1, 0, 1) * (.55 + .45 * max(0, n.z))
                col = col * (1 - moss * .8) + np.array((.34, .42, .08)) * moss * .8
            else:
                zr = (p.z - cz) / ch  # 0 = underside, ~1 = top of this canopy
                stipple = (math.sin(p.x * 17 + p.y * 9 + seed) + math.sin(p.y * 23 - p.z * 11) + math.sin(p.x * 31 - p.z * 7 + seed * 2)) / 3
                blob = (math.sin(p.x * 3.1 + seed) * math.sin(p.y * 2.7 - seed) + math.sin(p.z * 3.5 + p.x * 1.4)) / 2
                up = max(0.0, n.z)
                light = np.clip(.05 + .62 * up + .26 * (-n.x) + .24 * blob + .2 * stipple, 0, 1)  # light from upper left
                top = np.array((.50, .70, .06)); mid = np.array((.07, .30, .07)); shade = np.array((.01, .09, .07))
                col = shade + (mid - shade) * np.clip(light * 2, 0, 1)
                col = col + (top - mid) * np.clip(light * 2 - 1, 0, 1) ** 1.3 * (0.7 + .3 * stipple)
                # plum / maroon underside like the underneath of the foliage
                under = np.clip((.38 - zr) * 3.2 + (-n.z) * .9, 0, 1)
                col = col * (1 - under) + np.array((.17, .055, .105)) * under * (.8 + .3 * stipple)
                # teal rim shadow on the right
                rim = np.clip(n.x * .8 - .2, 0, 1) * (1 - under)
                col = col * (1 - rim * .45) + np.array((.02, .13, .13)) * rim * .45
            attr.data[li].color = (*np.clip(col, 0, 1), 1)

bpy.ops.object.join(); tree = bpy.context.object; tree.name = 'Tiered canopy elder — original'
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.003); bpy.ops.object.mode_set(mode='OBJECT')
mat = bpy.data.materials.new('Tiered elder pigment atlas'); mat.use_nodes = True
nodes = mat.node_tree.nodes; nodes.clear(); links = mat.node_tree.links
out = nodes.new('ShaderNodeOutputMaterial'); emit = nodes.new('ShaderNodeEmission'); vc = nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Pigment'
links.new(vc.outputs['Color'], emit.inputs['Color']); links.new(emit.outputs[0], out.inputs[0])
tree.data.materials.clear(); tree.data.materials.append(mat)
for p in tree.data.polygons: p.material_index = 0
image = bpy.data.images.new('tiered_pigment', width=2048, height=2048, alpha=False)
tex = nodes.new('ShaderNodeTexImage'); tex.image = image; nodes.active = tex
scene.render.bake.margin = 6
bpy.ops.object.bake(type='EMIT')
image.filepath_raw = str(TEX / (NAME + '-pigment.png')); image.file_format = 'PNG'; image.save()
# --- painterly pass: brush-stroke clumps on foliage, vertical grain on wood (post-process of the bake) ---
vc.layer_name = 'Mask'
maskimg = bpy.data.images.new('tiered_mask', width=2048, height=2048, alpha=False); tex.image = maskimg
bpy.ops.object.bake(type='EMIT')
msk = np.array(maskimg.pixels[:], dtype=np.float32).reshape(2048, 2048, 4)[:, :, 0]
base = np.array(image.pixels[:], dtype=np.float32).reshape(2048, 2048, 4)
rng = np.random.default_rng(77)
fy, fx = np.meshgrid(np.fft.fftfreq(2048), np.fft.fftfreq(2048), indexing='ij')


def streak(angle, su, sv):
    wn = rng.standard_normal((2048, 2048))
    u = fx * math.cos(angle) + fy * math.sin(angle); v = -fx * math.sin(angle) + fy * math.cos(angle)
    flt = np.exp(-2 * math.pi ** 2 * ((u * su) ** 2 + (v * sv) ** 2))
    out = np.real(np.fft.ifft2(np.fft.fft2(wn) * flt)); return out / out.std()


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t)


brush = .55 * streak(.5, 9, 2.6) + .45 * streak(-.6, 7, 2.2)
clump = smooth(brush + .5 * streak(0, 22, 22), -.4, .9)             # leaf-clump masses
fine = streak(1.2, 3.2, 1.2)
fol = base[:, :, :3].copy()
lum = fol.mean(axis=2, keepdims=True)
c = clump[..., None]
f = fine[..., None]
paint = fol * (.62 + .62 * c + .09 * f)
paint += np.array((.10, .12, -.01)) * np.clip(lum * 2.4, 0, 1) * (c * c) * (1 + .3 * f)       # sunlit yellow flecks
paint *= (1 - .22 * smooth(-brush, .9, 2.0)[..., None])                                       # dark gaps between clumps
grain = (.7 * streak(1.57, 2.2, 14) + .3 * streak(1.5, 3, 7))[..., None]                       # vertical bark grain
wood = fol * (.78 + .24 * np.clip(grain, -2, 2) * .5 + .08 * f)
m = msk[..., None]
mixed = np.clip(paint * m + wood * (1 - m), 0, 1)
base[:, :, :3] = mixed
image.pixels.foreach_set(base.ravel()); image.filepath_raw = str(TEX / (NAME + '-pigment.png')); image.save()
vc.layer_name = 'Pigment'
ao = bpy.data.images.new('tiered_ao', width=2048, height=2048, alpha=False); ao.colorspace_settings.name = 'Non-Color'; tex.image = ao; nodes.active = tex
scene.world.color = (.15, .15, .15)
bpy.ops.object.bake(type='AO'); ao.filepath_raw = str(TEX / (NAME + '-ao.png')); ao.file_format = 'PNG'; ao.save()
pig = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4); a = np.array(ao.pixels[:], dtype=np.float32).reshape(-1, 4)
pig[:, :3] *= (.8 + .2 * a[:, :3]); image.pixels.foreach_set(pig.ravel()); image.filepath_raw = str(TEX / (NAME + '-basecolor.png')); image.save()
rough = bpy.data.images.new('tiered_roughness', width=2048, height=2048, alpha=False); rough.colorspace_settings.name = 'Non-Color'
r = np.ones_like(pig); r[:, :3] = np.clip(.86 + .08 * (1 - a[:, :3]), .8, .96); rough.pixels.foreach_set(r.ravel())
rough.filepath_raw = str(TEX / (NAME + '-roughness.png')); rough.file_format = 'PNG'; rough.save()
nodes.remove(emit); bs = nodes.new('ShaderNodeBsdfPrincipled'); links.new(bs.outputs[0], out.inputs[0])
tex.image = image; links.new(tex.outputs['Color'], bs.inputs['Base Color'])
rt = nodes.new('ShaderNodeTexImage'); rt.image = rough; links.new(rt.outputs['Color'], bs.inputs['Roughness'])
bs.inputs['Specular IOR Level'].default_value = .15
mod = tree.modifiers.new('Export triangulation', 'TRIANGULATE'); bpy.context.view_layer.objects.active = tree; bpy.ops.object.modifier_apply(modifier=mod.name)
tree.data.color_attributes.remove(tree.data.color_attributes.get('Pigment')); tree.data.color_attributes.remove(tree.data.color_attributes.get('Mask'))
bpy.ops.export_scene.gltf(filepath=str(OUT / (NAME + '.glb')), export_format='GLB', use_selection=True, export_yup=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT')

# ---- presentation scene (never exported) -----------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=200); ground = bpy.context.object; ground.name = 'Presentation ground — NOT exported'
gm = bpy.data.materials.new('light backdrop'); gm.diffuse_color = (.82, .82, .80, 1); ground.data.materials.append(gm); ground.location.z = -.025
world = scene.world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.84, .85, .84, 1); world.node_tree.nodes['Background'].inputs[1].default_value = .3
for nm, pos, energy, size, color in [('key', (-5, -7, 11), 1400, 5, (1, .93, .8)), ('fill', (6, -2, 6), 500, 5, (.8, .9, 1)), ('rim', (-1, 6, 9), 700, 4, (1, 1, .9))]:
    bpy.ops.object.light_add(type='AREA', location=pos); o = bpy.context.object; o.name = nm
    o.data.energy = energy; o.data.shape = 'DISK'; o.data.size = size; o.data.color = color
    o.rotation_euler = (Vector((0, 0, 2.6)) - o.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=(0, -16, 6.5)); cam = bpy.context.object; cam.name = 'Fixed game angle'; scene.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 8.4
cam.rotation_euler = (Vector((0, 0, 2.7)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.resolution_x = 1200; scene.render.resolution_y = 1200; scene.cycles.samples = 40
scene.view_settings.view_transform = 'Standard'
for im in [image, ao, rough]: im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (NAME + '.blend')))
scene.render.filepath = str(OUT / (NAME + '-render.png')); bpy.ops.render.render(write_still=True)
print('TIERED_TREE_COMPLETE', len(tree.data.polygons), str(OUT))

"""One original tree study. Blender 5.2 CLI; no baseline writes or reference pixels.
Run: /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/tree-refinement/build_tree.py
"""
import bpy, bmesh, math, random, json, pathlib, numpy as np
from mathutils import Vector
R=pathlib.Path(__file__).resolve().parents[2]
OUT=R/'public/models/tree-refinement'; OUT.mkdir(parents=True,exist_ok=True)
TEX=OUT/'textures'; TEX.mkdir(exist_ok=True)
SOURCE=R/'art/tree-refinement'; SOURCE.mkdir(parents=True,exist_ok=True)
random.seed(1937)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.cycles.bake_type='EMIT'
parts=[]

def mesh(name,vs,fs,kind):
    me=bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update()
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.update()
    ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob)
    ob['surface']=kind; parts.append(ob)
    for p in me.polygons:p.use_smooth=True
    return ob

def tube(name,points,radii):
    # Catmull-Rom interpolation: curved taper, no straight cylinder joints.
    pts=[Vector(p) for p in points]; pp=[pts[0]]+pts+[pts[-1]]; rr=[radii[0]]+radii+[radii[-1]]
    samples=[]
    for i in range(1,len(pp)-2):
        for k in range(6):
            t=k/6
            p=.5*((2*pp[i])+(-pp[i-1]+pp[i+1])*t+(2*pp[i-1]-5*pp[i]+4*pp[i+1]-pp[i+2])*t*t+(-pp[i-1]+3*pp[i]-3*pp[i+1]+pp[i+2])*t*t*t)
            rad=rr[i]*(1-t)+rr[i+1]*t
            samples.append((p,rad))
    samples.append((pts[-1],radii[-1])); vs=[]; fs=[]; n=16
    for i,(p,r) in enumerate(samples):
        tangent=(samples[min(i+1,len(samples)-1)][0]-samples[max(i-1,0)][0]).normalized()
        u=tangent.cross(Vector((0,1,0))).normalized(); v=tangent.cross(u).normalized()
        for j in range(n):
            a=j*math.tau/n; ridge=1+.10*math.sin(a*5+i*.08)+.045*math.sin(a*9-i*.15)
            vs.append(p+r*ridge*(u*math.cos(a)+v*math.sin(a)))
        if i:
            for j in range(n):
                a=(i-1)*n+j;b=(i-1)*n+(j+1)%n;c=i*n+(j+1)%n;d=i*n+j
                fs.append((a,b,c,d))
    fs.extend([tuple(reversed(range(n))),tuple((len(samples)-1)*n+j for j in range(n))])
    return mesh(name,vs,fs,'wood')

tube('01 sweeping heartwood',[(0,0,.04),(-.2,.03,.65),(-.28,.08,1.4),(.05,.1,2.35),(.27,.16,3.3),(.03,.22,4.25),(.42,.22,5.15)],[.57,.43,.35,.29,.21,.13,.025])
for i,(ang,l) in enumerate([(0,1.2),(1.1,1.05),(2.5,1.3),(3.6,1.45),(4.7,1.1),(5.5,.9)]):
    x,y=math.cos(ang),math.sin(ang)
    tube('buttress root %02d'%i,[(-.16,0,.88),(x*.37,y*.35,.38),(x*.81,y*.7,.13),(x*l,y*l,.055)],[.25,.25,.12,.012])
branches=[('left low',[(-.25,0,1.35),(-.85,-.08,2.0),(-1.55,-.12,2.35),(-2.12,-.1,2.95)],[.28,.23,.14,.028]),('right rising',[(0,.1,2.2),(.8,.05,2.65),(1.48,.05,3.15),(1.75,.04,3.85)],[.24,.19,.12,.022]),('back sweep',[(-.05,.13,2.6),(-.8,.8,3.2),(-1.18,1.03,3.85)],[.18,.12,.025]),('front fork',[(.22,.12,3.25),(-.3,-.45,3.7),(-.8,-.65,4.16)],[.16,.1,.015]),('high right',[(.08,.2,4.15),(.8,.43,4.55),(1.1,.38,4.85)],[.11,.075,.014])]
for name,ps,rs in branches:tube(name,ps,rs)
for name,ps,rs in branches[:4]:
    p=Vector(ps[-2]); q=Vector(ps[-1]); end=q+Vector((.45,-.35,.1))
    tube(name+' secondary fork',[p,p.lerp(end,.6),end],[rs[-2]*.65,.055,.008])
# Unify intersecting wood into a sculpt-like continuous trunk; retain source paths as editable mesh names in script.
wood=[o for o in parts if o['surface']=='wood']
bpy.ops.object.select_all(action='DESELECT')
for o in wood:o.select_set(True)
bpy.context.view_layer.objects.active=wood[0];bpy.ops.object.join(); trunk=bpy.context.object
mod=trunk.modifiers.new('Weld sculpted branch junctions','REMESH');mod.mode='VOXEL';mod.voxel_size=.045
bpy.ops.object.modifier_apply(modifier=mod.name)
mod=trunk.modifiers.new('Soften junctions','SMOOTH');mod.factor=.6;mod.iterations=3;bpy.ops.object.modifier_apply(modifier=mod.name)
mod=trunk.modifiers.new('Study mesh economy','DECIMATE');mod.ratio=.36;bpy.ops.object.modifier_apply(modifier=mod.name)
parts=[trunk]
# Designed crown composition: staggered lobes, not concentric canopy tiers.
clumps=[(-2.03,-.12,3.02,.85,.68,.44),(-1.4,.18,3.19,.72,.63,.47),(-2.35,.18,3.34,.56,.5,.39),(-1.67,-.55,2.94,.6,.47,.33),
(1.65,.08,3.88,.87,.64,.46),(2.12,.12,4.02,.55,.46,.35),(1.18,-.38,3.65,.58,.49,.37),
(-1.13,.98,4.02,.8,.62,.48),(-1.5,.69,4.22,.51,.49,.4),
(-.72,-.52,4.25,.78,.65,.5),(-.22,-.3,4.48,.63,.58,.44),
(.35,.22,5.12,.86,.67,.56),(.92,.4,4.91,.68,.55,.47),(.05,.26,5.52,.56,.49,.37),(.65,-.16,5.32,.5,.41,.35)]

def leaf_geom(center,direction,length,width,roll):
    # Thick closed lanceolate leaves with a raised midrib. No alpha planes.
    d=Vector(direction).normalized(); side=d.cross(Vector((0,0,1)))
    if side.length<.1:side=Vector((1,0,0))
    side.normalize(); normal=side.cross(d).normalized()
    if normal.z<0:normal=-normal
    base=Vector(center); tip=base+d*length+normal*.025
    mid=base+d*length*.48
    vs=[base,mid+side*width,tip,mid-side*width,mid+normal*length*.12,mid-normal*.018]
    return vs,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)]

for idx,(x,y,z,sx,sy,sz) in enumerate(clumps):
    vs=[];fs=[];n=24;m=12; phase=random.uniform(0,6)
    for i in range(m+1):
        lat=math.pi*i/m
        for j in range(n):
            a=j*math.tau/n
            wobble=1+.12*math.sin(a*3+phase)*math.sin(lat)+.055*math.cos(a*7-lat*5+phase)
            vs.append((x+sx*math.sin(lat)*math.cos(a)*wobble,y+sy*math.sin(lat)*math.sin(a)*wobble,z+sz*math.cos(lat)*wobble+.07*math.sin(a*3)*math.sin(lat)))
    for i in range(m):
        for j in range(n):fs.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
    ob=mesh('foliage mass %02d'%idx,vs,fs,'foliage');ob['variation']=random.uniform(-.06,.06)
    vs=[];fs=[]
    # Irrational-angle surface sampling breaks rings and tiled leaf patterns.
    for k in range(115):
        zz=1-2*(k+.5)/115;lat=math.acos(zz);a=k*2.399963+phase
        wobble=1+.12*math.sin(a*3+phase)*math.sin(lat)+.055*math.cos(a*7-lat*5+phase)
        p=Vector((x+sx*math.sin(lat)*math.cos(a)*wobble,y+sy*math.sin(lat)*math.sin(a)*wobble,z+sz*math.cos(lat)*wobble+.07*math.sin(a*3)*math.sin(lat)))
        d=Vector((math.cos(a+.3),math.sin(a+.3),-.25+.4*zz))
        length=random.uniform(.19,.35); width=length*random.uniform(.24,.38)
        vv,ff=leaf_geom(p,d,length,width,0);off=len(vs);vs+=vv;fs +=[tuple(off+i for i in f) for f in ff]
    ob=mesh('leaf tips %02d'%idx,vs,fs,'foliage');ob['variation']=random.uniform(-.04,.04)
# Original world-space pigment field becomes unique baked raster texture.
for ob in parts:
    me=ob.data; me.update(); attr=me.color_attributes.new(name='Pigment',type='FLOAT_COLOR',domain='CORNER')
    wood=ob.get('surface')=='wood'; var=ob.get('variation',0)
    for poly in me.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:
            vert=me.vertices[me.loops[li].vertex_index];p=vert.co;n=vert.normal
            if wood:
                angle=math.atan2(p.y,p.x+.15)
                grain=math.sin(angle*18+p.z*2.1+math.sin(p.z*3)*.9)
                small=math.sin(angle*43-p.z*5)
                t=.42+.15*grain+.045*small+.11*n.z
                lo=np.array((.055,.035,.018));hi=np.array((.30,.21,.09))
                col=lo+(hi-lo)*t
                moss=max(0,1-p.z/1.3)*max(0,n.z)*.5
                col=col*(1-moss)+np.array((.16,.23,.055))*moss
            else:
                cloud=(math.sin(p.x*4+p.z*3)+math.sin(p.y*6-p.z*2)+math.cos(p.x*8+p.y*3))/3
                t=max(0,min(1,.40+.27*n.z+.14*cloud+var))
                lo=np.array((.018,.075,.058));hi=np.array((.38,.49,.10))
                col=lo+(hi-lo)*t
            attr.data[li].color=(*col,1)
# Single atlas / unique UVs across every surface.
bpy.ops.object.select_all(action='DESELECT')
for ob in parts:ob.select_set(True)
bpy.context.view_layer.objects.active=trunk;bpy.ops.object.join();tree=bpy.context.object;tree.name='Windswept elder — original refinement'
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(68),island_margin=.003);bpy.ops.object.mode_set(mode='OBJECT')
mat=bpy.data.materials.new('Unique pigment atlas · matte foliage and aged wood');mat.use_nodes=True
nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
out=nodes.new('ShaderNodeOutputMaterial');emit=nodes.new('ShaderNodeEmission');col=nodes.new('ShaderNodeVertexColor');col.layer_name='Pigment';links.new(col.outputs['Color'],emit.inputs['Color']);links.new(emit.outputs[0],out.inputs[0])
tree.data.materials.clear();tree.data.materials.append(mat)
for p in tree.data.polygons:p.material_index=0
image=bpy.data.images.new('elder_unique_pigment',width=2048,height=2048,alpha=False)
tex=nodes.new('ShaderNodeTexImage');tex.image=image;nodes.active=tex
scene.render.bake.margin=6;scene.cycles.samples=8
bpy.ops.object.bake(type='EMIT')
image.filepath_raw=str(TEX/'elder-pigment.png');image.file_format='PNG';image.save()
ao=bpy.data.images.new('elder_contact_ao',width=2048,height=2048,alpha=False);ao.colorspace_settings.name='Non-Color';tex.image=ao
scene.world.color=(.15,.15,.15)
bpy.ops.object.bake(type='AO');ao.filepath_raw=str(TEX/'elder-ao.png');ao.file_format='PNG';ao.save()
# Bake restrained occlusion into albedo while preserving the independent AO source.
pig=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4);a=np.array(ao.pixels[:],dtype=np.float32).reshape(-1,4)
pig[:,:3]*=(.72+.28*a[:,:3]);image.pixels.foreach_set(pig.ravel());image.filepath_raw=str(TEX/'elder-basecolor.png');image.save()
rough=bpy.data.images.new('elder_roughness',width=2048,height=2048,alpha=False);rough.colorspace_settings.name='Non-Color'
r=np.ones_like(pig);r[:,:3]=np.clip(.82+.12*(1-a[:,:3])-.07*pig[:,:3],.72,.96);rough.pixels.foreach_set(r.ravel());rough.filepath_raw=str(TEX/'elder-roughness.png');rough.file_format='PNG';rough.save()
nodes.remove(emit);bs=nodes.new('ShaderNodeBsdfPrincipled');links.new(bs.outputs[0],out.inputs[0]);tex.image=image;links.new(tex.outputs['Color'],bs.inputs['Base Color']);rt=nodes.new('ShaderNodeTexImage');rt.image=rough;links.new(rt.outputs['Color'],bs.inputs['Roughness']);bs.inputs['Specular IOR Level'].default_value=.24
# Explicit triangulation gives deterministic engine geometry.
mod=tree.modifiers.new('Export triangulation','TRIANGULATE');bpy.context.view_layer.objects.active=tree;bpy.ops.object.modifier_apply(modifier=mod.name)
tree.data.color_attributes.remove(tree.data.color_attributes.get('Pigment'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'windswept-elder.glb'),export_format='GLB',use_selection=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
# Presentation scene is never included in GLB.
bpy.ops.mesh.primitive_plane_add(size=200);ground=bpy.context.object;ground.name='Presentation ground — NOT exported'
gm=bpy.data.materials.new('warm slate backdrop');gm.diffuse_color=(.24,.29,.27,1);ground.data.materials.append(gm);ground.location.z=-.025
world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.48,.57,.61,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
for name,pos,energy,size,color in [('large soft key',(-4,-6,10),1250,5,(1,.88,.67)),('cool fill',(5,-1,7),650,5,(.68,.83,1)),('rim',(-1,5,9),1400,4,(1,1,.81))]:
    bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.name=name;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,2.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(9,-14,9));cam=bpy.context.object;cam.name='Fixed game angle';scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=8.1;cam.rotation_euler=(Vector((0,0,2.7))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1400;scene.render.resolution_y=1400;scene.render.resolution_percentage=100;scene.cycles.samples=48
scene.view_settings.view_transform='AgX'
for im in [image,ao,rough]:im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'windswept-elder.blend'))
scene.render.filepath=str(OUT/'render-game-angle.png');bpy.ops.render.render(write_still=True)
cam.location=(7,-12,5.7);cam.rotation_euler=(Vector((-.05,0,2.8))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=6.8
scene.render.filepath=str(OUT/'render-close.png');bpy.ops.render.render(write_still=True)
cam.location=(4,-9,3.5);cam.rotation_euler=(Vector((-.1,0,1.5))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=3.8
scene.render.filepath=str(OUT/'render-branch-detail.png');bpy.ops.render.render(write_still=True)
print('TREE_REFINEMENT_COMPLETE',len(tree.data.polygons),str(OUT))

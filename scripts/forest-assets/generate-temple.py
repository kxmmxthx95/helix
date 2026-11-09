"""Additive Moonfen temple/river kit. Blender Python; no reference pixels read.
Metres, Blender Z-up -> glTF Y-up. Preserve all non-kit GLBs and PNGs.
"""
import bpy, math, random, json, pathlib, ast, hashlib, struct
import numpy as np
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'public/models/moonfen'; TEX=OUT/'textures'
manifest=json.loads((OUT/'manifest.json').read_text())
source=ast.parse((pathlib.Path(__file__).parent/'generate.py').read_text())
exec(compile(ast.Module(body=[n for n in source.body if isinstance(n,ast.FunctionDef) and n.name in ('mesh','tube')],type_ignores=[]),'<shared geometry>','exec'))
mesh=globals()['mesh'];tube=globals()['tube']
IDS=['temple-floor-tile','temple-plaza','temple-stairs','temple-parapet','temple-parapet-corner','temple-cyan-pedestal','temple-broken-wall','temple-rubble','river-root-bridge','river-grass-bank','river-stream']
old=[a for a in manifest['assets'] if a['id'] not in IDS]
assert len(old)==30 and len(set(IDS))==11
protected={str(f.relative_to(OUT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in list(OUT.glob('*.glb'))+list(TEX.glob('*.png')) if f.stem not in IDS and not f.stem.startswith('kit-')}
proof={'baselineIds':[a['id'] for a in old],'baselineGLBs':sum(f.endswith('.glb') for f in protected),'baselinePNGs':sum(f.endswith('.png') for f in protected),'protectedSha256':protected}
assert proof['baselineGLBs']==30 and proof['baselinePNGs']==17
random.seed(719);mats={};N=512
v,u=np.mgrid[0:1:complex(N),0:1:complex(N)];noise=np.random.default_rng(719).random((N,N))
cloud=(np.sin(u*math.tau*3+np.sin(v*math.tau*2))+np.cos(v*math.tau*5+np.sin(u*math.tau*2))+2)/4
palettes={'kit-stone':((.10,.16,.17),(.48,.57,.48)),'kit-moss':((.07,.15,.035),(.48,.64,.12)),'kit-bark':((.075,.10,.055),(.34,.36,.16)),'kit-earth':((.08,.12,.075),(.28,.30,.16)),'kit-water':((.008,.19,.19),(.05,.68,.53)),'kit-cyan':((.015,.35,.38),(.30,.95,.85))}
for name,(dark,light) in palettes.items():
    field=.18+.62*cloud+.14*noise
    if name=='kit-stone':
        cracks=(abs(np.sin(u*math.tau*4+np.sin(v*math.tau*3)*1.3))<.033) | ((abs(np.sin(v*math.tau*3+u*math.tau*2))<.025)&(cloud<.45))
        field-=cracks*.48
    if name=='kit-bark':field=.35+.26*np.sin(u*math.tau*19+np.sin(v*math.tau*3))+.20*cloud+.09*noise
    if name=='kit-water':
        caustic=np.exp(-abs(np.sin(u*math.tau*7+np.sin(v*math.tau*5))*np.sin(v*math.tau*6+np.cos(u*math.tau*3)))*36)
        field=.24+.40*cloud+.34*caustic
    if name=='kit-cyan':field=.45+.20*cloud+.32*np.exp(-abs(np.sin(u*math.tau*5+v*math.tau*2))*18)
    rgb=np.array(dark)+(np.array(light)-dark)*np.clip(field,0,1)[:,:,None]
    if name=='kit-stone':
        mask=np.clip((cloud-.56)*3,0,.72)[:,:,None];rgb=rgb*(1-mask)+np.array((.23,.34,.08))*mask
    rgba=np.ones((N,N,4),dtype=np.float32);rgba[:,:,:3]=rgb
    image=bpy.data.images.new(name,width=N,height=N,alpha=True);image.pixels.foreach_set(rgba.ravel());image.filepath_raw=str(TEX/(name+'.png'));image.file_format='PNG';image.save()
    mat=bpy.data.materials.new(name);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.86
    if name=='kit-water':bs.inputs['Roughness'].default_value=.23;bs.inputs['Metallic'].default_value=.12
    if name=='kit-cyan':mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=1.0;bs.inputs['Roughness'].default_value=.28
    mats[name]=mat

def block(name,c,size,mat='kit-stone',bevel=.035,rot=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=c);ob=bpy.context.object;ob.name=name;ob.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(mats[mat]);ob.rotation_euler.z=rot
    if bevel:
        mod=ob.modifiers.new('worn cut edges','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
    # Per-face metric box projection, with a deterministic offset to avoid identical blocks.
    layer=ob.data.uv_layers.active or ob.data.uv_layers.new(name='UVMap');phase=random.random()
    for p in ob.data.polygons:
        axis=max(range(3),key=lambda k:abs(p.normal[k]));axes=[k for k in range(3) if k!=axis]
        for li in p.loop_indices:
            co=ob.data.vertices[ob.data.loops[li].vertex_index].co;layer.data[li].uv=(co[axes[0]]*.65+phase,co[axes[1]]*.65+phase)
    return ob

def moss(x,y,z,s=.3):
    sides=9;vs=[(x,y,z+.015)];uv=[(.5,.5)]
    for j in range(sides):
        a=j*math.tau/sides;r=s*(.75+random.random()*.25);vs.append((x+r*math.cos(a),y+r*.65*math.sin(a),z+.007));uv.append((.5+.5*math.cos(a),.5+.5*math.sin(a)))
    mesh('lichen island',vs,[(0,j+1,(j+1)%sides+1) for j in range(sides)],uv,'kit-moss',False)

def paving(width=2,depth=2,z=.4):
    for i in range(int(width)):
        for j in range(int(depth)):
            x=-width/2+i+.5;y=-depth/2+j+.5
            block('fractured paving slab',(x,y,z-.08),(.985,.985,.16),bevel=.018)
            if (i+j)%2==0:moss(x+.14,y-.12,z,.34)

def floor():
    block('continuous square tile substrate',(0,0,.12),(2,2,.24),bevel=0);paving()

def plaza():
    block('plaza foundation',(0,0,.16),(4,4,.32),bevel=.02)
    for side in [-1,1]:
        for i in range(4):
            for k in range(2):block('ashlar retaining course',(-1.5+i,side*1.77,.46+k*.24),(.985,.46,.235),bevel=.025)
        for i in range(3):
            for k in range(2):block('side retaining course',(side*1.77,-1+i,.46+k*.24),(.46,.985,.235),bevel=.025)
    block('plaza core',(0,0,.65),(3.3,3.3,.70),bevel=0);paving(4,4,1)

def stairs():
    # Ascends toward Blender +Y = glTF -Z. Five 0.2m rises / 0.4m runs.
    for i in range(5):
        h=(i+1)*.2;y=-1+(i+.5)*.4
        block('stair riser',(0,y,h/2),(2,.4,h),bevel=.015)
        if i%2==0:moss(.53,y,h,.22)

def parapet():
    block('parapet foot',(0,0,.09),(2,.48,.18),bevel=.025)
    for k in range(2):
        for j in range(3):block('parapet ashlar',(-2/3+j*2/3,0,.31+k*.22),(.65,.34,.22),bevel=.025)
    block('parapet cap',(0,0,.735),(2,.5,.13),bevel=.025);moss(-.35,0,.8,.35)

def corner():
    # L inside a 2x2 cell, centred on cell, arm ends on +/-X/+Z grid edges.
    for c,s in [((0,.75,.09),(2,.5,.18)),((-.75,-.25,.09),(.5,1.5,.18))]:block('corner foot',c,s,bevel=.02)
    for k in range(2):
        for x in [-.75,-.25,.25,.75]:block('corner long ashlar',(x,.75,.31+k*.22),(.49,.34,.22),bevel=.02)
        for y in [-.75,-.25,.25]:block('corner return ashlar',(-.75,y,.31+k*.22),(.34,.49,.22),bevel=.02)
    block('L cap east west',(0,.75,.735),(2,.5,.13),bevel=.02);block('L cap return',(-.75,-.25,.735),(.5,1.5,.13),bevel=.02);moss(-.7,.6,.8,.3)

def pedestal():
    for z,s,h in [(.10,1.1,.2),(.25,.92,.1),(.61,.66,.62),(.96,.88,.12),(1.07,1.02,.1)]:block('altar stepped stone',(0,0,z),(s,s,h),bevel=.045)
    for x,y in [(-.337,0),(.337,0),(0,-.337),(0,.337)]:block('cyan inset rune',(x,y,.64),(.025 if x else .10,.10 if x else .025,.38),'kit-cyan',.008)
    block('luminous altar lens',(0,0,1.15),(.62,.62,.10),'kit-cyan',.04)
    for j in range(4):
        a=j*math.tau/4;block('stone lens claw',(.37*math.cos(a),.37*math.sin(a),1.18),(.16,.16,.20),bevel=.03)
    moss(.28,.25,.20,.22)

def wall():
    block('ruin wall footing',(0,0,.10),(2,.65,.2),bevel=.04)
    for row,n in enumerate([4,4,3,2,1]):
        for j in range(n):
            x=-.75+j*.5+(row%2)*.08;h=.29+random.random()*.035
            block('broken wall course',(x,0,.2+row*.32+h/2),(.48,.42,h),bevel=.055,rot=random.uniform(-.025,.025))
    for x,z in [(-.72,1.82),(-.2,1.5),(.35,1.18)]:moss(x,0,z,.24)

def rubble():
    for i in range(13):
        a=i*2.399;r=.18+.65*math.sqrt(i/13);h=random.uniform(.12,.30)
        block('fallen masonry',(math.cos(a)*r,math.sin(a)*r*.68,h/2),(.22+random.random()*.22,.18+random.random()*.23,h),bevel=.04,rot=a)
        if i%3==0:moss(math.cos(a)*r,math.sin(a)*r*.68,h,.15)

def bridge():
    # Five curved logs; end walk surface .4m, clear span 4m, width 2m.
    for k in range(5):
        pts=[];rs=[]
        for i in range(33):
            t=i/32;x=-2+4*t;z=.20+.40*math.sin(math.pi*t)**1.3
            pts.append((x,(k-2)*.39+.025*math.sin(math.pi*t*2+k)*math.sin(math.pi*t),z));rs.append(.184)
        tube('arched bridge log',pts,rs,'kit-bark',14)
        # Broad flattened moss ribbons following bridge curvature.
        vs=[];uv=[]
        for i,(x,y,z) in enumerate(pts):
            for d in [-1,1]:vs.append((x,y+d*.12,z+.19));uv.append(((d+1)/2,i/8))
        mesh('moss carpet on log',vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(32)],uv,'kit-moss',False)
    for side in [-1,1]:
        pts=[(-2+4*i/24,side*.96,.18+.54*math.sin(math.pi*i/24)) for i in range(25)]
        tube('braided edge root',pts,[.09]*25,'kit-bark',10)
    # Actual flat landing surfaces meet grass banks at precisely .4m.
    for x in [-1.9,1.9]:
        block('buried landing sleeper',(x,0,.1),(.2,1.9,.2),'kit-bark',.015)
        block('moss landing cross tie',(x,0,.375),(.2,2,.05),'kit-moss',0)

def bank():
    block('riverbank soil',(0,0,.17),(2,4,.34),'kit-earth',0)
    # Flat modular landings, sculpted top colour patches, individual grass at rim.
    block('grass bank turf',(0,0,.37),(2,4,.06),'kit-moss',0)
    vs=[];uv=[];fs=[]
    for i in range(190):
        x=random.uniform(-.97,.97);y=random.uniform(-1.95,1.95)
        if abs(y)<.94:continue # bridge access lane remains walkable at .4m
        a=random.random()*math.tau;h=random.uniform(.06,.18);w=.028;n=len(vs)
        vs.extend([(x-w*math.cos(a),y-w*math.sin(a),.4),(x+w*math.cos(a),y+w*math.sin(a),.4),(x+.06*math.cos(a),y+.06*math.sin(a),.4+h)]);uv.extend([(0,0),(1,0),(.5,1)]);fs.append((n,n+1,n+2))
    mesh('bank grass tufts',vs,fs,uv,'kit-moss',False)
    for j in range(7):moss(random.uniform(-.8,.8),random.uniform(-1.8,1.8),.401,.28)

def stream():
    block('stream gravel bed',(0,0,.04),(4,4,.08),'kit-earth',0)
    # Flat endpoints and tiling raster, solid opaque turquoise to avoid sorting seams.
    mesh('turquoise water', [(-2,-2,.12),(2,-2,.12),(2,2,.12),(-2,2,.12)],[(0,1,2,3)],[(0,0),(1,0),(1,1),(0,1)],'kit-water',False)

fns=[floor,plaza,stairs,parapet,corner,pedestal,wall,rubble,bridge,bank,stream]
titles=['Mossy cracked floor · 2m','Raised plaza · 4m / 1m rise','Stone staircase · five rises','Low parapet · straight 2m','Low parapet · L corner','Cyan rune pedestal','Broken stepped wall','Rubble scatter','Moss log & root bridge · 4m span','Grass riverbank · 2 × 4m','Turquoise stream · 4 × 4m']
added=[]
for id,title,fn in zip(IDS,titles,fns):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);fn()
    for mat in mats.values():
        bpy.ops.object.select_all(action='DESELECT');obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==mat]
        if obs:
            for ob in obs:ob.select_set(True)
            bpy.context.view_layer.objects.active=obs[0]
            if len(obs)>1:bpy.ops.object.join()
            obs[0].name=id+'_'+mat.name
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for ob in bpy.context.scene.objects:
        bpy.context.view_layer.objects.active=ob;mod=ob.modifiers.new('triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.update()
    bounds=[ob.matrix_world@Vector(c) for ob in bpy.context.scene.objects for c in ob.bound_box]
    # Bridge swept caps can dip below zero; translate all geometry to ground only if needed.
    assert min(c.z for c in bounds)>=-0.00001,(id,min(c.z for c in bounds))
    path=OUT/(id+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
    data=path.read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
    added.append(dict(id=id,title=title,file=path.name,bytes=len(data),meshes=len(g['meshes']),triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),collection='temple' if id.startswith('temple') else 'river-transition',pivot='ground grid origin',boundsBlender={'min':[min(c[k] for c in bounds) for k in range(3)],'max':[max(c[k] for c in bounds) for k in range(3)]}))
assert all(hashlib.sha256((OUT/f).read_bytes()).hexdigest()==h for f,h in protected.items())
manifest.update(version=4,assets=old+added,templeAssetIds=IDS)
manifest['totals']={'assets':len(manifest['assets']),'bytes':sum(a['bytes'] for a in manifest['assets']),'triangles':sum(a['triangles'] for a in manifest['assets'])}
assert manifest['totals']['assets']==41
(OUT/'temple-preservation.json').write_text(json.dumps(proof,indent=2)+'\n')
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('TEMPLE_COMPLETE',json.dumps(manifest['totals']))

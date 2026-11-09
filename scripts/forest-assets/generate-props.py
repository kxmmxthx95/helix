"""Add eight original rock, whimsical animal bone and crystal props; run in Blender.
No input image reads. Reuses geometry definitions only, never old export side effects.
"""
import bpy, math, random, json, pathlib, ast, hashlib, struct
import numpy as np
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'public/models/moonfen'; TEX=OUT/'textures'
manifest=json.loads((OUT/'manifest.json').read_text())
ids=['moss-standing-rock','moss-boulder-group','moss-low-patch','animal-skeleton-large','animal-ribs-medium','animal-skull-small','teal-grove-large','teal-cluster-small']
old=[a for a in manifest['assets'] if a['id'] not in ids]
assert len(old)==22 and len(set(ids))==8
protected={str(p.relative_to(OUT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in list(OUT.glob('*.glb'))+list(TEX.glob('*.png')) if p.stem not in ids and not p.name.startswith('props-')}
assert len([p for p in protected if p.endswith('.glb')])==22
source=ast.parse((pathlib.Path(__file__).parent/'generate.py').read_text())
exec(compile(ast.Module(body=[n for n in source.body if isinstance(n,ast.FunctionDef) and n.name in ('mesh','tube')],type_ignores=[]),'<shared geometry>','exec'))
mats={}; N=256; v,u=np.mgrid[0:1:complex(N),0:1:complex(N)]; rng=np.random.default_rng(1118)
for name,dark,light in [('grass',(.035,.12,.025),(.36,.53,.09)),('rock',(.12,.19,.18),(.42,.50,.42)),('moss',(.07,.18,.025),(.43,.57,.11)),('bone',(.38,.32,.19),(.87,.83,.66)),('teal',(.008,.19,.19),(.10,.78,.63))]:
    noise=rng.random((N,N)); field=.35+.18*np.sin(u*23+np.sin(v*17))+.17*np.cos(v*28-u*7)+.16*noise
    if name=='bone':field=.60+.09*np.sin(u*93+v*7)+.13*noise-.25*(noise>.97)
    if name=='teal':field=.25+.45*u+.13*np.sin(u*67+v*8)**10+.08*noise
    if name=='rock':field-=.22*(abs(np.sin(u*34+np.sin(v*18)))<.07)
    rgba=np.ones((N,N,4),dtype=np.float32);rgba[:,:,:3]=np.array(dark)+(np.array(light)-dark)*np.clip(field,0,1)[:,:,None]
    image=bpy.data.images.new('props-'+name,width=N,height=N,alpha=True);image.pixels.foreach_set(rgba.ravel());image.filepath_raw=str(TEX/('props-'+name+'.png'));image.file_format='PNG';image.save()
    mat=bpy.data.materials.new('props-'+name);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.29 if name=='teal' else .88
    if name=='teal':bs.inputs['Metallic'].default_value=.12
    mats[name]=mat

def uv(ob):
    bpy.context.view_layer.objects.active=ob;bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project();bpy.ops.object.mode_set(mode='OBJECT')

def ellipsoid(name,pos,scale,mat,sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=pos);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if mat:o.data.materials.append(mats[mat]);uv(o)
    return o

def base(rx,ry,seed):
    random.seed(seed); vs=[(0,0,.055)];uvs=[(.5,.5)];fs=[];n=40
    for i in range(n):
        a=i*math.tau/n;r=1+.07*math.sin(a*7+seed);vs.append((rx*r*math.cos(a),ry*r*math.sin(a),.012));uvs.append((.5+.48*math.cos(a),.5+.48*math.sin(a)))
    for i in range(n):fs.append((0,1+i,1+(i+1)%n))
    mesh('irregular mossy grass ground',vs,fs,uvs,'moss')
    # Batch all solid triangular grass blades into one mesh: 240-360 triangles.
    vs=[];uvs=[];fs=[]
    for i in range(90):
        a=random.random()*math.tau;r=math.sqrt(random.random());x=rx*r*math.cos(a);y=ry*r*math.sin(a)
        for j in range(2):
            q=a+j*1.8;w=random.uniform(.018,.034);h=random.uniform(.09,.22);k=len(vs)
            vs.extend([(x-w*math.cos(q),y-w*math.sin(q),.035),(x+w*math.cos(q),y+w*math.sin(q),.035),(x+.055*math.cos(q+.4),y+.055*math.sin(q+.4),h),(x,y,.045)])
            uvs.extend([(0,0),(1,0),(.5,1),(.5,.1)]);fs.extend([(k,k+1,k+2),(k+2,k+1,k+3),(k,k+2,k+3)])
    mesh('batched solid grass blades',vs,fs,uvs,'grass',False)

def boulder(pos,scale,seed):
    ob=ellipsoid('angular weathered boulder',pos,scale,'rock',2)
    for p in ob.data.vertices:
        p.co*=1+.12*math.sin(p.co.x*8+p.co.y*11+seed)
    # Moss follows selected actual upper rock triangles, never a floating dome.
    vs=[];fs=[];uvs=[]
    for face in ob.data.polygons:
        if face.normal.z>.25 and math.sin(face.center.x*7+face.center.y*9+seed)>-.45:
            k=len(vs)
            for vi in face.vertices:
                p=ob.data.vertices[vi].co+face.normal*.009+Vector(pos);vs.append(p);uvs.append((p.x*.8,p.y*.8))
            fs.append(tuple(range(k,len(vs))))
    mesh('surface moss patches',vs,fs,uvs,'moss',False)

def rocks(kind):
    if kind==0:
        base(.95,.68,11);boulder((-.13,.10,.99),(.52,.43,1.18),3);boulder((.43,-.04,.31),(.40,.33,.40),8);boulder((-.53,-.24,.18),(.30,.26,.23),4)
    elif kind==1:
        base(1.15,.77,12)
        for p,s,k in [((-.48,.15,.52),(.56,.46,.65),4),((.28,.17,.35),(.52,.46,.48),7),((.59,-.33,.20),(.37,.31,.28),2),((-.33,-.40,.18),(.43,.26,.22),1)]:boulder(p,s,k)
    else:
        base(.76,.53,13)
        for p,s,k in [((-.23,.08,.18),(.40,.30,.24),5),((.27,.01,.12),(.33,.29,.18),8),((-.02,-.26,.09),(.26,.19,.12),4)]:boulder(p,s,k)

def bone(a,b,r=.045):
    a=Vector(a);b=Vector(b);tube('weathered limb shaft',[a,a.lerp(b,.28),a.lerp(b,.72),b],[r*1.22,r*.72,r*.70,r*1.2],'bone',8)
    for p in (a,b):ellipsoid('rounded bone joint',p,(r*1.45,r*1.15,r*1.2),'bone',1)

def skull(c,s=1,horns=True):
    c=Vector(c)
    head=ellipsoid('animal cranium with open eye sockets',c+Vector((0,.04,.24))*s,(.29*s,.36*s,.25*s),'bone',3)
    # Real carved openings, no painted black circles; sockets face the showcase.
    for dx in [-.19,.19]:
        cutter=ellipsoid('temporary socket cutter',c+Vector((dx,-.16,.30))*s,(.125*s,.21*s,.135*s),None,2)
        bpy.context.view_layer.objects.active=head;mod=head.modifiers.new('carved orbital hollow','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
    uv(head)
    # Split elongated muzzle and nasal gap distinguish this from a human skull.
    for side in [-1,1]:
        tube('elongated animal muzzle',[c+Vector((side*.14,-.13,.18))*s,c+Vector((side*.10,-.43,.12))*s,c+Vector((side*.055,-.59,.10))*s],[.115*s,.085*s,.04*s],'bone',10)
        tube('cheek arch',[c+Vector((side*.24,.04,.17))*s,c+Vector((side*.31,-.20,.09))*s,c+Vector((side*.11,-.43,.08))*s],[.045*s,.032*s,.04*s],'bone',8)
        if horns:tube('short swept fantasy horn',[c+Vector((side*.22,.20,.35))*s,c+Vector((side*.34,.28,.49))*s,c+Vector((side*.41,.38,.54))*s],[.075*s,.045*s,.006*s],'bone',8)

def remains(kind):
    if kind==2:
        base(.66,.58,23);skull((0,.10,.045),1.08,False);return
    large=kind==0;base(1.12 if large else .86,.86 if large else .62,21+kind)
    n=7 if large else 4
    for i in range(n):
        y=.52-i*.15;z=.40+.13*math.sin(i/(n-1)*math.pi)
        ellipsoid('separate spine vertebra',(-.16,y,z),(.10,.085,.085),'bone',1)
        if i<n-1:
            for side in [-1,1]:
                pts=[]
                for j in range(10):
                    t=j/9;pts.append((-.16+side*(.08+.40*math.sin(t*math.pi*.72)),y-.035*math.sin(t*math.pi),z*(1-t*.82)))
                tube('curving open animal rib',pts,[.034*(1-j/18) for j in range(10)],'bone',8)
    if large:
        skull((.22,-.51,.045),1.12,True)
        bone((-.56,.42,.10),(-.82,.04,.09),.055);bone((-.82,.04,.09),(-.64,-.36,.08),.044)
        bone((.28,.48,.11),(.73,.25,.09),.055);bone((.73,.25,.09),(.80,-.13,.08),.044)
        tube('curved tail vertebral line',[(-.16,.58,.36),(-.30,.78,.24),(-.54,.83,.12)],[.06,.04,.009],'bone',8)
    else:
        bone((.18,-.32,.09),(.61,-.14,.08),.05);bone((-.46,-.27,.08),(-.64,-.02,.07),.04)

def crystal(x,y,h,r,lean):
    vs=[];uvs=[];fs=[];n=6
    for k,(z,rr) in enumerate([(0,r*.76),(h*.72,r),(h,.0)]):
        for j in range(n+1):
            a=j*math.tau/n;vs.append((x+rr*math.cos(a)+lean*z,y+rr*math.sin(a),.06+z));uvs.append((j/n,k/2))
    for k in range(2):
        for j in range(n):a=k*(n+1)+j;fs.append((a,a+1,a+n+2,a+n+1))
    fs.append(tuple(range(n,-1,-1)));mesh('six-sided teal terminated crystal',vs,fs,uvs,'teal',False)

def grove(small):
    base(.65 if small else 1.13,.48 if small else .76,32 if small else 31)
    layout=[(-.13,.1,.71,.17,-.08),(.19,-.03,.40,.13,.24),(-.31,-.15,.24,.11,-.45),(.04,-.23,.20,.09,.1)] if small else [(-.16,.17,1.52,.23,.09),(.39,.17,.91,.22,.35),(-.59,.03,.69,.21,-.35),(.04,-.36,.76,.20,-.13),(.66,-.26,.42,.16,.49),(-.42,-.43,.35,.13,-.48),(-.45,.44,.52,.17,.15),(.39,.46,.46,.14,.18)]
    for x,y,h,r,lean in layout:crystal(x,y,h,r,lean)
    for x,y in [(-.42,.12),(.35,-.19)]:boulder((x,y,.07),(.20,.18,.10),4)

fns=[lambda:rocks(0),lambda:rocks(1),lambda:rocks(2),lambda:remains(0),lambda:remains(1),lambda:remains(2),lambda:grove(False),lambda:grove(True)]
titles=['Mossy standing rock • tall','Mossy boulder group • medium','Low mossy rock patch • small','Whimsical animal skeleton • large','Scattered animal ribs • medium','Weathered animal skull • small','Teal crystal grove • large','Teal crystal sprout cluster • small']
added=[]
for id,title,fn in zip(ids,titles,fns):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);fn()
    for mat in mats.values():
        bpy.ops.object.select_all(action='DESELECT');obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
        if obs:
            for ob in obs:ob.select_set(True)
            bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();obs[0].name=id+'_'+mat.name
    for ob in bpy.context.scene.objects:
        mod=ob.modifiers.new('triangulate','TRIANGULATE');bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
    bounds=[ob.matrix_world@Vector(c) for ob in bpy.context.scene.objects for c in ob.bound_box];off=Vector(((min(c.x for c in bounds)+max(c.x for c in bounds))/2,(min(c.y for c in bounds)+max(c.y for c in bounds))/2,min(c.z for c in bounds)))
    for ob in bpy.context.scene.objects:ob.location-=off
    bpy.context.view_layer.update();path=OUT/(id+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
    data=path.read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
    added.append(dict(id=id,title=title,file=path.name,bytes=len(data),meshes=len(g['meshes']),triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),collection='rocks-bones-crystals',variant='distinct authored layout and topology; not a scaled alias'))
assert all(hashlib.sha256((OUT/f).read_bytes()).hexdigest()==h for f,h in protected.items())
manifest.update(version=3,assets=old+added,propAssetIds=ids)
assert len(manifest['assets'])==30 and len({a['id'] for a in manifest['assets']})==30
manifest['totals']=dict(assets=30,bytes=sum(a['bytes'] for a in manifest['assets']),triangles=sum(a['triangles'] for a in manifest['assets']))
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'props-preservation.json').write_text(json.dumps(dict(protectedSha256=protected,verifiedUnchanged=True,baselineGLBs=22,baselinePNGs=sum(f.endswith('.png') for f in protected),additionalIds=ids),indent=2)+'\n')
print('PROPS_ADDITION_COMPLETE',json.dumps(manifest['totals']))

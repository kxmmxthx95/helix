"""Add eleven original ground plants without regenerating the baseline pack.
Run in Blender. No reference pixels or downloaded geometry are used.
"""
import bpy, math, random, json, pathlib, ast, hashlib, struct
import numpy as np
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'public/models/moonfen'; TEX=OUT/'textures'
manifest=json.loads((OUT/'manifest.json').read_text())
# Import only reusable geometry definitions; never execute baseline generation.
source=ast.parse((pathlib.Path(__file__).parent/'generate.py').read_text())
exec(compile(ast.Module(body=[n for n in source.body if isinstance(n,ast.FunctionDef) and n.name in ('mesh','tube','leaf')],type_ignores=[]),'<shared geometry>','exec'))
mesh=globals()['mesh']; tube=globals()['tube']
random.seed(8027); mats={}
N=512; v,u=np.mgrid[0:1:complex(N),0:1:complex(N)]
noise=np.random.default_rng(8027).random((N,N))
palettes={'ground-jade':((.012,.075,.065),(.13,.40,.24)), 'ground-blue':((.018,.035,.11),(.12,.31,.47)), 'ground-pink':((.28,.025,.15),(.88,.32,.61)), 'ground-gold':((.23,.13,.025),(.77,.59,.19)), 'ground-root':((.045,.09,.025),(.31,.40,.09))}
for name,(dark,light) in palettes.items():
    mid=np.exp(-((u-.5)/.018)**2)
    veins=np.exp(-(np.sin((v-abs(u-.5)*.72)*math.pi*11)/.13)**2)
    field=.25+.35*np.sin(math.pi*u)+.12*np.sin(v*19+u*7)+.09*noise+.18*mid+.12*veins
    if name=='ground-root': field=.35+.20*np.sin(u*45+np.sin(v*13))+.15*np.sin(v*28+u*18)+.18*noise
    rgba=np.ones((N,N,4),dtype=np.float32); rgba[:,:,:3]=np.array(dark)+(np.array(light)-dark)*np.clip(field,0,1)[:,:,None]
    image=bpy.data.images.new(name,width=N,height=N,alpha=True);image.pixels.foreach_set(rgba.ravel());image.filepath_raw=str(TEX/(name+'.png'));image.file_format='PNG';image.save()
    mat=bpy.data.materials.new(name);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.73;mats[name]=mat

def blade(c,a,L,W,rise=.2,mat='ground-jade',heart=False):
    # Thick curved lamina with explicit central fold, broad basal lobes for hearts.
    vs=[];uv=[];fs=[]; rows=20; cols=8
    for i in range(rows+1):
        t=i/rows
        width=W*(math.sin(math.pi*t)**.65 if not heart else (math.sin(math.pi*t)**.48)*(1.25-.8*t))
        for j in range(cols+1):
            s=j/cols*2-1
            x=L*t-(.15*L*math.sin(math.pi*abs(s))*(1-t)**3 if heart else 0)
            y=s*width;z=rise*math.sin(t*math.pi*.82)+.07*L*(1-abs(s))*math.sin(math.pi*t)-.10*L*s*s*math.sin(math.pi*t)
            vs.append((c[0]+x*math.cos(a)-y*math.sin(a),c[1]+x*math.sin(a)+y*math.cos(a),c[2]+z));uv.append((j/cols,t))
            if i and j:k=i*(cols+1)+j;fs.append((k-cols-2,k-cols-1,k,k-1))
    if heart:
        # True cordate outline: two basal lobes, a sinus and an acuminate tip.
        vs=[];uv=[];fs=[];sides=64;rings=10
        for i in range(rings+1):
            r=i/rings
            for j in range(sides+1):
                q=j/sides*math.tau
                lateral=16*math.sin(q)**3/16*W
                along=(5-(13*math.cos(q)-5*math.cos(2*q)-2*math.cos(3*q)-math.cos(4*q)))/22*L
                x=L*.35+(along-L*.35)*r;y=lateral*r
                z=rise*(x/L)+.065*L*(1-r*r)-.06*abs(y)/W
                vs.append((c[0]+x*math.cos(a)-y*math.sin(a),c[1]+x*math.sin(a)+y*math.cos(a),c[2]+z));uv.append((.5+y/(W*2),.2+.7*x/L))
                if i and j:k=i*(sides+1)+j;fs.append((k-sides-2,k-sides-1,k,k-1))
    ob=mesh('heart lamina' if heart else 'folded lance leaf',vs,fs,uv,mat)
    mod=ob.modifiers.new('physical leaf thickness','SOLIDIFY');mod.thickness=.009;bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)

def rosette(n,L,W,z=.04,rise=.2,phase=0):
    for i in range(n):
        a=i*math.tau/n+phase;blade((.025*math.cos(a),.025*math.sin(a),z),a,L*(.87+.13*math.sin(i*2.1)**2),W,rise)

def bud(c,h,r,mat='ground-pink'):
    # Six overlapping closed petal lobes, tapered blossom rather than open flower.
    for j in range(6):
        a=j*math.tau/6;ps=[];rs=[]
        for i in range(17):
            t=i/16;rad=r*.5*math.sin(math.pi*t);ps.append((c[0]+rad*math.cos(a),c[1]+rad*math.sin(a),c[2]+h*t));rs.append(.004+r*.52*math.sin(math.pi*t)**.8)
        tube('closed petal',ps,rs,mat,10)

def pink():
    rosette(12,.75,.13,rise=.24);rosette(7,.48,.10,.15,.43,.3)
    tube('bud stem',[(0,0,.06),(0,0,.58)],[.095,.055],'ground-root')
    bud((0,0,.45),.60,.17)
    for j in range(7):blade((0,0,.40),j*math.tau/7,.23,.05,.18,'ground-gold')

def closed():
    rosette(7,.39,.09,rise=.19);rosette(4,.24,.06,.10,.29,.7)
    bud((0,0,.23),.32,.12,'ground-gold')
    for j in range(5):blade((0,0,.19),j*math.tau/5,.19,.045,.27)

def curl(c,h,a):
    pts=[(0,0,.0),(.02,0,h*.25),(-.07,0,h*.55),(-.10,0,h*.80)]
    for i in range(18):
        q=math.pi-i/17*math.pi*1.65;r=h*.19*(1-i/24);pts.append((h*.09+r*math.cos(q),0,h*.80+r*math.sin(q)))
    pts=[(c[0]+x*math.cos(a),c[1]+x*math.sin(a),c[2]+z) for x,y,z in pts]
    tube('unfurling golden crozier',pts,[.055*(1-i/(len(pts)*1.2)) for i in range(len(pts))],'ground-gold',12)

def broad(small=False):
    if small:
        rosette(5,.53,.20,rise=.15,phase=.4);rosette(3,.34,.14,.10,.22,.8);curl((-.06,0,.12),.55,.8)
    else:
        rosette(8,.78,.25,rise=.24);rosette(5,.52,.20,.12,.31,.4);curl((-.14,.02,.15),1.02,.3);curl((.21,.05,.13),.63,2.7)

def spike():
    rosette(13,.59,.075,rise=.12);rosette(8,.40,.065,.055,.34,.2);rosette(4,.25,.05,.08,.43,.6)

def shrub(low=False):
    # Individual leaves and forked stems, not the old closed crown meshes.
    clusters=4 if low else 8
    for k in range(clusters):
        a=k*2.399;r=.20 if low else .33;c=(r*math.cos(a),r*math.sin(a),.07)
        h=.22+(k%3)*.055 if low else .36+(k%3)*.10
        tube('shrub fork',[(c[0],c[1],0),(c[0]*.8,c[1]*.8,h)],[.035,.008],'ground-root',8)
        for j in range(9 if low else 12):
            t=j/(9 if low else 12);blade((c[0]*.85,c[1]*.85,.05+h*t),a+j*2.4,.25+.12*(1-t),.07 if low else .095,.10)

def root(multi=False):
    for k in range(3 if multi else 1):
        ps=[];rs=[];span=[1.65,1.35,1.48][k] if multi else 1.65;height=[.85,.67,.96][k] if multi else .55
        for i in range(33):
            t=i/32;ps.append((span*(t-.5)+(k-.8)*.12,(k-1)*.40 if multi else .06*math.sin(t*math.pi),.06+height*math.sin(math.pi*t)**.8));rs.append(.12+.075*math.sin(math.pi*t))
        tube('arched moss root',ps,rs,'ground-root',16)
        for side in [-1,1]:
            ribbon=[(x,y+side*.08,z+r*.72) for (x,y,z),r in zip(ps,rs)];tube('raised moss ridge',ribbon,[.029]*len(ps),'ground-jade',8)
        for i in range(3,31,4):
            x,y,z=ps[i];r=rs[i];d=-1 if i<16 else 1
            tube('curved solid thorn',[(x,y,z+r*.7),(x+d*.055,y-.015,z+r+.12),(x+d*.15,y-.025,z+r+.22)],[.070,.039,.002],'ground-gold',9)
    if not multi:
        tube('hooked root tip',[(-.78,0,.12),(-1.00,0,.14),(-1.06,0,.32),(-1.02,0,.48)],[.12,.075,.035,.002],'ground-root',12)

def hearts(small=False):
    layout=[(-.10,0,.62,2.7,.48),(.11,.03,.85,.25,.52),(.02,.12,1.02,1.6,.42),(-.04,-.08,.39,4.5,.38),(.12,.04,.58,5.8,.43)] if not small else [(-.07,0,.48,2.8,.34),(.08,.03,.69,.3,.36),(.02,-.03,.30,4.8,.28)]
    for x,y,h,a,L in layout:
        tip=(x+math.cos(a)*.11,y+math.sin(a)*.11,h)
        tube('blue curved petiole',[(x*.3,y*.3,0),(x,y,h*.55),tip],[.035,.025,.013],'ground-blue',10)
        blade(tip,a,L,L*.48,-.15,'ground-blue',True)

assets=[('pink-bud-rosette','Pink bud rosette',pink),('unopened-bud','Unopened golden bud',closed),('golden-crozier-large','Twin golden crozier • broad leaves',lambda:broad(False)),('golden-crozier-small','Single golden crozier • compact',lambda:broad(True)),('spiky-rosette','Low spiky rosette',spike),('dense-jade-shrub','Dense jade shrub',lambda:shrub(False)),('low-jade-shrub','Low spreading jade shrub',lambda:shrub(True)),('thorn-root-arches','Triple thorned moss roots',lambda:root(True)),('thorn-root-hook','Single hooked thorn root',lambda:root(False)),('blue-heart-large','Blue heart leaves • five stems',lambda:hearts(False)),('blue-heart-small','Blue heart leaves • three stems',lambda:hearts(True))]
ids={a[0] for a in assets}; assert len(ids)==11
old=[a for a in manifest['assets'] if a['id'] not in ids]
assert len(old)==11, 'Expected eleven baseline assets; refusing ambiguous manifest edit'
protected={a['file']:hashlib.sha256((OUT/a['file']).read_bytes()).hexdigest() for a in old}
added=[]
for id,title,fn in assets:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);fn()
    for mat in mats.values():
        bpy.ops.object.select_all(action='DESELECT');obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==mat]
        if obs:
            for ob in obs:ob.select_set(True)
            bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();obs[0].name=id+'_'+mat.name
    for ob in bpy.context.scene.objects:
        mod=ob.modifiers.new('triangles','TRIANGULATE');bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
    bounds=[ob.matrix_world@Vector(c) for ob in bpy.context.scene.objects for c in ob.bound_box]
    off=Vector(((min(c.x for c in bounds)+max(c.x for c in bounds))/2,(min(c.y for c in bounds)+max(c.y for c in bounds))/2,min(c.z for c in bounds)))
    for ob in bpy.context.scene.objects:ob.location-=off
    bpy.context.view_layer.update();path=OUT/(id+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
    data=path.read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
    added.append(dict(id=id,title=title,file=path.name,bytes=len(data),meshes=len(g['meshes']),triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),collection='ground-vegetation',variant='distinct topology; not a uniform scale copy'))
assert all(hashlib.sha256((OUT/f).read_bytes()).hexdigest()==h for f,h in protected.items())
manifest.update(version=2,assets=old+added,baselineAssetIds=[a['id'] for a in old],additionalAssetIds=[a['id'] for a in added])
manifest['totals']={ 'assets':len(manifest['assets']), 'bytes':sum(a['bytes'] for a in manifest['assets']), 'triangles':sum(a['triangles'] for a in manifest['assets'])}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('GROUND_ADDITION_COMPLETE',json.dumps(manifest['totals']))

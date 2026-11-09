"""Original Moonfen sample assets. Run with Blender --background --python this.py."""
import bpy, math, random, json, pathlib
import numpy as np
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'public/models/moonfen'; OUT.mkdir(parents=True,exist_ok=True)
TEX=OUT/'textures'; TEX.mkdir(exist_ok=True)
random.seed(2701)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
# Original painted-like raster fields; no input/reference pixels are read.
N=512
v,u=np.mgrid[0:1:complex(N),0:1:complex(N)]
rng=np.random.default_rng(41)
noise=rng.random((N,N))
mats={}
palettes={'bark':((.105,.115,.075),(.43,.37,.17)), 'leaf':((.025,.16,.12),(.43,.66,.20)), 'pine':((.02,.13,.13),(.20,.48,.35)), 'stone':((.12,.19,.20),(.43,.52,.40)), 'moss':((.07,.20,.08),(.56,.68,.20)), 'crystal':((.015,.22,.23),(.12,.88,.71)), 'petal':((.16,.10,.30),(.66,.36,.68))}
for name,(dark,light) in palettes.items():
    cloud=(np.sin(u*24+np.sin(v*19)*2)+np.cos(v*31-u*11)+2)/4
    if name=='bark':
        field=.27+.40*cloud+.18*np.sin(u*140+np.sin(v*14)*2)+.08*noise
        field-=.22*(np.sin(u*240+np.sin(v*22)*3)>.88)
    elif name in ('leaf','pine','petal'):
        # overlapping small almond brush marks and fine branching veins
        a=(u*23+np.floor(v*29)*.47)%1; b=(v*29)%1
        stroke=np.clip(1-((a-.5)/.42)**2-((b-.5)/.48)**2,0,1)
        field=.16+.32*cloud+.40*stroke+.10*noise
        field+=.13*((abs(a-.5)<.028)&(b>.2)&(b<.8))
    elif name=='stone':
        field=.18+.55*cloud+.13*noise
        field-=.26*(abs(np.sin(u*37+np.sin(v*13)*2))<.065)
    elif name=='crystal': field=.25+.45*u+.18*np.sin(u*62+v*8)**12+.06*noise
    else: field=.18+.55*cloud+.23*noise
    field=np.clip(field,0,1)
    rgba=np.ones((N,N,4),dtype=np.float32)
    rgba[:,:,:3]=np.array(dark)+(np.array(light)-np.array(dark))*field[:,:,None]
    image=bpy.data.images.new('Moonfen_'+name,width=N,height=N,alpha=True)
    image.pixels.foreach_set(rgba.ravel()); image.filepath_raw=str(TEX/(name+'.png')); image.file_format='PNG'; image.save()
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF'); tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image
    mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']); bs.inputs['Roughness'].default_value=.82 if name!='crystal' else .28
    if name=='crystal': bs.inputs['Metallic'].default_value=.18
    mats[name]=mat

def mesh(name,verts,faces,uvs,material,smooth=True):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    ob=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(ob)
    data.materials.append(mats[material]); layer=data.uv_layers.new(name='UVMap')
    for p in data.polygons:
        p.use_smooth=smooth
        for li in p.loop_indices: layer.data[li].uv=uvs[data.loops[li].vertex_index]
    return ob

def tube(name,points,radii,mat='bark',sides=12):
    vs=[]; uv=[]; fs=[]
    for i,p in enumerate(points):
        p=Vector(p); tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])
        tangent.normalize(); ax=tangent.cross(Vector((0,1,0)))
        if ax.length<.1: ax=tangent.cross(Vector((1,0,0)))
        ax.normalize(); by=tangent.cross(ax).normalized()
        for j in range(sides+1):
            a=j/sides*math.tau; rr=radii[i]*(1+.09*math.sin(j*3+i*.5))
            vs.append(p+rr*(math.cos(a)*ax+math.sin(a)*by)); uv.append((j/sides,i/max(1,len(points)-1)))
        if i:
            for j in range(sides):
                k=i*(sides+1)+j; fs.append((k,k+1,k-sides,k-sides-1))
    fs.extend([tuple(range(sides,-1,-1)),tuple((len(points)-1)*(sides+1)+j for j in range(sides+1))])
    return mesh(name,vs,fs,uv,mat)

def crown(name,center,radius,height,mat='leaf',seed=0):
    # Scalloped hanging crown, not a scaled sphere: asymmetric apex and ruffled perimeter.
    vs=[]; uv=[]; fs=[]; rings=12; sides=48
    for i in range(rings+1):
        t=i/rings; r=radius*math.sin(t*math.pi*.73)
        z=height*(1-t**1.8)
        for j in range(sides+1):
            a=j/sides*math.tau; wave=(.07*math.sin(a*7+seed)+.045*math.cos(a*13+seed*2))*t
            rr=r*(1+wave)+.025*math.sin(i*2+a*9)*t
            vs.append((center[0]+rr*math.cos(a),center[1]+rr*math.sin(a),center[2]+z+.07*math.sin(a*11+seed)*t*t))
            uv.append((j/sides,t))
        if i:
            for j in range(sides):
                k=i*(sides+1)+j; fs.append((k,k+1,k-sides,k-sides-1))
    vs.append((center[0],center[1],center[2]+.08)); uv.append((.5,.5)); end=len(vs)-1
    for j in range(sides): fs.append((rings*(sides+1)+j,rings*(sides+1)+j+1,end))
    return mesh(name,vs,fs,uv,mat)

def leaf(center,ang,length,width,mat='leaf',rise=.2):
    vs=[]; uv=[]
    for i in range(9):
        t=i/8; w=width*math.sin(math.pi*t)**.8
        for s in [-1,0,1]:
            x=length*t; y=s*w
            z=rise*math.sin(t*math.pi*.8)+(.045 if s==0 else 0)*math.sin(t*math.pi)
            vs.append((center[0]+x*math.cos(ang)-y*math.sin(ang),center[1]+x*math.sin(ang)+y*math.cos(ang),center[2]+z)); uv.append(((s+1)/2,t))
    fs=[]
    for i in range(8):
        for j in range(2): k=i*3+j; fs.append((k,k+1,k+4,k+3))
    ob=mesh('curved leaf',vs,fs,uv,mat)
    # Real thickness, so leaves cast shadows from either side without transparent cards.
    mod=ob.modifiers.new('leaf thickness','SOLIDIFY'); mod.thickness=.012
    bpy.context.view_layer.objects.active=ob; bpy.ops.object.modifier_apply(modifier=mod.name)

def rock(pos,scale,seed=0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=pos); ob=bpy.context.object; ob.name='weathered boulder'
    for p in ob.data.vertices:
        co=p.co; co*=1+.10*math.sin(co.x*9+co.y*7+seed); co.x*=scale[0];co.y*=scale[1];co.z*=scale[2]
    ob.data.materials.append(mats['stone'])
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(); bpy.ops.object.mode_set(mode='OBJECT')
    crown('moss cap',(pos[0],pos[1],pos[2]+scale[2]*.55),scale[0]*.78,scale[2]*.4,'moss',seed)

def tree(s=1):
    tube('twisted trunk',[(0,0,0),(-.18*s,0,.5*s),(.07*s,.03*s,1.2*s),(-.12*s,.02*s,2.3*s)],[.43*s,.31*s,.24*s,.08*s])
    for j in range(6):
        a=j*math.tau/6; tube('root',[(math.cos(a)*.75*s,math.sin(a)*.65*s,.035),(.27*s*math.cos(a),.27*s*math.sin(a),.25*s),(0,0,.6*s)],[.035*s,.13*s,.22*s])
    for i,(x,y,z,r,h) in enumerate([(-.65,0,1.35,1.0,.58),(.65,.05,1.48,.94,.62),(-.1,.4,1.7,1.15,.65),(-.38,0,2.18,.95,.65),(.36,.18,2.65,.63,.48)]):
        tube('support branch',[(0,0,.9*s),(x*.6*s,y*s,z*.8*s),(x*s,y*s,z*s)],[.18*s,.12*s,.04*s])
        crown('layered canopy',(x*s,y*s,z*s),r*s,h*s,seed=i)
        for j in range(13):
            a=j*math.tau/13+i; leaf(((x+math.cos(a)*r*.72)*s,(y+math.sin(a)*r*.72)*s,z*s+.09*s),a,.24*s,.085*s,rise=.09*s)

def bare():
    tube('ancient twisted trunk',[(0,0,0),(-.22,0,.55),(-.32,.03,1.2),(.12,0,1.8),(-.1,.04,2.4),(.18,.08,2.95)],[.45,.35,.27,.19,.10,.008])
    for a in range(5):
        q=a*math.tau/5; tube('exposed root',[(math.cos(q)*.8,math.sin(q)*.65,.04),(.25*math.cos(q),.25*math.sin(q),.25),(0,0,.6)],[.02,.15,.24])
    for i in range(7):
        a=i*2.4; z=.9+i*.19; x=math.cos(a); y=math.sin(a)*.65
        tube('crooked bough',[(0,0,z),(x*.55,y*.55,z+.15),(x,y,z+.55),(x*.9,y*.95,z+1.0)],[.18,.13,.075,.006])
        tube('fork',[(x*.55,y*.55,z+.15),(x*.8-.2,y*.9,z+.48),(x*1.22-.2,y,z+.68)],[.07,.035,.003])

def pine():
    tube('pine trunk',[(0,0,0),(0,0,2.9)],[.25,.07])
    for i in range(5):
        z=.65+i*.48; r=1.15-i*.18
        crown('ruffled evergreen tier',(0,0,z),r,.94,'pine',i)
        for j in range(14):
            a=j*math.tau/14; leaf((math.cos(a)*r*.65,math.sin(a)*r*.65,z+.12),a,.38,.11,'pine',rise=-.15)

def bush():
    for i in range(5):
        a=i*2.4; c=(math.cos(a)*.35,math.sin(a)*.32,.1+i%2*.1); crown('shrub mound',c,.55,.46,seed=i)
    for i in range(38):
        a=i*2.4; leaf((math.cos(a)*.46,math.sin(a)*.40,.2+(i%4)*.08),a,.45,.13,rise=.25)

def plant():
    for i in range(15):
        a=i*2.4; leaf((0,0,.05),a,.65 if i<9 else .43,.15,'pine',rise=.35 if i<9 else .6)
    for i in range(3):
        x=(i-1)*.17; tube('flower stalk',[(x,0,.05),(x,.01,.55),(x+.05,0,.85)],[.035,.025,.015],'moss',8)
        for j in range(5): leaf((x+.05,0,.8),j*math.tau/5,.25,.09,'petal',rise=.2)

def stones():
    for i,(p,s) in enumerate([((-.45,0,.5),(.55,.48,.72)),((.4,.15,.29),(.5,.4,.4)),((.0,-.4,.14),(.3,.26,.23))]): rock(p,s,i)
    for j in range(15):
        a=j*2.4; leaf((math.cos(a)*.72,math.sin(a)*.55,.04),a,.25,.065,'moss',rise=.17)

def crystals():
    rock((0,0,.12),(.68,.5,.19),5)
    for i,(x,y,h,r) in enumerate([(-.1,.1,1.25,.22),(.35,0,.74,.18),(-.43,-.18,.58,.16),(.08,-.4,.42,.14)]):
        vs=[];uv=[]
        for k,(z,rad,dx) in enumerate([(0,r*.8,0),(h*.68,r,.07),(h,0,.16)]):
            for j in range(7):
                a=j/6*math.tau; vs.append((x+rad*math.cos(a)+dx,y+rad*math.sin(a),z+.1));uv.append((j/6,k/2))
        fs=[]
        for k in range(2):
            for j in range(6): n=k*7+j;fs.append((n,n+1,n+8,n+7))
        fs.append(tuple(range(6,-1,-1))); mesh('hexagonal teal crystal',vs,fs,uv,'crystal',False)

def vinearch():
    for j in range(3):
        ps=[]; rs=[]
        for i in range(25):
            a=math.pi*i/24; ps.append((1.25*math.cos(a)+.055*math.sin(i*.8+j),j*.15-.15,1.65*math.sin(a)+.12));rs.append(.14+.045*math.sin(a)+j*.015)
        tube('living arch twisted wood',ps,rs,'bark');tube('moss ribbon',[(x,y-.08,z+.11) for x,y,z in ps],[r*.5 for r in rs],'moss',8)
    for i in range(27):
        a=.12+(math.pi-.24)*i/26; leaf((1.25*math.cos(a),-.18,1.65*math.sin(a)+.24),i*2.4,.30,.11,'leaf',rise=.1)
    tube('hanging tendril',[(-.7,0,1.4),(-.4,0,.94),(.05,0,.9),(.45,0,1.38)],[.028,.022,.018,.01],'moss',8)

def block(name,loc,scale):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); ob=bpy.context.object;ob.name=name;ob.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(mats['stone']); mod=ob.modifiers.new('worn stone edges','BEVEL');mod.width=.045;mod.segments=2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project();bpy.ops.object.mode_set(mode='OBJECT')

def column(x=0,height=2.35):
    block('plinth',(x,0,.13),(.72,.67,.26))
    for i in range(4): block('separate ancient stone course',(x+.02*math.sin(i*3),0,.27+(height-.5)/4*(i+.5)),(.47,.45,(height-.5)/4-.025))
    for z in [.4,height*.54,height-.22]: block('carved collar',(x,0,z),(.59,.56,.11))
    block('broken capital',(x,0,height-.08),(.78,.66,.18))
    ps=[(x+.27*math.cos(i*.38),.25*math.sin(i*.38),.14+i*(height-.2)/29) for i in range(30)]
    tube('spiral climbing vine',ps,[.029]*30,'moss',8)
    for i in range(0,30,4): leaf(ps[i],i,.22,.08,'leaf',rise=.07)
    crown('capital moss',(x,0,height+.015),.34,.07,'moss')

def gateway():
    column(-1.05,2.5);column(1.05,2.5)
    # Individual radial voussoir stones create an actual open arch.
    for i in range(11):
        a=i*math.pi/11;b=(i+1)*math.pi/11;vs=[]
        for y in [-.24,.24]:
            for r,t in [(1.0,a),(1.0,b),(1.29,b),(1.29,a)]: vs.append((r*math.cos(t),y,1.47+r*math.sin(t)))
        mesh('arch voussoir',vs,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],[(0,0),(1,0),(1,1),(0,1)]*2,'stone',False)
    tube('draped vine',[(-1.1,-.32,2.5),(-.65,-.35,2.15),(0,-.36,1.98),(.6,-.35,2.14),(1.15,-.32,2.5)],[.04,.035,.029,.025,.018],'moss',8)
    for i in range(10): leaf((-.95+i*.21,-.3,2.58+math.sin(i*.3)*.17),i*2.4,.24,.1,'moss',rise=.09)

assets=[('elder-canopy','Layered elder • large',lambda:tree(1)),('young-canopy','Layered elder • small',lambda:tree(.68)),('gnarled-tree','Gnarled elder',bare),('tiered-pine','Tiered moonpine',pine),('fern-bush','Forest undergrowth',bush),('moonflower','Moonflower rosette',plant),('mossy-rocks','Mossy rock cluster',stones),('teal-crystals','Teal crystal cluster',crystals),('living-arch','Living vine arch',vinearch),('ruined-column','Ruined stone column',column),('ruined-gateway','Ruined stone gateway',gateway)]
manifest={'name':'Moonfen — original textured forest samples','version':1,'units':'meters','upAxis':'Y','license':'CC0-1.0 (new generated assets only)','assets':[]}
for id,title,fn in assets:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False); fn()
    # Merge meshes per material: individual model files, not scene-only primitives.
    for mat in mats.values():
        bpy.ops.object.select_all(action='DESELECT'); obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
        if obs:
            for ob in obs:ob.select_set(True)
            bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();obs[0].name=id+'_'+mat.name
    for ob in bpy.context.scene.objects:
        if ob.type=='MESH':
            mod=ob.modifiers.new('triangles','TRIANGULATE');bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
    # Place the authored pack's pivot at its ground-contact centre.
    bounds=[ob.matrix_world @ Vector(c) for ob in bpy.context.scene.objects if ob.type=='MESH' for c in ob.bound_box]
    offset=Vector(((min(c.x for c in bounds)+max(c.x for c in bounds))/2,(min(c.y for c in bounds)+max(c.y for c in bounds))/2,min(c.z for c in bounds)))
    for ob in bpy.context.scene.objects:
        if ob.type=='MESH': ob.location-=offset
    bpy.context.view_layer.update()
    path=OUT/(id+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
    manifest['assets'].append({'id':id,'title':title,'file':id+'.glb','bytes':path.stat().st_size,'meshes':len([o for o in bpy.context.scene.objects if o.type=='MESH']),'triangles':sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')})
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('MOONFEN_EXPORTED',len(manifest['assets']))

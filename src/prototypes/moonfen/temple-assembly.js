import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// Detached, read-only GLB composition. No app routes, auth, DB or controls imports.
const errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const holder=document.querySelector('#view');const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;holder.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#294b3d');scene.fog=new THREE.Fog('#294b3d',35,75);
const ambient=new THREE.HemisphereLight('#dce9c3','#345c51',2.2);scene.add(ambient);
const sun=new THREE.DirectionalLight('#fff0ca',3.5);sun.position.set(-8,16,9);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:.5,far:60});sun.shadow.normalBias=.025;sun.shadow.bias=-.0001;scene.add(sun);scene.add(sun.target);
const fill=new THREE.DirectionalLight('#acdbe0',.7);fill.position.set(8,6,-8);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(160,160),new THREE.MeshStandardMaterial({color:'#3b573b',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.012;ground.receiveShadow=true;scene.add(ground);
const camera=new THREE.OrthographicCamera(-9,9,7,-7,.1,150);const target=new THREE.Vector3(0,.3,1);let night=false;let view='whole';
const targets={whole:[0,.3,1],temple:[0,.3,-1.8],river:[0,.3,4]};
function draw(){const w=holder.clientWidth,h=holder.clientHeight,half=7.3;camera.left=-half*w/h;camera.right=half*w/h;camera.top=half;camera.bottom=-half;camera.position.copy(target).add(new THREE.Vector3(13,15,19));camera.lookAt(target);camera.updateProjectionMatrix();renderer.setSize(w,h);renderer.render(scene,camera);}
function setView(id){view=id;target.fromArray(targets[id]);for(const key of Object.keys(targets))document.querySelector('#'+key).setAttribute('aria-pressed',String(key===id));draw();}
for(const id of Object.keys(targets))document.querySelector('#'+id).addEventListener('click',()=>setView(id));
document.querySelector('#light').addEventListener('click',()=>{night=!night;ambient.intensity=night?.65:2.2;sun.intensity=night?1.5:3.5;sun.color.set(night?'#a0d6ec':'#fff0ca');renderer.toneMappingExposure=night?.95:1.1;document.querySelector('#light').textContent=night?'Light: moonlight':'Light: daylight';draw();});
new ResizeObserver(draw).observe(holder);
const base='/models/moonfen/';const loader=new GLTFLoader();const models=new Map();const instances=[];const placedRoots=[];
function place(id,x,y,z,rotation=0,scale=1){const root=models.get(id).clone(true);root.position.set(x,y,z);root.rotation.y=rotation;root.scale.setScalar(scale);scene.add(root);placedRoots.push(root);instances.push({id,position:[x,y,z],rotation,scale});return root;}
async function boot(){
 const manifest=await (await fetch(base+'manifest.json')).json();const ids=[...manifest.templeAssetIds,'elder-canopy','young-canopy','fern-bush','blue-heart-small','pink-bud-rosette','moss-boulder-group'];
 for(const id of ids){const asset=manifest.assets.find(a=>a.id===id);if(!asset)throw Error('Unknown module '+id);const {scene:root}=await loader.loadAsync(base+asset.file);root.traverse(o=>{if(o.isMesh){if(!o.geometry.attributes.uv||!o.geometry.attributes.normal||!o.material.map)throw Error('Incomplete mesh '+id);o.castShadow=true;o.receiveShadow=true;}});models.set(id,root);}
 // Square temple floor grid: seam coordinates x=-6,-4,...6; z=-6,-4,-2,0.
 for(const x of [-5,-3,-1,1,3,5])for(const z of [-5,-3,-1])place('temple-floor-tile',x,0,z);
 place('temple-plaza',0,.4,-3);place('temple-stairs',0,.4,0);
 place('temple-parapet-corner',-1,1.4,-4);place('temple-parapet',1,1.4,-4.75);place('temple-parapet',-1.75,1.4,-2,Math.PI/2);place('temple-parapet',1.75,1.4,-3,Math.PI/2);
 place('temple-cyan-pedestal',0,1.4,-3);place('temple-cyan-pedestal',-1.7,.4,1);place('temple-cyan-pedestal',1.7,.4,1);
 place('temple-broken-wall',-4,.4,-4);place('temple-broken-wall',3.8,.4,-4.8,Math.PI/2);place('temple-rubble',-3.4,.4,-1.7);place('temple-rubble',3.2,.4,-2.8,.7);
 // Water flows across X; bridge spans Z after quarter turn. Banks touch both ends.
 for(const x of [-4,0,4]){place('river-stream',x,0,4,Math.PI/2);place('river-grass-bank',x,0,1,Math.PI/2);place('river-grass-bank',x,0,7,Math.PI/2);}
 place('river-root-bridge',0,0,4,Math.PI/2);
 // Reused existing plants are independent GLBs, not baked into terrain modules.
 for(const [id,x,y,z,s] of [['elder-canopy',-5,.4,-4.5,1],['young-canopy',4.8,.4,-3.5,1],['elder-canopy',-5.1,.4,7.4,.9],['young-canopy',5,.4,7.4,.8],['fern-bush',-4.7,.4,.8,.6],['fern-bush',4.7,.4,.8,.65],['blue-heart-small',-2.9,.4,7,.9],['pink-bud-rosette',3.7,.4,7,1],['moss-boulder-group',-4.6,.4,6.8,.8],['moss-boulder-group',4.8,.4,-.8,.7]])place(id,x,y,z,0,s);
 const joins=[{name:'plaza-to-stairs',axis:'z',a:-3+2,b:0-1,heightA:.4+1,heightB:.4+1},{name:'floor-to-north-bank',axis:'z',a:-1+1,b:1-1,heightA:.4,heightB:.4},{name:'north-bank-to-bridge',axis:'z',a:1+1,b:4-2,heightA:.4,heightB:.4},{name:'bridge-to-south-bank',axis:'z',a:4+2,b:7-1,heightA:.4,heightB:.4}];
 for(const join of joins)if(Math.abs(join.a-join.b)>1e-6||Math.abs(join.heightA-join.heightB)>1e-6)throw Error('Seam mismatch: '+join.name);
 scene.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();
 function surface(id,origin,x,z){const index=instances.findIndex(a=>a.id===id&&a.position.every((v,i)=>v===origin[i]));if(index<0)throw Error('Missing seam module '+id);ray.set(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(placedRoots[index],true)[0];if(!hit)throw Error('Missing seam surface '+id);return hit.point.y;}
 const samples=[['temple-plaza',[0,.4,-3],.2,-1.06,'temple-stairs',[0,.4,0],.2,-.94],['temple-floor-tile',[1,0,-1],.2,-.06,'river-grass-bank',[0,0,1],.2,.06],['river-grass-bank',[0,0,1],.2,1.94,'river-root-bridge',[0,0,4],.2,2.06],['river-root-bridge',[0,0,4],.2,5.94,'river-grass-bank',[0,0,7],.2,6.06]];
 const measuredSeams=samples.map((s,i)=>{const a=surface(...s.slice(0,4)),b=surface(...s.slice(4));const delta=Math.abs(a-b);if(delta>.025)throw Error('Rendered seam height mismatch '+joins[i].name+': '+delta);return {name:joins[i].name,surfaceA:a,surfaceB:b,delta,tolerance:.025};});
 window.templeAssembly={ready:true,errors,loadedIds:ids,instances,joins,measuredSeams,get view(){return view},get night(){return night},get camera(){return {position:camera.position.toArray(),top:camera.top,bottom:camera.bottom}},get render(){return renderer.info.render}};
 document.querySelector('#status').textContent=`${manifest.templeAssetIds.length} new modules + 6 reused props loaded · ${instances.length} independent placements · 4 connector checks passed`;
 draw();
}
boot().catch(e=>{errors.push(String(e));document.querySelector('#status').textContent=String(e);console.error(e)});

import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
window.treeProof={loaded:[],errors:[],mode:'game'};
window.addEventListener('error',e=>window.treeProof.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.treeProof.errors.push(String(e.reason)));
const views=[];
const loader=new GLTFLoader();
async function make(id,url){
 const host=document.getElementById(id),scene=new THREE.Scene();scene.background=new THREE.Color('#d1d6ca');
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;host.appendChild(renderer.domElement);
 const camera=new THREE.OrthographicCamera();camera.near=.1;camera.far=100;
 scene.add(new THREE.HemisphereLight(0xd2e5ec,0x526042,2));
 const sun=new THREE.DirectionalLight(0xffe8be,3.2);sun.position.set(-4,10,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-8,right:8,top:9,bottom:-8,near:.1,far:35});sun.shadow.normalBias=.025;sun.shadow.bias=-.0001;sun.shadow.radius=3;scene.add(sun);
 const rim=new THREE.DirectionalLight(0xc5e3ee,1.3);rim.position.set(4,6,-4);scene.add(rim);
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#b7c0ae',roughness:1}));plane.rotation.x=-Math.PI/2;plane.position.y=-.025;plane.receiveShadow=true;scene.add(plane);
 const {scene:model}=await loader.loadAsync(url);model.updateMatrixWorld(true);let box=new THREE.Box3().setFromObject(model);const size=box.getSize(new THREE.Vector3()),factor=5.95/size.y;model.scale.setScalar(factor);model.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(model);const mid=box.getCenter(new THREE.Vector3());model.position.set(-mid.x,-box.min.y,-mid.z);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(model);
 const view={host,renderer,scene,camera,model};views.push(view);window.treeProof.loaded.push({id,url,height:5.95,meshes:[]});model.traverse(o=>{if(o.isMesh)window.treeProof.loaded.at(-1).meshes.push({name:o.name,positions:o.geometry.attributes.position.count,uv:!!o.geometry.attributes.uv,normal:!!o.geometry.attributes.normal,map:!!o.material.map,roughnessMap:!!o.material.roughnessMap})});draw(view);
}
function draw(v){const w=v.host.clientWidth,h=v.host.clientHeight,close=window.treeProof.mode==='close',scale=close?6.7:8.3;v.renderer.setSize(w,h,false);Object.assign(v.camera,{left:-scale*w/h/2,right:scale*w/h/2,top:scale/2,bottom:-scale/2});v.camera.position.set(...(close?[7,5.7,12]:[9,9,14]));v.camera.lookAt(0,2.9,0);v.camera.updateProjectionMatrix();v.renderer.render(v.scene,v.camera);}
for(const mode of ['game','close'])document.getElementById(mode).onclick=()=>{window.treeProof.mode=mode;for(const m of ['game','close'])document.getElementById(m).setAttribute('aria-pressed',String(m===mode));views.forEach(draw)};
window.addEventListener('resize',()=>views.forEach(draw));
try{await Promise.all([make('before','/models/moonfen/elder-canopy.glb'),make('after','/models/tree-refinement/tiered-canopy-elder.glb')]);document.getElementById('status').textContent='2 / 2 GLBs loaded · same height, angle & lighting';window.treeProof.ready=true;}catch(e){window.treeProof.errors.push(String(e));document.getElementById('status').textContent='Load failed: '+e.message;}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const base='/models/moonfen/';
const errors=[]; window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
const holder=document.querySelector('#hero');holder.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#d8ded2');
const ambient=new THREE.HemisphereLight('#ecf5e5','#65756c',2.1);scene.add(ambient);
const key=new THREE.DirectionalLight('#fff4d4',4.1);key.position.set(-3,7,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=5;key.shadow.camera.bottom=-4;key.shadow.normalBias=.025;key.shadow.bias=-.00015;key.shadow.radius=3;scene.add(key);scene.add(key.target);
const fill=new THREE.DirectionalLight('#b0dbdc',1.1);fill.position.set(3,3,-4);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#c5cfbd',roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.position.y=-.015;scene.add(ground);
const camera=new THREE.OrthographicCamera(-3,3,3,-3,.1,100);
const loader=new GLTFLoader();const models=[];let active=0;let night=false;
function view(index,w,h){
  active=index;models.forEach((m,i)=>m.root.visible=i===index);
  const m=models[index];const aspect=w/h;const radius=Math.max(m.size.y*.70,m.size.x*.62,m.size.z*.75,.65)*1.18;
  camera.left=-radius*aspect;camera.right=radius*aspect;camera.top=radius;camera.bottom=-radius;
  const target=new THREE.Vector3(0,m.size.y*.47,0);camera.position.copy(target).add(new THREE.Vector3(4.8,3.9,7));camera.lookAt(target);camera.updateProjectionMatrix();
  renderer.setSize(w,h);renderer.render(scene,camera);
}
function select(index){const m=models[index];view(index,holder.clientWidth,holder.clientHeight);document.querySelector('#title').textContent=m.asset.title;document.querySelector('#stats').textContent=`${m.meshes} meshes · ${m.asset.triangles.toLocaleString()} triangles · ${m.textures.size} embedded textures · ${(m.asset.bytes/1024).toFixed(0)} KB`;document.querySelector('#download').href=base+m.asset.file;document.querySelectorAll('.asset').forEach((b,i)=>b.setAttribute('aria-pressed',String(index===i)));}
async function boot(){
 const response=await fetch(base+'manifest.json');if(!response.ok)throw Error('Manifest fetch failed');const manifest=await response.json();
 for(const asset of manifest.assets){
  const gltf=await loader.loadAsync(base+asset.file);const root=gltf.scene;let meshes=0;const textures=new Set();
  root.traverse(o=>{if(o.isMesh){meshes++;o.castShadow=true;o.receiveShadow=true;if(!o.geometry.attributes.uv)throw Error(asset.id+' missing UV');const material=o.material;if(!material.map)throw Error(asset.id+' missing texture');textures.add(material.map.uuid);}});
  const bounds=new THREE.Box3().setFromObject(root);const size=bounds.getSize(new THREE.Vector3());const center=bounds.getCenter(new THREE.Vector3());root.position.x-=center.x;root.position.z-=center.z;root.position.y-=bounds.min.y;
  root.visible=false;scene.add(root);models.push({asset,root,size,meshes,textures});
 }
 for(let i=0;i<models.length;i++){
  view(i,360,288);const button=document.createElement('button');button.className='asset';button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',models[i].asset.title);const image=document.createElement('img');image.src=renderer.domElement.toDataURL('image/png');image.alt=models[i].asset.title;const label=document.createElement('span');label.textContent=String(i+1).padStart(2,'0')+' / '+models[i].asset.title;button.append(image,label);button.addEventListener('click',()=>select(i));document.querySelector('#gallery').append(button);
 }
 const requested=decodeURIComponent(location.hash.slice(1));select(Math.max(0,models.findIndex(m=>m.asset.id===requested)));document.querySelector('#status').textContent=`${models.length} / ${manifest.assets.length} textured GLBs loaded successfully`;
 window.moonfen={ready:true,errors,assets:models.map(m=>({id:m.asset.id,meshes:m.meshes,textures:m.textures.size,triangles:m.asset.triangles})),get selected(){return models[active].asset.id},get camera(){return camera.position.toArray()},get render(){return renderer.info.render},select};
}
document.querySelector('#light').addEventListener('click',()=>{night=!night;key.color.set(night?'#b9d5ff':'#fff4d4');key.position.x=night?4:-3;ambient.intensity=night?1.0:2.1;key.intensity=night?3:4.1;document.querySelector('#light').textContent=night?'Light: moonlight':'Light: daylight';select(active);});
new ResizeObserver(()=>{if(models.length)select(active)}).observe(holder);
boot().catch(e=>{errors.push(String(e));document.querySelector('#status').textContent='Load failed: '+e.message;console.error(e)});

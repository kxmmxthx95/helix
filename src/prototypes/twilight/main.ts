import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import './style.css';

// Isolated art study: no application imports, auth, API, persistence or real records.
const root = document.querySelector<HTMLDivElement>('#forest-root')!;
root.innerHTML = `<canvas id="world" aria-label="ป่าต้นแบบสามมิติ มุมกล้องคงที่"></canvas><div class="shade"></div>
<header><div><div class="brand">HELIX <span>WORLD STUDY / 01</span></div><h1 class="heading">The Verdant Archive</h1><p class="sub">ป่าแห่งการเรียนรู้ · ฉากตัวอย่างสำหรับพิจารณาภาพ</p></div><div class="tag">VISUAL PROTOTYPE</div></header>
<div id="markers"></div><div class="hint">FIXED CAMERA · SAMPLE STAGES ONLY</div><footer class="bottom"><section class="selection" aria-live="polite"><div class="eyebrow" id="stage-kicker"></div><h2 id="stage-title"></h2><button class="open" id="open">เปิดบทเรียนตัวอย่าง <span>↗</span></button></section><nav class="navigation" aria-label="เลือกจุดตัวอย่าง"><button id="previous" aria-label="จุดก่อนหน้า">←</button><span class="count" id="count"></span><button id="next" aria-label="จุดถัดไป">→</button></nav></footer>
<dialog class="dialog"><div class="eyebrow">SAMPLE · NOT A REAL LESSON</div><h2 id="dialog-title"></h2><p>จุดนี้ใช้ทดสอบภาพและการเลือกบทเรียนเท่านั้น ยังไม่เชื่อมบทเรียนจริง และไม่มีการบันทึกหรือเปลี่ยนแปลงข้อมูล</p><button id="close">กลับสู่ป่า</button></dialog><div class="loading">Growing the forest…</div>`;
const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#163930');
scene.fog = new THREE.FogExp2('#24483d', .019);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const camera = new THREE.OrthographicCamera(-14,14,10,-10,.1,130);
const focus = new THREE.Vector3(0,0,1);
const cameraOffset = new THREE.Vector3(12,17,22);
scene.add(new THREE.HemisphereLight('#b4d5c4','#162d24',1.2));
const sun = new THREE.DirectionalLight('#fff1bd',1.8);
sun.position.set(-8,20,6); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-25;sun.shadow.camera.right=25;
sun.shadow.camera.top=25;sun.shadow.camera.bottom=-25;sun.shadow.normalBias=.08;
scene.add(sun, new THREE.AmbientLight('#4a9c93',.25));
let seed=93271;
function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const between=(a:number,b:number)=>a+rand()*(b-a);
const pathX=(z:number)=>Math.sin(z*.16)*1.6;
const mats = {
 bark:new THREE.MeshStandardMaterial({color:'#544e31',roughness:1}),
 stone:new THREE.MeshStandardMaterial({color:'#617b64',roughness:1,flatShading:true}),
 darkStone:new THREE.MeshStandardMaterial({color:'#344e44',roughness:1,flatShading:true}),
 moss:new THREE.MeshStandardMaterial({color:'#678340',roughness:1}),
 crystal:new THREE.MeshStandardMaterial({color:'#57dbc3',emissive:'#0fc6aa',emissiveIntensity:.38,roughness:.25,metalness:.15,flatShading:true}),
};
function mesh(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx=1,sy=sx,sz=sx){
 const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o;
}
const box=new THREE.BoxGeometry(1,1,1);
const rock=new THREE.IcosahedronGeometry(1,1);
function branch(points:THREE.Vector3[],radius:number,material=mats.bark){
 const curve=new THREE.CatmullRomCurve3(points);return mesh(new THREE.TubeGeometry(curve,12,radius,6,false),material,0,0,0);
}
// Original painted ground texture; dirt, lichen, leaf litter. Never samples reference art.
const paint=document.createElement('canvas');paint.width=paint.height=2048;
const ctx=paint.getContext('2d')!;ctx.fillStyle='#314c2c';ctx.fillRect(0,0,2048,2048);
for(let i=0;i<130000;i++){
 const x=rand()*2048,y=rand()*2048;const z=(y/2048-.5)*100;const wx=(x/2048-.5)*100;
 const trail=Math.abs(wx-pathX(z))<2.25+Math.sin(z*1.7)*.12;
 const colors=trail?['#7e7651','#978458','#a38d61','#6f714b','#8c8059']:['#365a32','#425f34','#25482d','#54703a','#667c3b'];
 ctx.fillStyle=colors[Math.floor(rand()*colors.length)]!;ctx.globalAlpha=between(.15,.55);
 ctx.beginPath();ctx.ellipse(x,y,between(1,9),between(1,5),rand()*6,0,Math.PI*2);ctx.fill();
}ctx.globalAlpha=1;
const groundTex=new THREE.CanvasTexture(paint);groundTex.colorSpace=THREE.SRGBColorSpace;groundTex.anisotropy=8;
const ground=mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({map:groundTex,roughness:1}),0,-.08,0);ground.rotation.x=-Math.PI/2;ground.castShadow=false;
// Broken, individually sized trail stones, not a uniform grid.
for(let i=0;i<180;i++){
 const z=between(-27,24),x=pathX(z)+between(-1.95,1.95);
 const p=mesh(rock,rand()>.45?mats.stone:mats.darkStone,x,.015,z,between(.18,.55),between(.045,.09),between(.22,.55));p.rotation.y=rand()*6;
}
// Leaf silhouettes are folded lance shapes, with three shaded facets.
const leafGeo=new THREE.BufferGeometry();
leafGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0, -.5,.12,.45,0,.22,1.2, 0,0,0,0,.22,1.2,.5,.12,.45, -.5,.12,.45,0,.12,.65,0,.22,1.2, .5,.12,.45,0,.22,1.2,0,.12,.65],3));
leafGeo.computeVertexNormals();
const leaves: {p:THREE.Vector3,s:THREE.Vector3,r:THREE.Euler,c:THREE.Color}[]=[];
function leaf(x:number,y:number,z:number,s:number,angle:number,color:THREE.Color){leaves.push({p:new THREE.Vector3(x,y,z),s:new THREE.Vector3(s,s,s),r:new THREE.Euler(between(-.5,.4),angle,between(-.4,.4)),c:color});}
const canopyPalette=Array.from({length:10},(_,i)=>new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.28+i*.006,.32,.13+i*.009),roughness:1}));
function tree(x:number,z:number,h:number){
 const lean=between(-.6,.6);
 branch([new THREE.Vector3(x,0,z),new THREE.Vector3(x-.15,h*.35,z+.1),new THREE.Vector3(x+lean,h*.8,z)],h*.065);
 // Buttress roots and crooked lateral boughs.
 for(let i=0;i<5;i++){const a=i*1.256+rand()*.4;branch([new THREE.Vector3(x+Math.cos(a)*1.2,.04,z+Math.sin(a)*1.2),new THREE.Vector3(x+Math.cos(a)*.4,.3,z+Math.sin(a)*.4),new THREE.Vector3(x,h*.3,z)],.13);}
 for(let level=0;level<3;level++){
 const cy=h*(.66+level*.17),radius=h*(.34-level*.065);
 for(let j=0;j<4;j++){
 const a=j*1.57+level*.8,cx=x+Math.cos(a)*radius*.55,cz=z+Math.sin(a)*radius*.55;
 branch([new THREE.Vector3(x,cy-.9,z),new THREE.Vector3(cx,cy-.3,cz),new THREE.Vector3(cx,cy,cz)],.12);
 const g=new THREE.IcosahedronGeometry(1,2);const pos=g.getAttribute('position');
 for(let k=0;k<pos.count;k++){const v=new THREE.Vector3().fromBufferAttribute(pos,k);v.multiplyScalar(between(.87,1.13));pos.setXYZ(k,v.x,v.y,v.z);}g.computeVertexNormals();
 const canopyMat=canopyPalette[Math.floor(rand()*canopyPalette.length)]!;
 mesh(g,canopyMat,cx,cy,cz,radius,.65,radius*.8);
 for(let k=0;k<42;k++){
 const a2=rand()*Math.PI*2,r=Math.sqrt(rand())*radius;
 const lx=cx+Math.cos(a2)*r,lz=cz+Math.sin(a2)*r,ly=cy+.6*Math.sqrt(Math.max(0,1-r*r/(radius*radius)));
 leaf(lx,ly,lz,between(.15,.32),a2,new THREE.Color().setHSL(between(.27,.35),between(.28,.5),between(.2,.39)));
 }
 }
 }
}
// Clear sightline along the path; asymmetric edge planting fills the frame.
for(let z=-34;z<29;z+=3.8){
 for(const side of [-1,1]){
 for(let row=0;row<3;row++){
 const x=pathX(z)+side*(5.6+row*3.8+between(-.6,.6));
 tree(x,z+between(-1,1),between(3.2,5.2)+row*.65);
 }
 }
}
// Broad ferns and small leaf mounds near the trail.
for(let i=0;i<360;i++){
 const z=between(-30,24),side=rand()>.5?1:-1,x=pathX(z)+side*between(2.5,6.5);
 const s=between(.35,.85);
 for(let j=0;j<9;j++){
 const a=j/9*Math.PI*2;const col=new THREE.Color().setHSL(between(.25,.43),.4,between(.2,.36));
 leaf(x,.13,z,s,a,col);
 for(let k=1;k<5;k++){const d=k*s*.2;leaf(x+Math.sin(a)*d,.12+Math.sin(k/5*Math.PI)*s*.5,z+Math.cos(a)*d,s*.28,a+.8,col);leaf(x+Math.sin(a)*d,.12+Math.sin(k/5*Math.PI)*s*.5,z+Math.cos(a)*d,s*.28,a-.8,col);}
 }
 if(i%5===0){const o=mesh(rock,mats.darkStone,x,.28,z,between(.4,.8),between(.3,.6),between(.4,.8));o.rotation.set(rand(),rand(),rand());mesh(rock,mats.moss,x,.57,z,.43,.12,.38);}
}
// Organic overhead vine arches with twisting secondary vines and leaves.
for(const z of [5,-7]){
 const x=pathX(z);const points=[];
 for(let i=0;i<=12;i++){const a=Math.PI-i/12*Math.PI;points.push(new THREE.Vector3(x+Math.cos(a)*3.8,Math.sin(a)*4.4+.15,z+Math.sin(a*2)*.32));}
 branch(points,.29,mats.bark);
 const vine=[];for(let i=0;i<=70;i++){const a=Math.PI-i/70*Math.PI;vine.push(new THREE.Vector3(x+Math.cos(a)*3.8+Math.sin(i*.7)*.2,Math.sin(a)*4.4+.2+Math.cos(i*.7)*.2,z+Math.sin(a*2)*.32+Math.cos(i*.7)*.2));}
 branch(vine,.09,mats.moss);
 for(let i=0;i<150;i++){const a=rand()*Math.PI;leaf(x+Math.cos(a)*3.8+between(-.3,.3),Math.sin(a)*4.4+.3,z+between(-.35,.35),between(.25,.55),rand()*6,new THREE.Color().setHSL(.24,.43,between(.27,.43)));}
}
// Temple stairway, weathered courses, broken pillars, lintel and creeping vines.
const tz=-19,tx=pathX(tz);
for(let step=0;step<10;step++){
 mesh(box,mats.darkStone,tx,step*.18,-16-step*.45,5.8,.25,.6);
 mesh(box,mats.stone,tx,step*.18+.13,-16-step*.45,5.9,.07,.62);
}
mesh(box,mats.darkStone,tx,1.7,tz-1,7,.45,4);
for(const side of [-1,1]){
 const x=tx+side*2.75;
 mesh(box,mats.darkStone,x,.8,-18, .65,1.6,5.4);
 mesh(box,mats.stone,x,1.65,-18,.85,.15,5.7);
 for(const z of [-19.8,-22]){
 const height=z===-22&&side===1?2.5:4.1;
 mesh(box,mats.stone,x,2.05,z,1,.35,1);
 for(let k=0;k<height/.42;k++){const o=mesh(box,k%3===0?mats.darkStone:mats.stone,x,2.3+k*.42,z,.65,.4,.7);o.rotation.y=between(-.025,.025);}
 for(const y of [2.5,4.2,5.9]){if(y<height+2)mesh(box,mats.stone,x,y,z,.85,.18,.9);}
 const vine=[];for(let i=0;i<35;i++){const a=i*.3;vine.push(new THREE.Vector3(x+Math.sin(a)*.42,2+i*.095,z+Math.cos(a)*.45));}branch(vine,.055,mats.moss);
 }
}
mesh(box,mats.darkStone,tx,6.4,-19.8,6.6,.55,1.1);mesh(box,mats.stone,tx,6.7,-19.8,7,.14,1.35);
for(let i=0;i<45;i++)leaf(tx+between(-3.5,3.5),6.8,-19.8+between(-.5,.5),between(.3,.7),rand()*6,new THREE.Color('#6b8d48'));
// Custom six-sided crystals: offset shoulders and sharp, uneven tips.
function crystalGeometry(){
 const vertices=[];
 for(let i=0;i<6;i++){
 const a=i/6*Math.PI*2,b=(i+1)/6*Math.PI*2;
 const p=[Math.cos(a)*.27,0,Math.sin(a)*.27],q=[Math.cos(b)*.27,0,Math.sin(b)*.27];
 const r=[Math.cos(a)*.23,.75,Math.sin(a)*.23],s=[Math.cos(b)*.23,.75,Math.sin(b)*.23];
 vertices.push(...p,...q,...r,...q,...s,...r,...r,...s,.08,1.25,-.04);
 }const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}
const cg=crystalGeometry();const glows:THREE.PointLight[]=[];
for(const [x,z] of [[-3.5,8],[3.8,2],[-4,-3],[2.9,-10],[-3.8,-15],[3,-21]] as const){
 mesh(rock,mats.darkStone,x,.15,z,1,.3,.8);
 for(let j=0;j<7;j++){const s=between(.35,1.15);const c=mesh(cg,mats.crystal,x+between(-.6,.6),.25,z+between(-.5,.5),s,s,s);c.rotation.set(between(-.3,.3),rand()*6,between(-.4,.4));}
 const light=new THREE.PointLight('#50f5d5',4,5,2);light.position.set(x,1,z);scene.add(light);glows.push(light);
}
const inst=new THREE.InstancedMesh(leafGeo,new THREE.MeshStandardMaterial({color:'#436b42',side:THREE.DoubleSide,roughness:1}),leaves.length);
const dummy=new THREE.Object3D();leaves.forEach((l,i)=>{dummy.position.copy(l.p);dummy.scale.copy(l.s);dummy.rotation.copy(l.r);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);inst.setColorAt(i,l.c);});inst.receiveShadow=true;scene.add(inst);
// Soft motes, not combat effects. No motion at all with reduced-motion.
const moteCanvas=document.createElement('canvas');moteCanvas.width=moteCanvas.height=32;
const mc=moteCanvas.getContext('2d')!;const mg=mc.createRadialGradient(16,16,0,16,16,16);mg.addColorStop(0,'#fff9c6');mg.addColorStop(.2,'#c8f3a9');mg.addColorStop(1,'#c8f3a900');mc.fillStyle=mg;mc.fillRect(0,0,32,32);
const motePositions=new Float32Array(100*3);for(let i=0;i<100;i++){motePositions[i*3]=between(-7,7);motePositions[i*3+1]=between(.5,5);motePositions[i*3+2]=between(-25,20);}
const moteGeo=new THREE.BufferGeometry();moteGeo.setAttribute('position',new THREE.BufferAttribute(motePositions,3));
const motes=new THREE.Points(moteGeo,new THREE.PointsMaterial({map:new THREE.CanvasTexture(moteCanvas),transparent:true,depthWrite:false,size:.11,opacity:.7,blending:THREE.AdditiveBlending}));scene.add(motes);
const stages=[{title:'ลานแสงแรก',z:8},{title:'ซุ้มเถาวัลย์',z:1},{title:'ทางสู่หอจดหมายเหตุ',z:-7}];
const stageButtons=stages.map((s,i)=>{
 const b=document.createElement('button');b.className='stage-label';b.textContent=String(i+1).padStart(2,'0');b.setAttribute('aria-label',`จุดตัวอย่าง ${i+1}: ${s.title}`);b.onclick=()=>select(i);document.querySelector('#markers')!.append(b);return b;
});
const title=document.querySelector('#stage-title')!,kicker=document.querySelector('#stage-kicker')!,counter=document.querySelector('#count')!;
const prev=document.querySelector<HTMLButtonElement>('#previous')!,next=document.querySelector<HTMLButtonElement>('#next')!;
let selected=0;
const targetFocus=new THREE.Vector3();
function select(index:number){
 selected=Math.max(0,Math.min(stages.length-1,index));const s=stages[selected]!;
 targetFocus.set(pathX(s.z),0,s.z-3);
 title.textContent=s.title;kicker.textContent=`SAMPLE STAGE ${String(selected+1).padStart(2,'0')} / จุดตัวอย่าง`;
 counter.textContent=`${String(selected+1).padStart(2,'0')} / 03`;prev.disabled=selected===0;next.disabled=selected===2;
 stageButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));
 if(reduced.matches)focus.copy(targetFocus);
}
prev.onclick=()=>select(selected-1);next.onclick=()=>select(selected+1);
const dialog=document.querySelector<HTMLDialogElement>('dialog')!;
document.querySelector('#open')!.addEventListener('click',()=>{document.querySelector('#dialog-title')!.textContent=stages[selected]!.title;dialog.showModal();});
document.querySelector('#close')!.addEventListener('click',()=>dialog.close());
window.addEventListener('keydown',e=>{if(dialog.open)return;if(e.key==='ArrowLeft')select(selected-1);if(e.key==='ArrowRight')select(selected+1);});
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);const halfH=w<600?12:10;camera.left=-halfH*w/h;camera.right=halfH*w/h;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();select(0);focus.copy(targetFocus);
let previous=0;
function frame(time:number){
 const dt=Math.min((time-previous)/1000,.05);previous=time;
 focus.lerp(targetFocus,reduced.matches?1:1-Math.exp(-dt*4));
 camera.position.copy(focus).add(cameraOffset);camera.lookAt(focus);camera.updateMatrixWorld();
 if(!reduced.matches){motes.position.y=Math.sin(time*.00025)*.15;glows.forEach((l,i)=>l.intensity=4+Math.sin(time*.001+i)*.35);}
 else{motes.position.y=0;glows.forEach(l=>l.intensity=4);}
 stages.forEach((s,i)=>{const p=new THREE.Vector3(pathX(s.z),.25,s.z).project(camera);stageButtons[i]!.style.left=`${(p.x*.5+.5)*innerWidth}px`;stageButtons[i]!.style.top=`${(-p.y*.5+.5)*innerHeight}px`;stageButtons[i]!.hidden=p.x < -1 || p.x > 1 || p.y < -.45 || p.y > .65;});
 renderer.render(scene,camera);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);document.querySelector('.loading')!.remove();
// Read-only QA state, no app data exposed.
Object.defineProperty(window,'forestPrototype',{get:()=>({selected,stageCount:stages.length,reducedMotion:reduced.matches,camera:camera.position.toArray(),focus:focus.toArray(),target:targetFocus.toArray(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,leafCount:leaves.length})});
// Keep module graph deliberately independent of the production app.
// Bake static pieces by shared material to reduce draw calls without changing art.
const batches=new Map<THREE.Material,THREE.Mesh[]>();
scene.children.forEach(o=>{if(o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && !Array.isArray(o.material)){const list=batches.get(o.material)||[];list.push(o);batches.set(o.material,list);}});
for(const [material,objects] of batches){if(objects.length<2)continue;const geometries=objects.map(o=>{o.updateMatrix();const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();return g.applyMatrix4(o.matrix);});const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!merged)continue;const baked=new THREE.Mesh(merged,material);baked.castShadow=true;baked.receiveShadow=true;scene.add(baked);objects.forEach(o=>scene.remove(o));}

import {COLS,ROWS,W,H,CLIFF,STREAM,STEPS,project,unproject,trailI,streamJ,materialAt,pickTile,spriteRect,sceneBounds} from './layout.mjs';
const gameMode=document.documentElement.hasAttribute('data-game-screen');
const canvas=gameMode?document.createElement('canvas'):document.querySelector('#map'),ctx=canvas.getContext('2d'),stage=document.querySelector('main');
const info=document.querySelector('#info'),errors=[];
window.addEventListener('error',e=>errors.push(e.message));
window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
let grid=false,showDecor=true,zoom='fit',mode='scene',selected=null,displayScale=1;
const images=new Map(),props=new Map(),textures=new Map();
async function json(url){const r=await fetch(url);if(!r.ok)throw Error(`${r.status}: ${url}`);return r.json()}
async function load(url){const im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(Error(`Image failed: ${url}`));im.src=url});return im}
const [manifest,propsManifest,derived]=await Promise.all([json('/tiles/twilight/manifest.json'),json('/tiles/twilight/props/manifest.json'),json('/tiles/twilight/polished/manifest.json')]);
await Promise.all([
 ...manifest.tiles.map(async t=>images.set(t.id,await load('/tiles/twilight/'+t.file))),
 ...propsManifest.assets.map(async t=>props.set(t.id,await load('/tiles/twilight/props/'+t.file))),
 ...derived.textures.map(async t=>{const im=await load('/tiles/twilight/polished/'+t.file),c=document.createElement('canvas');c.width=c.height=64;const cx=c.getContext('2d');cx.drawImage(im,0,0);textures.set(t.id,cx.getImageData(0,0,64,64).data)})
]);
const anchorOverrides={oak_large:[144,253],oak_medium:[98,205],oak_small:[85,161],oak_tiny:[61,127],pine_large:[114,252],pine_medium:[80,216],pine_small:[52,163],pine_tiny:[34,111],rocks_medium:[69,97],rocks_large:[85,122],bush_flower_large:[68,97],root_bridge:[104,30]};
// Each tuple is independently editable: sprite, i, j, scale. Two irregular canopy borders.
const placements=[];
const back=['oak_large','pine_medium','gold_medium','oak_medium','dead_medium','pine_large','blue_tree','oak_small','wisteria_small','oak_medium','cherry_medium'];
const front=['pine_small','oak_small','gold_small','dead_small','oak_medium','blue_tree','pine_medium','cherry_small','wisteria_small'];
for(let n=0;n<16;n++){
 const j=2.1+n*1.48;
 placements.push([back[n%back.length],-.05+.15*Math.sin(n*2.3),j,.82+.08*Math.sin(n)]);
 if(j>6.2&&Math.abs(j-STREAM)>1.5)placements.push([front[n%front.length],5.2+.12*Math.sin(n*1.9),j,.59+.025*Math.sin(n*2)]);
}
// An outer understory and inner verge leave an uninterrupted readable walking lane.
const verge=['mushroom_red_medium','crystal','rocks_small','plant_fern','mushroom_blue_small','bush_flower_small','grass_medium','glow_plant'];
for(let n=0;n<35;n++){
 const j=6.2+n*.54;
 if(Math.abs(j-STREAM)<1.2)continue;
 for(const side of [-1,1]){
  const i=trailI(j)+side*(1.18+.12*Math.sin(n*2));
  placements.push([verge[(n+(side===1?3:0))%verge.length],i,j,.43+(n%3)*.06]);
 }
}
placements.push(
 ['dead_large',.9,20.9,.75],['dead_medium',4.5,12.1,.8],['dead_medium',.9,7,.7],
 ['vine_arch_large',2.45,24.9,1.15],['vine_arch_large',.93,15.25,1.15],
 ['root_bridge',2.5,STREAM,1.38],
 ['rocks_large',4.85,16.45,.62],['rocks_medium',.55,16.55,.65],['crystal',4.6,14.1,.6],
 ['bush_large',5.05,8.6,.65],['bush_flower_large',4.85,20.1,.65],
 ['pine_small',5.1,5.9,.75],['oak_small',5.2,3.5,.72],['bush_flower_small',5.15,1,.6],
 ['mushroom_red_medium',.8,5.9,.7],['glow_plant',1,8.2,.6],['crystal',.85,11.5,.55]
);
// Game mode extends the same world beyond the island. Belts are actual depth-sorted sprites.
if(gameMode)for(let j=-22;j<=48;j+=1.72)for(let i=-19;i<=23;i+=2.05){
 if(i>-.9&&i<6.2&&j>-.9&&j<26.4)continue;
 // Raised sanctuary needs a wider low understory apron: tall foreground crowns
 // otherwise hide the stairs and cyan braziers when the camera reaches the temple.
 if(j<7&&i>-.9&&i<10){
  if(i>6.2&&j>-.5)placements.push(['bush_flower_small',i,j,.5]);
  continue;
 }
 // Keep the extended trail open, and the river visible through its banks.
 if(Math.abs(i-trailI(j))<2.5||Math.abs(j-streamJ(i))<1.35)continue;
 const n=Math.round((i+20)*13+(j+22)*19);
 // Leave deterministic clearings, not equally spaced solid canopy walls.
 if(Math.abs(n*17+Math.round(j)*7)%11<2)continue;
 const species=['oak_large','pine_medium','oak_medium','pine_large','oak_small','gold_medium','dead_medium','blue_tree','wisteria_small','cherry_medium'];
 const id=species[Math.abs(n)%species.length];
 placements.push([id,i+.16*Math.sin(j*3+i),j+.18*Math.sin(i*4),.78+.12*Math.sin(n)]);
 if(n%3===0)placements.push(['plant_fern',i+.7,j+.3,.5]);
}
const decor=placements.map(([id,i,j,scale=1],index)=>{const meta=propsManifest.assets.find(p=>p.id===id);if(!meta)throw Error(`Missing prop ${id}`);return {id,i,j,scale,index,size:meta.size,anchor:anchorOverrides[id]??meta.anchor}});
// In-memory palette variants keep every source PNG untouched. Alternate cool oak crowns.
const coolProps=new Map();
for(const [id,im] of props){
 if(!id.startsWith('oak_')&&!id.startsWith('pine_'))continue;
 const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const cx=c.getContext('2d');cx.drawImage(im,0,0);
 const p=cx.getImageData(0,0,c.width,c.height);
 for(let n=0;n<p.data.length;n+=4){const r=p.data[n],g=p.data[n+1],b=p.data[n+2];if(g>r*.98&&g>b*1.35){p.data[n]=Math.round(r*.36);p.data[n+1]=Math.round(g*.64);p.data[n+2]=Math.min(255,Math.round(b*.86+22))}}
 cx.putImageData(p,0,0);coolProps.set(id,c);
}
const bounds=gameMode?{minX:-3300,maxX:2700,minY:-1250,maxY:2000}:sceneBounds(decor),CW=bounds.maxX-bounds.minX,CH=bounds.maxY-bounds.minY;
canvas.width=CW;canvas.height=CH;
const surfaceCache=new Map(),mod=(n,m)=>((n%m)+m)%m;
function sample(name,i,j){const x=mod(Math.floor((i+.5)*64),64),y=mod(Math.floor((j+.5)*64),64),t=textures.get(name),n=(y*64+x)*4;return [t[n],t[n+1],t[n+2]]}
function surfaceFor(mode){
 if(surfaceCache.has(mode))return surfaceCache.get(mode);
 const c=document.createElement('canvas');c.width=CW;c.height=CH;
 const cx=c.getContext('2d'),pixels=cx.createImageData(CW,CH),data=pixels.data;
 const testMaterial={grass_plain:'grass',dirt_rocks_01:'dirt',water_01:'water',stone_floor_01:'stone'}[mode];
 for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
  const {i,j}=unproject(x+bounds.minX+.5,y+bounds.minY+.5);
  if(!gameMode&&(i<-.5||j<-.5||i>=COLS-.5||j>=ROWS-.5))continue;
  let material=testMaterial??materialAt(i,j),rim=null;
  if(gameMode&&material==='stone'&&(i<-.5||i>5.5||j<-.5))material=Math.abs(i-trailI(j))<.72?'dirt':'grass';
  if(!testMaterial){
   const trail=Math.abs(i-trailI(j)),river=Math.abs(j-streamJ(i));
   if(material==='bridge')material='water'; // Actual transparent root bridge is a separately sorted sprite.
   if(material==='grass'&&river<1.02){material='dirt';if(river<.9)rim=[80,118,75]}
   if(material==='grass'&&trail<.79+.035*Math.sin(j*31))material='dirt';
   if(material==='dirt'&&trail>.65&&Math.sin(Math.floor(i*64)*12.7+Math.floor(j*64)*31.3)>.35)material='grass';
   if(material==='water'&&river>.76)rim=[43,179,163];
  }
  const rgb=rim??sample(material,i,j),p=(y*CW+x)*4;
  data[p]=rgb[0];data[p+1]=rgb[1];data[p+2]=rgb[2];data[p+3]=255;
 }
 cx.putImageData(pixels,0,0);surfaceCache.set(mode,c);return c;
}
function poly(points,color,stroke){ctx.beginPath();points.forEach((p,n)=>n?ctx.lineTo(Math.round(p.x),Math.round(p.y)):ctx.moveTo(Math.round(p.x),Math.round(p.y)));ctx.closePath();ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}}
function plane(i0,j0,i1,j1,z,color,stroke){poly([project(i0,j0,z),project(i1,j0,z),project(i1,j1,z),project(i0,j1,z)],color,stroke)}
// Original modular approximations, not reference crops. Palette follows the supplied moss stone.
const stoneCanvas=document.createElement('canvas');stoneCanvas.width=stoneCanvas.height=64;
const stoneContext=stoneCanvas.getContext('2d'),stonePixels=stoneContext.createImageData(64,64);stonePixels.data.set(textures.get('stone'));stoneContext.putImageData(stonePixels,0,0);
const stonePattern=ctx.createPattern(stoneCanvas,'repeat');
function stoneFace(points,z,shade=0){
 ctx.save();poly(points,'#899b82');ctx.clip();
 stonePattern.setTransform(new DOMMatrix([1,.375,-1,.375,0,-z]));
 ctx.fillStyle=stonePattern;const xs=points.map(p=>p.x),ys=points.map(p=>p.y);ctx.fillRect(Math.min(...xs)-1,Math.min(...ys)-1,Math.max(...xs)-Math.min(...xs)+2,Math.max(...ys)-Math.min(...ys)+2);
 if(shade){ctx.fillStyle=`rgba(12,37,39,${shade})`;ctx.fillRect(Math.min(...xs)-1,Math.min(...ys)-1,Math.max(...xs)-Math.min(...xs)+2,Math.max(...ys)-Math.min(...ys)+2)}
 ctx.restore();ctx.strokeStyle='#30483f';ctx.lineWidth=2;ctx.stroke();
}
function block(i0,j0,i1,j1,z,h,variant=0){
 const a=project(i0,j0,z+h),b=project(i1,j0,z+h),c=project(i1,j1,z+h),d=project(i0,j1,z+h);
 stoneFace([d,c,project(i1,j1,z),project(i0,j1,z)],z+h,.32);
 stoneFace([b,c,project(i1,j1,z),project(i1,j0,z)],z+h,.48);
 stoneFace([a,b,c,d],z+h);
 const q=project(i0+.05,j0+.05,z+h);ctx.fillStyle='#d3d9b5';ctx.fillRect(Math.round(q.x),Math.round(q.y),6,2);
 const m=project(i1-.08,j1-.08,z+h);ctx.fillStyle=variant%2?'#7d9d42':'#96b94c';ctx.fillRect(Math.round(m.x)-6,Math.round(m.y)-2,12,4);
 for(let n=0;n<3;n++){const p=project(i0+(i1-i0)*(n+.5)/4,j1-.03,z+h);ctx.fillStyle=n%2?'#63883c':'#b5cd67';ctx.fillRect(Math.round(p.x),Math.round(p.y)-1,5,3)}
}
function column(i,j,h=112,z=10){
 block(i-.25,j-.25,i+.25,j+.25,z,9);
 for(let k=0;k<Math.floor(h/17);k++)block(i-.16,j-.16,i+.16,j+.16,z+9+k*17,16,k);
 block(i-.23,j-.23,i+.23,j+.23,z+h,9,1);
 const p=project(i,j,z+h+10);ctx.fillStyle='#739838';ctx.fillRect(p.x-8,p.y-3,13,4);
}
function flame(i,j,z){
 block(i-.22,j-.22,i+.22,j+.22,z,15,2);
 block(i-.28,j-.28,i+.28,j+.28,z+15,7);
 const p=project(i,j,z+22),x=Math.round(p.x),y=Math.round(p.y);
 poly([{x:x-12,y},{x:x-8,y:y-14},{x:x-2,y:y-11},{x:x+2,y:y-32},{x:x+7,y:y-18},{x:x+12,y:y-12},{x:x+10,y}], '#13cfcf');
 poly([{x:x-6,y:y-2},{x:x-4,y:y-14},{x:x+2,y:y-22},{x:x+4,y:y-9},{x:x+8,y:y-3}], '#b1fff0');
 ctx.fillStyle='#35e6df';ctx.fillRect(x-13,y-24,3,3);ctx.fillRect(x+10,y-34,3,5);
}
function templeFloor(){
 // Lower plaza and elevated far terrace, slabs rather than repeated cliff skirts.
 block(.12,-.35,5.3,5.5,0,10);
 block(.12,-.35,5.3,1.55,10,48);
 for(let j=-.34;j<5.45;j+=.48)for(let i=.15;i<5.25;i+=.52){
  const z=j<1.55?58:10;
  stoneFace([project(i,j,z),project(Math.min(i+.5,5.3),j,z),project(Math.min(i+.5,5.3),j+.46,z),project(i,j+.46,z)],z);
 }
 // Back-to-front ascent; a rear tread must never paint over the next lower one.
 for(const [n,s] of STEPS.entries())block(1.3,s.j0,4.2,s.j1,10,s.top-10,n);
 const p=project(2.75,4.35,12);ctx.drawImage(images.get('stone_star_large'),p.x-112,p.y-42,224,84);
}
function cliff(){
 // Only exposed front perimeter faces. No internal cell extrusions.
 for(let j=-.5;j<ROWS-.5;j+=.5){
  const a=project(5.5,j),b=project(5.5,j+.5);
  stoneFace([a,b,{x:b.x,y:b.y+CLIFF},{x:a.x,y:a.y+CLIFF}],0,.62);
  ctx.beginPath();ctx.moveTo(a.x,a.y+27);ctx.lineTo(b.x,b.y+27);ctx.strokeStyle='#253e3c';ctx.lineWidth=2;ctx.stroke();
  const p=project(5.5,j+.25);ctx.fillStyle='#708746';ctx.fillRect(p.x-2,p.y+2,4,11);
  if(mod(Math.round(j*2),4)===0){ctx.fillStyle='#4c793c';ctx.fillRect(p.x-1,p.y+5,3,34);for(let k=0;k<5;k++){ctx.fillStyle=k%2?'#759947':'#557e38';ctx.fillRect(p.x+(k%2?1:-6),p.y+7+k*6,6,3)}}
 }
 for(let i=-.5;i<5.5;i+=.5){const a=project(i,25.5),b=project(i+.5,25.5);stoneFace([a,b,{x:b.x,y:b.y+CLIFF},{x:a.x,y:a.y+CLIFF}],0,.5);ctx.beginPath();ctx.moveTo(a.x,a.y+27);ctx.lineTo(b.x,b.y+27);ctx.strokeStyle='#30483f';ctx.stroke()}
}
function waterfall(){
 const a=project(5.5,STREAM-.8),b=project(5.5,STREAM+.8);
 poly([a,b,{x:b.x,y:b.y+CLIFF+5},{x:a.x,y:a.y+CLIFF+5}],'#088c91');
 for(let k=0;k<18;k++){const t=k/18,x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t);ctx.fillStyle=k%3?'#2bd2c7':'#a1fff0';ctx.fillRect(x,y,2,k%4?37:52)}
}
const architecture=[
 {id:'ruined-gateway',i:.65,j:3.75,draw(){column(.65,2.8,124);column(.65,4.65,112);block(.4,2.55,.9,4.9,126,17,2);block(.35,3,.95,3.8,144,8)}},
 {id:'broken-column',i:1,j:5.5,draw(){column(1,5.5,74)}},
 {id:'front-column',i:4.85,j:5.15,draw(){column(4.85,5.15,90)}},
 {id:'parapet-back',i:.55,j:1.1,draw(){for(let j=2.7;j>-.2;j-=.43)block(.2,j-.4,.63,j,j<1.5?58:10,25)}},
 {id:'parapet-front',i:4.9,j:1.1,draw(){for(let j=2.7;j>-.2;j-=.43)block(4.7,j-.4,5.18,j,j<1.5?58:10,25)}},
 ...[[.55,1.2,58],[4.9,1.2,58],[.55,-.05,58],[4.9,-.05,58],[4.9,3.1,10]].map(([i,j,z],n)=>({id:`cyan-brazier-${n}`,i,j,draw(){flame(i,j,z)}}))
];
// World ground-depth, not image-top or elevated y. A bridge sorts before foreground trees.
const layers=[...decor.map(d=>({...d,draw(){const r=spriteRect(d);ctx.drawImage(d.index%3&&coolProps.has(d.id)?coolProps.get(d.id):props.get(d.id),r.x,r.y,r.width,r.height)}})),...architecture].sort((a,b)=>project(a.i,a.j).y-project(b.i,b.j).y||a.i-b.i);
function diamond(i,j){const p=project(i,j);ctx.beginPath();ctx.moveTo(p.x,p.y-H/2);ctx.lineTo(p.x+W/2,p.y);ctx.lineTo(p.x,p.y+H/2);ctx.lineTo(p.x-W/2,p.y);ctx.closePath()}
function fit(){
 const availableW=Math.max(100,stage.clientWidth-24),availableH=Math.max(100,stage.clientHeight-24);
 displayScale=zoom==='fit'?Math.min(availableW/CW,availableH/CH,2):Number(zoom);
 canvas.style.width=`${CW*displayScale}px`;canvas.style.height=`${CH*displayScale}px`;
 stage.classList.toggle('zoomed',zoom!=='fit');
 document.querySelector('#view-status').textContent=zoom==='fit'?`พอดีจอ ${Math.round(displayScale*100)}%`:`${zoom}× · เลื่อน / ลากเพื่อดู`;
 if(window.tilePreview)window.tilePreview.scale=displayScale;
}
function drawScene(){
 ctx.resetTransform();ctx.clearRect(0,0,CW,CH);ctx.imageSmoothingEnabled=false;ctx.translate(-bounds.minX,-bounds.minY);
 if(!gameMode)cliff();ctx.drawImage(surfaceFor(mode),bounds.minX,bounds.minY);
 if(mode==='scene'){
  if(!gameMode)waterfall();if(showDecor){templeFloor();for(const d of layers)d.draw()}
 }
}
function draw(){
 drawScene();
 if(grid||selected)for(let i=0;i<COLS;i++)for(let j=0;j<ROWS;j++){
  const chosen=selected?.i===i&&selected?.j===j;if(!grid&&!chosen)continue;
  diamond(i,j);ctx.strokeStyle=chosen?'#fff0a4':'#143e3b77';ctx.lineWidth=chosen?3:1;ctx.stroke();
 }
 fit();
 info.textContent=selected?`ช่อง (${selected.i}, ${selected.j}) · ${mode==='scene'?materialAt(selected.i,selected.j):mode}`:`พื้นเดิม ${images.size} · สไปรต์เดิม ${props.size} · วาง ${decor.length} ชิ้น · แถบป่า ${COLS}×${ROWS}`;
 window.tilePreview={ready:true,loaded:images.size,props:props.size,derived:textures.size,placements:decor.length,architecture:architecture.map(({id,i,j})=>({id,i,j})),grid,showDecor,scale:displayScale,zoom,mode,selected,errors,bounds,canvas:{width:CW,height:CH},decor:decor.map(d=>({...d,rect:spriteRect(d)})),depths:layers.map(d=>project(d.i,d.j).y),layers:layers.map(({id,i,j})=>({id,i,j})),dimensions:{cols:COLS,rows:ROWS},reused:[...new Set(decor.map(d=>d.id))]};
}
if(gameMode){
 drawScene();
 const {startGameScreen}=await import('./game-screen.js');
 startGameScreen({world:canvas,bounds,decor,layers,errors,props:props.size});
}else{
document.querySelector('#mode').onchange=e=>{mode=e.target.value;selected=null;draw()};
document.querySelector('#grid').onclick=e=>{grid=!grid;e.currentTarget.setAttribute('aria-pressed',String(grid));draw()};
document.querySelector('#decor').onclick=e=>{showDecor=!showDecor;e.currentTarget.setAttribute('aria-pressed',String(showDecor));draw()};
document.querySelector('#scale').onchange=e=>{zoom=e.target.value;draw();stage.scrollTo({left:(stage.scrollWidth-stage.clientWidth)/2,top:0})};
let drag=null,moved=false;
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop};moved=false;if(zoom!=='fit')canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!drag||zoom==='fit')return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;stage.scrollLeft=drag.left-dx;stage.scrollTop=drag.top-dy});
canvas.addEventListener('pointerup',()=>{drag=null});canvas.addEventListener('pointercancel',()=>{drag=null});
canvas.onclick=e=>{if(moved)return;const r=canvas.getBoundingClientRect();selected=pickTile({x:(e.clientX-r.left)*CW/r.width+bounds.minX,y:(e.clientY-r.top)*CH/r.height+bounds.minY});draw()};
new ResizeObserver(fit).observe(stage);draw();
}

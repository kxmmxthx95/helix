// Run in the standalone game screen; throws on a failed real Canvas/DOM check.
import {project,trailI,STREAM} from '../../src/prototypes/pixel-tiles/layout.mjs';
export async function verifyGameScreen(){
 const checks=[],check=(pass,name)=>{checks.push({name,pass:!!pass});if(!pass)throw Error(name)};
 const wait=async()=>{await new Promise(r=>setTimeout(r,650));while(!gameScreen.settled)await new Promise(r=>requestAnimationFrame(r))};
 const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
 const key=k=>document.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true}));
 const initial=gameScreen;
 check(initial.props===54,'all 54 source props loaded');
 check(initial.depths.every((v,i,a)=>!i||v>=a[i-1]),'shared sprite / architecture contact-depth ordering');
 check(!initial.cliffs&&!initial.orbit&&initial.projection==='fixed-oblique','fixed perspective; no island skirts or orbit');
 for(let n=0;n<5;n++){
  document.querySelectorAll('#numbers button')[n].click();await wait();const s=gameScreen;
  check(s.index===n&&s.settled,`stage ${n+1}: button reaches settled target`);
  const a=ctx.getImageData(0,0,canvas.width,canvas.height).data;let gaps=0;for(let k=3;k<a.length;k+=4)if(a[k]!==255)gaps++;
  check(gaps===0,`stage ${n+1}: every viewport pixel opaque (no blank wedges)`);
  const p=s.source;check(p.x>=0&&p.y>=0&&p.x+p.width<=s.bounds.maxX-s.bounds.minX&&p.y+p.height<=s.bounds.maxY-s.bounds.minY,`stage ${n+1}: camera crop wholly within extended terrain`);
  const marker=project(trailI(s.stages[n].j),s.stages[n].j),x=(marker.x-s.camera.x+canvas.width/2)*s.scale,y=(marker.y-s.camera.y+canvas.height/2)*s.scale;
  check(x>30&&x<innerWidth-30&&y>110&&y<innerHeight-110,`stage ${n+1}: route marker outside HUD safe areas`);
 }
 check(document.querySelector('#next').disabled,'last-stage next disabled');key('ArrowRight');await wait();check(gameScreen.index===4,'right arrow clamps at final stage');
 key('Home');await wait();check(gameScreen.index===0&&document.querySelector('#prev').disabled,'Home + first-stage boundary');key('ArrowLeft');await wait();check(gameScreen.index===0,'left arrow clamps at entrance');
 key('3');await wait();check(gameScreen.index===2,'number keyboard selection');key('ArrowRight');await wait();check(gameScreen.index===3,'right keyboard navigation');key('ArrowLeft');await wait();check(gameScreen.index===2,'left keyboard navigation');key('End');await wait();check(gameScreen.index===4,'End selects temple');
 document.querySelector('#prev').click();await wait();check(gameScreen.index===3,'previous button');document.querySelector('#next').click();await wait();check(gameScreen.index===4,'next button');
 const before=JSON.stringify(gameScreen.camera);canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:100,clientY:100,bubbles:true}));canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:250,clientY:250,bubbles:true}));canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:500,bubbles:true}));await wait();check(before===JSON.stringify(gameScreen.camera),'drag and wheel do not orbit, pan or zoom');
 // Sanctuary extreme points include raised terrace and braziers, not just ground footprint.
 check([[-350,-150],[375,-150],[-350,235],[375,235]].every(([x,y])=>{const sx=(x-gameScreen.camera.x+canvas.width/2)*gameScreen.scale,sy=(y-gameScreen.camera.y+canvas.height/2)*gameScreen.scale;return sx>0&&sx<innerWidth&&sy>100&&sy<innerHeight-110}),'complete elevated sanctuary fits between HUD safe areas');
 const rects=['header','#sample','nav'].map(sel=>document.querySelector(sel).getBoundingClientRect());
 check(rects.every(r=>r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight),'HUD stays inside viewport');
 check(rects[0].right<=rects[1].left||rects[0].bottom<=rects[1].top,'title and sample disclosure do not overlap');
 const samples=new Map(),probe=document.createElement('canvas'),px=probe.getContext('2d');let blocked=0;
 for(const d of gameScreen.decor){
  if(['root_bridge','vine_arch_large'].includes(d.id))continue;
  if(!samples.has(d.id)){const im=new Image();im.src='/tiles/twilight/props/'+d.id+'.png';await im.decode();probe.width=im.width;probe.height=im.height;px.drawImage(im,0,0);samples.set(d.id,{width:im.width,height:im.height,data:px.getImageData(0,0,im.width,im.height).data})}
  const im=samples.get(d.id);
  for(let j=5.9;j<24;j+=.1){if(Math.abs(j-STREAM)<1)continue;const p=project(trailI(j),j),x=Math.floor((p.x-d.rect.x)/d.scale),y=Math.floor((p.y-d.rect.y)/d.scale);if(x>=0&&y>=0&&x<im.width&&y<im.height&&im.data[(y*im.width+x)*4+3]>180)blocked++}
 }
 check(blocked===0,`extended canopy leaves walking-lane centre clear (${blocked} opaque overlaps)`);
 check(gameScreen.errors.length===0,'no captured errors or unhandled rejections');
 return {viewport:{width:innerWidth,height:innerHeight},count:checks.length,checks,state:{stage:gameScreen.stage,scale:gameScreen.scale,placements:gameScreen.placements,errors:gameScreen.errors}};
}

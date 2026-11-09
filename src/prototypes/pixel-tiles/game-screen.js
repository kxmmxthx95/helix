import {project,trailI,STREAM,spriteRect} from './layout.mjs';

export const STAGES=[
 {id:'entrance',title:'ซุ้มทางเข้า',j:24.5},
 {id:'grove',title:'ทางเดินในป่า',j:20},
 {id:'bridge',title:'สะพานรากไม้',j:STREAM},
 {id:'ruins',title:'ทางสู่วิหาร',j:8},
 {id:'temple',title:'ลานวิหาร',j:2.65}
];
export const clampStage=n=>Math.max(0,Math.min(STAGES.length-1,Math.trunc(n)));

export function startGameScreen({world,bounds,decor,layers,errors,props}){
 const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),prev=document.querySelector('#prev'),next=document.querySelector('#next');
 const diagnostics={decor:decor.map(d=>({...d,rect:spriteRect(d)})),depths:layers.map(d=>project(d.i,d.j).y)};
 let index=0,camera=null,scale=1,animation=0,settled=true;
 const buttons=STAGES.map((s,n)=>{const b=document.createElement('button');b.textContent=n+1;b.setAttribute('aria-label',`จุดตัวอย่าง ${n+1} ${s.title}`);b.onclick=()=>go(n);document.querySelector('#numbers').append(b);return b});
 const target=()=>{const s=STAGES[index],p=project(trailI(s.j),s.j);return {x:p.x,y:p.y-(s.id==='temple'?65:45)}};
 function render(){
  const sx=Math.round(camera.x-canvas.width/2-bounds.minX),sy=Math.round(camera.y-canvas.height/2-bounds.minY);
  ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(world,sx,sy,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
  // A sample marker, not an avatar or lesson state. Draw at world ground level on the lane.
  const s=STAGES[index],p=project(trailI(s.j),s.j,s.id==='temple'?10:0),x=Math.round(p.x-camera.x+canvas.width/2),y=Math.round(p.y-camera.y+canvas.height/2);
  ctx.fillStyle='#142e2a';ctx.fillRect(x-10,y-5,20,10);ctx.fillStyle='#f8e8ad';ctx.fillRect(x-7,y-3,14,6);ctx.fillStyle='#fffbe2';ctx.fillRect(x-2,y-6,4,12);
  window.gameScreen={ready:true,index,stage:s.id,stages:STAGES,settled,scale,camera:{...camera},source:{x:sx,y:sy,width:canvas.width,height:canvas.height},bounds,errors,props,placements:decor.length,...diagnostics,projection:'fixed-oblique',orbit:false,cliffs:false,go,render};
 }
 function resize(){
  cancelAnimationFrame(animation);scale=innerWidth<700?.5:1;
  canvas.width=Math.ceil(innerWidth/scale);canvas.height=Math.ceil(innerHeight/scale);
  camera=target();settled=true;render();
 }
 function go(n){
  index=clampStage(n);cancelAnimationFrame(animation);const end=target(),start=camera??end,t0=performance.now();
  prev.disabled=index===0;next.disabled=index===STAGES.length-1;
  buttons.forEach((b,k)=>b.setAttribute('aria-current',String(k===index)));
  const text=`${index+1} / ${STAGES.length} · ${STAGES[index].title}`;
  document.querySelector('#stage-title').textContent=text;document.querySelector('#live').textContent=`จุดตัวอย่าง ${text}`;
  settled=reduced.matches;
  if(settled){camera=end;render();return}
  function frame(t){const u=Math.min(1,(t-t0)/520),ease=u*u*(3-2*u);camera={x:start.x+(end.x-start.x)*ease,y:start.y+(end.y-start.y)*ease};settled=u===1;render();if(!settled)animation=requestAnimationFrame(frame)}
  animation=requestAnimationFrame(frame);
 }
 prev.onclick=()=>go(index-1);next.onclick=()=>go(index+1);
 document.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest?.('input,textarea,select,[contenteditable]'))return;
  let n=null;if(e.key==='ArrowLeft')n=index-1;else if(e.key==='ArrowRight')n=index+1;else if(e.key==='Home')n=0;else if(e.key==='End')n=STAGES.length-1;else if(/^[1-5]$/.test(e.key))n=Number(e.key)-1;
  if(n!==null){e.preventDefault();go(n)}
 });
 document.querySelector('#fullscreen').onclick=async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{document.querySelector('#live').textContent='เบราว์เซอร์ไม่อนุญาตเต็มหน้าจอ'}
 };
 new ResizeObserver(resize).observe(document.querySelector('main'));
 reduced.addEventListener('change',()=>go(index));
 document.querySelector('#loading').hidden=true;resize();go(0);
}

// Archived pre-polish renderer, for reproducible before screenshots only.
const canvas=document.querySelector('#map'),ctx=canvas.getContext('2d');
const manifest=await(await fetch('/tiles/twilight/manifest.json')).json();
const images=new Map(); const errors=[];
await Promise.all(manifest.tiles.map(async t=>{const im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(Error(t.id));im.src='/tiles/twilight/'+t.file;});images.set(t.id,im)}));
const propsManifest=await(await fetch('/tiles/twilight/props/manifest.json')).json();
const props=new Map();await Promise.all(propsManifest.assets.map(async t=>{const im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject;im.src='/tiles/twilight/props/'+t.file});props.set(t.id,im)}));
const decor=[];
for(let i=0;i<12;i++)for(let j=0;j<12;j++){
 if(j===5||j===6||i>=8&&j<=3||i<=3&&j>=7)continue;
 const h=(i*31+j*19)%17;
 if(j===0||j===10||j===11||i===0||i===11)decor.push({i,j,id:['oak_large','pine_large','oak_medium','pine_medium'][h%4],s:.8});
 else if(h<4)decor.push({i,j,id:['bush_flower_large','rocks_medium','crystal','plant_pink'][h],s:.7});
}
decor.push({i:4,j:5,id:'vine_arch_large',s:1.05});
const N=12,W=128,H=64,OX=800,OY=210;let grid=false,scale=1,mode='scene',selected=null;
function tile(i,j){
 if(mode!=='scene')return mode;
 const hash=(i*37+j*17)%23;
 if(i>=8&&j<=3)return i===10&&j===1?'stone_star_large':hash%3?'stone_floor_moss':'stone_floor_cracked';
 if(i<=3&&j>=7)return hash%2?'water_01':'water_02';
 if(j===5||j===6)return hash%2?'dirt_rocks_01':'dirt_rocks_02';
 if(j===4||j===7)return 'grass_plain';
 return hash<3?'grass_white_flowers':hash<6?'grass_pink_flowers':'grass_plain';
}
function draw(){
 canvas.width=1600;canvas.height=1050;const fit=Math.min(1,(innerWidth-24)/1600,(innerHeight-150)/1050);canvas.style.width=1600*scale*fit+'px';canvas.style.height=1050*scale*fit+'px';ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);
 for(let sum=0;sum<=2*(N-1);sum++)for(let i=0;i<N;i++){const j=sum-i;if(j<0||j>=N)continue;const x=OX+(i-j)*W/2,y=OY+(i+j)*H/2;ctx.drawImage(images.get(tile(i,j)),x-W/2,y);
 if(grid||selected?.i===i&&selected?.j===j){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+64,y+32);ctx.lineTo(x,y+64);ctx.lineTo(x-64,y+32);ctx.closePath();ctx.strokeStyle=selected?.i===i&&selected?.j===j?'#ffe58f':'#ffffff66';ctx.lineWidth=selected?.i===i&&selected?.j===j?2:1;ctx.stroke();}}
 if(mode==='scene')for(const d of [...decor].sort((a,b)=>a.i+a.j-b.i-b.j)){const im=props.get(d.id);const x=OX+(d.i-d.j)*W/2,y=OY+(d.i+d.j)*H/2+32;ctx.drawImage(im,x-im.width*d.s/2,y-im.height*d.s,im.width*d.s,im.height*d.s);}
 window.tilePreview={ready:true,loaded:images.size,props:props.size,placements:decor.length,grid,scale,mode,selected,errors};
}
document.querySelector('#info').textContent=`พื้น ${images.size} ชิ้น + ของตกแต่ง ${props.size} ชิ้น · กริด 128×64 px · แผ่นพื้น 12×12 ช่อง`;
document.querySelector('#mode').onchange=e=>{mode=e.target.value;draw()};
document.querySelector('#grid').onclick=e=>{grid=!grid;e.currentTarget.setAttribute('aria-pressed',String(grid));draw()};
document.querySelector('#scale').onchange=e=>{scale=+e.target.value;draw()};
canvas.onclick=e=>{const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*canvas.width/r.width-OX,y=(e.clientY-r.top)*canvas.height/r.height-OY-32;const i=Math.floor((x/64+y/32)/2+.5),j=Math.floor((y/32-x/64)/2+.5);if(i>=0&&i<N&&j>=0&&j<N){selected={i,j,id:tile(i,j)};document.querySelector('#info').textContent=`ช่อง (${i}, ${j}) · ${selected.id}`;draw()}};
draw();addEventListener('resize',draw);

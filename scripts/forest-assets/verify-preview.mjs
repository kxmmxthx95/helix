// Browser-only QA for the long layered diorama.
import {COLS,ROWS,STREAM,project,trailI,unproject,materialAt} from '../../src/prototypes/pixel-tiles/layout.mjs';
export async function verifyPreview(){
 const checks=[],assert=(ok,name)=>{checks.push({name,pass:!!ok});if(!ok)throw Error(name)};
 const c=document.querySelector('#map'),cx=c.getContext('2d'),select=(id,value)=>{const el=document.querySelector(id);el.value=value;el.dispatchEvent(new Event('change'))};
 select('#mode','scene');select('#scale','fit');
 if(window.tilePreview.grid)document.querySelector('#grid').click();if(!window.tilePreview.showDecor)document.querySelector('#decor').click();
 let s=window.tilePreview;
 assert(s.ready&&s.loaded===22&&s.props===54&&s.derived===4,'22 terrain + all 54 originals + 4 derived textures loaded');
 assert(ROWS/COLS>=3&&project(2.5,25).x<project(2.5,0).x&&project(2.5,25).y>project(2.5,0).y,'long strip: lower-left entrance to upper-right sanctuary');
 assert(s.depths.every((v,i,a)=>!i||v>=a[i-1]),'mixed sprite/architecture queue sorts by world contact depth');
 assert(s.decor.every(d=>d.rect.x>=s.bounds.minX&&d.rect.y>=s.bounds.minY&&d.rect.x+d.rect.width<=s.bounds.maxX&&d.rect.y+d.rect.height<=s.bounds.maxY),'all sprite rectangles inside canvas');
 assert(s.decor.every(d=>d.i>=-.5&&d.i<COLS-.5&&d.j>=-.5&&d.j<ROWS-.5),'all prop ground contacts inside island footprint');
 assert(['root_bridge','vine_arch_large','dead_large','crystal'].every(id=>s.reused.includes(id))&&s.architecture.some(d=>d.id==='ruined-gateway'),'bridge, arches, crooked tree, crystals and editable ruins assembled');
 let bridgePixels=0;
 const bridge=s.decor.find(d=>d.id==='root_bridge'),bridgeImage=new Image();bridgeImage.src='/tiles/twilight/props/root_bridge.png';await bridgeImage.decode();
 const bc=document.createElement('canvas');bc.width=bridgeImage.width;bc.height=bridgeImage.height;const bx=bc.getContext('2d');bx.drawImage(bridgeImage,0,0);const ba=bx.getImageData(0,0,bc.width,bc.height).data;
 for(let j=STREAM-.9;j<=STREAM+.9;j+=.1){const p=project(trailI(j),j),x=Math.floor((p.x-bridge.rect.x)/bridge.scale),y=Math.floor((p.y-bridge.rect.y)/bridge.scale);if(ba[(y*bc.width+x)*4+3]<240)bridgePixels++}
 assert(bridgePixels===0,'real root bridge pixels cover centre from bank to bank (19 samples)');
 const rgba=cx.getImageData(0,0,c.width,c.height).data;let clipped=0;
 for(let x=0;x<c.width;x++)clipped+=rgba[x*4+3]+rgba[((c.height-1)*c.width+x)*4+3];
 for(let y=0;y<c.height;y++)clipped+=rgba[(y*c.width)*4+3]+rgba[(y*c.width+c.width-1)*4+3];
 assert(clipped===0,'architecture, flames, cliff and sprites leave transparent canvas perimeter');
 let blocked=0;
 // Alpha-test each sprite independently so intentional arches/bridge and shadow-tinted terrain do not mask collisions.
 const probe=document.createElement('canvas'),px=probe.getContext('2d');
 for(const d of s.decor){
  if(['root_bridge','vine_arch_large'].includes(d.id))continue;
  const im=new Image();im.src='/tiles/twilight/props/'+d.id+'.png';await im.decode();probe.width=im.width;probe.height=im.height;px.drawImage(im,0,0);const data=px.getImageData(0,0,im.width,im.height).data;
  for(let j=5.9;j<24;j+=.1){if(Math.abs(j-STREAM)<1)continue;const p=project(trailI(j),j),x=Math.floor((p.x-d.rect.x)/d.scale),y=Math.floor((p.y-d.rect.y)/d.scale);if(x>=0&&y>=0&&x<im.width&&y<im.height&&data[(y*im.width+x)*4+3]>180)blocked++}
 }
 assert(blocked===0,`walking-lane centre free of opaque non-crossing props (${blocked})`);
 for(let j=0;j<25.5;j+=.05)assert(['dirt','bridge','stone'].includes(materialAt(trailI(j),j)),`route sample ${j.toFixed(2)}`);
 // Collapse dense continuity assertions into one readable evidence record.
 const route=checks.filter(v=>v.name.startsWith('route sample '));checks.splice(checks.findIndex(v=>v.name.startsWith('route sample ')),route.length,{name:`continuous walkable route (${route.length} samples)`,pass:true});
 for(const mode of ['grass_plain','dirt_rocks_01','stone_floor_01','water_01']){
  select('#mode',mode);s=window.tilePreview;const data=cx.getImageData(0,0,c.width,c.height).data;let gaps=0;
  for(let y=0;y<c.height;y+=3)for(let x=0;x<c.width;x+=3){const p=unproject(x+s.bounds.minX,y+s.bounds.minY);if(p.i>-.48&&p.i<COLS-.52&&p.j>-.48&&p.j<ROWS-.52&&data[(y*c.width+x)*4+3]!==255)gaps++}
  assert(gaps===0,`${mode}: no internal transparent seams`);
 }
 select('#mode','scene');document.querySelector('#grid').click();assert(window.tilePreview.grid,'grid toggles on');document.querySelector('#grid').click();
 document.querySelector('#decor').click();assert(!window.tilePreview.showDecor,'decor and modular temple can be hidden independently of terrain');document.querySelector('#decor').click();
 for(const z of ['1','2']){select('#scale',z);assert(window.tilePreview.scale===Number(z),`${z}× is native integer scale`)}
 select('#scale','fit');s=window.tilePreview;
 const r=c.getBoundingClientRect(),stage=document.querySelector('main').getBoundingClientRect();
 assert(r.width<=stage.width&&r.height<=stage.height,'fit entirely inside scene viewport');
 const p=project(2,10),clientX=r.left+(p.x-s.bounds.minX)/c.width*r.width,clientY=r.top+(p.y-s.bounds.minY)/c.height*r.height;
 c.dispatchEvent(new PointerEvent('pointerdown',{clientX,clientY,bubbles:true}));c.dispatchEvent(new PointerEvent('pointerup',{clientX,clientY,bubbles:true}));c.dispatchEvent(new MouseEvent('click',{clientX,clientY,bubbles:true}));
 assert(window.tilePreview.selected?.i===2&&window.tilePreview.selected?.j===10,'tile picking survives fit and non-square bounds');
 c.dispatchEvent(new MouseEvent('click',{clientX:r.left+1,clientY:r.top+1,bubbles:true}));
 assert(window.tilePreview.errors.length===0,'no browser errors or rejected promises');
 return {checks,count:checks.length,state:{...window.tilePreview,decor:undefined,depths:undefined,layers:undefined}};
}

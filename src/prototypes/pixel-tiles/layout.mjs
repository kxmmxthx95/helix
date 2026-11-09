// Editable world coordinates: entrance at high j, sanctuary at low j.
export const COLS=6, ROWS=26, W=128, H=48, CLIFF=54, STREAM=15.2;
export const STEPS=Array.from({length:8},(_,k)=>({j0:1.55+k*.21,j1:1.55+(k+1)*.21,top:58-k*6}));
export const trailI=j=>2.5+.25*Math.sin(j*.52);
export const streamJ=i=>STREAM+.23*Math.sin(i*1.7);
export function materialAt(i,j){
 if(j<5.6)return 'stone';
 if(Math.abs(j-streamJ(i))<.83)return Math.abs(i-trailI(j))<.72?'bridge':'water';
 if(Math.abs(i-trailI(j))<.72)return 'dirt';
 return 'grass';
}
export const project=(i,j,z=0)=>({x:(i-j)*W/2,y:(i+j)*H/2-z});
export const unproject=(x,y)=>({i:(x/(W/2)+y/(H/2))/2,j:(y/(H/2)-x/(W/2))/2});
export function pickTile({x,y}){
 const p=unproject(x,y),i=Math.floor(p.i+.5),j=Math.floor(p.j+.5);
 return i>=0&&i<COLS&&j>=0&&j<ROWS?{i,j}:null;
}
export function spriteRect(d){
 const p=project(d.i,d.j,d.z??0),s=d.scale??1;
 return {x:Math.round(p.x-d.anchor[0]*s),y:Math.round(p.y-d.anchor[1]*s),width:Math.round(d.size[0]*s),height:Math.round(d.size[1]*s),footY:p.y};
}
export function sceneBounds(decor){
 const corners=[project(-.5,-.5),project(-.5,ROWS-.5),project(COLS-.5,-.5),project(COLS-.5,ROWS-.5)];
 const b={minX:Math.min(...corners.map(p=>p.x)),maxX:Math.max(...corners.map(p=>p.x)),minY:-210,maxY:Math.max(...corners.map(p=>p.y))+CLIFF};
 for(const d of decor){const r=spriteRect(d);b.minX=Math.min(b.minX,r.x);b.minY=Math.min(b.minY,r.y);b.maxX=Math.max(b.maxX,r.x+r.width);b.maxY=Math.max(b.maxY,r.y+r.height)}
 return {minX:Math.floor(b.minX)-24,minY:Math.floor(b.minY)-24,maxX:Math.ceil(b.maxX)+24,maxY:Math.ceil(b.maxY)+24};
}

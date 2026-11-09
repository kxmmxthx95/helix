import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './layout.mjs';
test('strip has at least 3:1 logical aspect and rises toward upper right',()=>{
 assert.ok(L.ROWS/L.COLS>=3);
 const entrance=L.project(2.5,L.ROWS-1),temple=L.project(2.5,0);
 assert.ok(entrance.x<temple.x&&entrance.y>temple.y);
});
test('isometric coordinates round-trip including outer borders',()=>{
 for(const [i,j] of [[0,0],[-.5,L.ROWS-.5],[L.COLS-.5,-.5],[3.2,7.7]]){
 const p=L.project(i,j),q=L.unproject(p.x,p.y);
 assert.ok(Math.abs(q.i-i)<1e-9&&Math.abs(q.j-j)<1e-9);
 }
});
test('walkable centre runs continuously from entrance over bridge to temple stairs',()=>{
 for(let j=0;j<L.ROWS-.5;j+=.05){
  const i=L.trailI(j);
  assert.ok(i>1&&i<L.COLS-1);
  assert.ok(['dirt','bridge','stone'].includes(L.materialAt(i,j)),`blocked ${i},${j}`);
 }
 assert.equal(L.materialAt(L.trailI(L.STREAM),L.STREAM),'bridge');
 assert.equal(L.materialAt(.5,L.STREAM),'water');
});
test('temple treads meet without holes and rise in six-pixel increments',()=>{
 assert.equal(L.STEPS?.length,8);
 const steps=L.STEPS;
 assert.ok(Math.abs(steps[0].j0-1.55)<1e-9);
 assert.equal(steps[0].top,58);
 for(let n=1;n<steps.length;n++){
  assert.ok(Math.abs(steps[n-1].j1-steps[n].j0)<1e-9);
  assert.equal(steps[n-1].top-steps[n].top,6);
 }
 assert.equal(steps.at(-1).top,16);
});
test('anchor-aware bounds include every sprite, elevation and terrain corners',()=>{
 const decor=[{i:0,j:0,anchor:[140,250],size:[287,266],scale:1,z:100},{i:5,j:25,anchor:[80,220],size:[160,228],scale:1}];
 const b=L.sceneBounds(decor);
 for(const d of decor){const r=L.spriteRect(d);assert.ok(r.x>=b.minX&&r.y>=b.minY&&r.x+r.width<=b.maxX&&r.y+r.height<=b.maxY)}
 for(const i of [-.5,L.COLS-.5])for(const j of [-.5,L.ROWS-.5]){const p=L.project(i,j);assert.ok(p.x>=b.minX&&p.x<=b.maxX&&p.y>=b.minY&&p.y+L.CLIFF<=b.maxY)}
 assert.equal(L.pickTile(L.project(-.51,0)),null);
 assert.deepEqual(L.pickTile(L.project(5.49,25.49)),{i:5,j:25});
});

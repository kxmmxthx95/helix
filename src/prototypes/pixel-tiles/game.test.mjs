import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {clampStage,STAGES} from './game-screen.js';
test('standalone game screen uses shared renderer and explicit sample disclosure',async()=>{
 const html=await readFile(new URL('../../../pixel-game-screen.html',import.meta.url),'utf8');
 assert.match(html,/ตัวอย่าง.*ไม่ใช่บทเรียนจริง/s);
 assert.match(html,/preview\.js/);
 assert.match(html,/id="game"/);
});
test('five sample stages follow the existing path and clamp at both boundaries',()=>{
 assert.deepEqual(STAGES.map(s=>s.id),['entrance','grove','bridge','ruins','temple']);
 assert.ok(STAGES.every((s,n,a)=>!n||s.j<a[n-1].j));
 assert.equal(clampStage(-5),0);assert.equal(clampStage(900),4);assert.equal(clampStage(2),2);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseScene,frameAt,propMatrix} from '../src/authored-scene/scene';
test('editor fixture includes every scene category and validates before renderer loading',()=>{
 const scene=JSON.parse(readFileSync(new URL('../fixtures/authored-scene.json',import.meta.url),'utf8'));
 assert.deepEqual(parseScene({scene}),scene);
 for(const c of ['Buildings','Props','Ground','Spawns','Cliffs','Water'])assert.ok(scene.instances.some((o:any)=>o.category===c));
 const gate=scene.instances.find((o:any)=>o.asset==='gate-sheet.png');assert.equal(frameAt(.125,gate.definition.parts[0].animation),3);
 assert.deepEqual(propMatrix({width:180,foot:.97,vertical:1,shear:0,x:5,y:7},360),{a:.5,b:0,c:0,d:.5,tx:5,ty:7});
});

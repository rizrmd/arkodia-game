import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DOMAdapter } from 'pixi.js';
import { createEnvironmentRuntime } from '../src/authored-scene/environment-runtime';
import { reliefShadowTriangles, PX_PER_METER } from '../src/authored-scene/relief';
import { mapToCourt } from '../src/authored-scene/environment-map';
import { FRONTIER_PROPS, FRONTIER_TERRAIN_FEATURES } from '../src/authored-scene/frontier';
const adapter=DOMAdapter.get();
before(()=>DOMAdapter.set({...adapter,createCanvas:()=>({getContext:()=>null}) as unknown as HTMLCanvasElement}));
after(()=>DOMAdapter.set(adapter));
const podium=FRONTIER_TERRAIN_FEATURES.find(f=>f.id==='temple-podium')!;
const props=FRONTIER_PROPS.filter(p=>p.zone==='Temple');
test('native scenery lift is applied once while authored objects retain physical platform height',()=>{
 const env=createEnvironmentRuntime({frontierProps:props,reliefFeatures:FRONTIER_TERRAIN_FEATURES});
 for(const prop of props.filter(p=>p.layer!=='ground'||p.asset==='temple-podium'))
  assert.equal(env.frontier.sprites.get(prop.id)!.y,prop.y-prop.lift,prop.asset);
 const center=mapToCourt((podium.u0+podium.u1)/2,(podium.v0+podium.v1)/2);
 assert.ok(env.liftAt(center.x,center.y)>25);
});
test('physical scenery mesh has an elevated receiver and ground-connected casting sides',()=>{
 const heights=Array.from(reliefShadowTriangles(podium,FRONTIER_TERRAIN_FEATURES)).filter((_,i)=>i%3===2);
 assert.equal(Math.min(...heights),0);
 assert.ok(Math.abs(Math.max(...heights)-podium.heightM!*PX_PER_METER)<0.001);
});

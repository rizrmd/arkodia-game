import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBuildingBundle} from '../src/building-catalog';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/building-catalog.json',import.meta.url),'utf8'));
test('editor export loads layers, color and pillar coordinates',()=>{const b=parseBuildingBundle({buildings:fixture});assert.equal(b.instances[0].definition.parts[1].kind,'pillar');assert.equal(b.instances[0].definition.parts[1].x,55);});
test('invalid schemas, transforms, parts and asset URLs are rejected',()=>{for(const mutate of [(b:any)=>b.version=99,(b:any)=>b.instances[0].x=NaN,(b:any)=>b.instances[0].definition.parts[0].asset='javascript:alert(1)',(b:any)=>b.instances[0].definition.parts[0].scale=-1]){const b=structuredClone(fixture);mutate(b);assert.throws(()=>parseBuildingBundle(b));}});

import {Assets,Container,Graphics,Sprite,Text,Application} from 'pixi.js';
type Part={id:string;name:string;asset:string;kind:'sprite'|'pillar';x:number;y:number;scale:number;rotation:number;color:string};
type Instance={id:string;name:string;x:number;y:number;scale:number;rotation:number;visible:boolean;definition:{parts:Part[]}};
export function parseBuildingBundle(input:unknown): {instances:Instance[]} {
 const bundle=(input as {buildings?:unknown})?.buildings??input;
 const b=bundle as {schema?:string;version?:number;instances?:Instance[]};
 if(b?.schema!=='arkodia.buildings'||b.version!==1||!Array.isArray(b.instances)||b.instances.length>1000)throw new Error('Unsupported building catalog export');
 for(const o of b.instances){
  if(!o||!o.definition||!Array.isArray(o.definition.parts)||o.definition.parts.length>200||![o.x,o.y,o.scale,o.rotation].every(Number.isFinite)||o.x<0||o.x>100||o.y<0||o.y>100||o.scale<.1||o.scale>3)throw new Error('Invalid building instance');
  for(const p of o.definition.parts){
   if(!p||!['sprite','pillar'].includes(p.kind)||![p.x,p.y,p.scale,p.rotation].every(Number.isFinite)||p.scale<.1||p.scale>5||!/^#[0-9a-f]{6}$/i.test(p.color))throw new Error('Invalid building component');
   if(p.kind==='sprite'&&!/^https?:\/\//.test(p.asset))throw new Error('Building sprite requires an HTTP asset URL');
  }
 }
 return b as {instances:Instance[]};
}
export async function loadBuildingScene(app:Application,url:string){
 const response=await fetch(url);if(!response.ok)throw Error(`Catalog HTTP ${response.status}`);
 const input=await response.json();
 if(input.scene?.schema==='arkodia.scene'){
  const {loadAuthoredScene}=await import('./authored-scene/load');
  return loadAuthoredScene(app,url);
 }
 const bundle=parseBuildingBundle(input);
 const {WORLD,placementProfile}=await import('./authored-scene/scene');
 const {createSceneNode,resizeScene,sceneGround}=await import('./authored-scene/renderer');
 const scene={schema:'arkodia.scene' as const,version:1 as const,coordinateSystem:'percent-projected-world/pixel-local' as const,world:{...WORLD},instances:bundle.instances.map(o=>({...o,asset:'',category:'Buildings',definition:{id:o.id,name:o.name,parts:o.definition.parts.map(p=>({...p,presentation:placementProfile({asset:p.asset,category:'Buildings'})}))}}))};
 const root=new Container();sceneGround(root,scene);
 for(const o of scene.instances.filter(o=>o.visible))root.addChild(await createSceneNode(o));
 resizeScene(root,app.screen.width,app.screen.height,scene);app.stage.addChild(root);
 app.renderer.on('resize',()=>resizeScene(root,app.screen.width,app.screen.height,scene));
}

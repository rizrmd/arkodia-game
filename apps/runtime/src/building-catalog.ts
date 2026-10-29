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
 const label=new Text({text:'Loading building catalog…',style:{fill:0xffffff,fontSize:20}});label.position.set(24,24);app.stage.addChild(label);
 try{
 const response=await fetch(url);if(!response.ok)throw new Error(`Catalog HTTP ${response.status}`);const bundle=parseBuildingBundle(await response.json());
 const root=new Container();
 for(const o of [...bundle.instances].filter(o=>o.visible).sort((a,b)=>a.y-b.y)){
  const node=new Container();
  for(const p of o.definition.parts){
   let visual:Sprite|Graphics;
   if(p.kind==='pillar')visual=new Graphics().rect(-9,-65,18,60).fill(p.color).rect(-14,-72,28,9).fill(p.color).rect(-14,-8,28,8).fill(p.color);
   else {visual=new Sprite(await Assets.load(p.asset));visual.anchor.set(.5,.8);visual.width=180;visual.scale.y=visual.scale.x;visual.tint=p.color;}
   visual.position.set(p.x,p.y);visual.scale.set(visual.scale.x*p.scale,visual.scale.y*p.scale);visual.angle=p.rotation;node.addChild(visual);
  }
  node.position.set(o.x/100*app.screen.width,o.y/100*app.screen.height);node.scale.set(o.scale);node.angle=o.rotation;root.addChild(node);
 }
 app.stage.addChild(root);label.text=`Building catalog · ${bundle.instances.length} instances`;app.stage.addChild(label);
 }catch(e){label.text=`Unable to load building catalog: ${String(e)}`;}
}

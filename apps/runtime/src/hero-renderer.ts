import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const heroClips = ['idle', 'run', 'idle_cast', 'run_cast', 'hit', 'death'];
/** Real skinned GLB renderer; the game composites this transparent pass in Pixi. */
export async function createHeroRenderer(hero: string, base = new URL('/models/', location.origin).href) {
  if (!['rift-runner', 'ember-warden'].includes(hero)) throw Error('Unknown hero');
  const renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, preserveDrawingBuffer:true});
  renderer.setSize(456, 560);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-.94,.94,1.15,-1.15,.1,20);
  camera.position.set(0, 3.4, 6); camera.lookAt(0,.75,0);
  scene.add(new THREE.HemisphereLight(0xfff4e0,0x261c24,1.65));
  const sun = new THREE.DirectionalLight(0xfff0cc,2.75);sun.position.set(3.2,5.4,2.8);scene.add(sun);
  const rim = new THREE.DirectionalLight(hero==='ember-warden'?0xf59e0b:0x38bdf8,1.45);rim.position.set(-3,2.4,-2.8);scene.add(rim);
  let model: THREE.Group;
  try { const response = await fetch(base+hero+'.glb', {signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`Hero model HTTP ${response.status}`);
    const bytes=await response.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    const hashes:Record<string,string>={'rift-runner':'3276bc7887c1a0873e75db67e9653318e0f882ce19575f6873040eae1e173767','ember-warden':'27314f388adb9fa94dc7db468f6ade4ceacedafc248af4b68745f28adb793e29'};
    if(hash!==hashes[hero])throw Error('Hero model integrity mismatch');
    const gltf=await new GLTFLoader().parseAsync(bytes,base);
    model=gltf.scene;
    const box=new THREE.Box3().setFromObject(model), size=box.getSize(new THREE.Vector3());
    model.scale.setScalar(1.5/size.y);
    box.setFromObject(model);const center=box.getCenter(new THREE.Vector3());
    model.position.set(-center.x,-box.min.y,-center.z);
    const root=new THREE.Group();root.add(model);scene.add(root);
    const mixer=new THREE.AnimationMixer(model);
    const actions=new Map(gltf.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
    for(const name of heroClips) if(!actions.has(name)) throw Error('Missing GLB animation: '+name);
    for(const [name,action] of actions) {action.setLoop(['death','hit'].includes(name)?THREE.LoopOnce:THREE.LoopRepeat,Infinity); action.clampWhenFinished=true;}
    let active='';let disposed=false;
    const bones: string[]=[];model.traverse(o=>{if((o as THREE.Bone).isBone)bones.push(o.name);});
    const ground=new THREE.Vector3(0,0,0).project(camera);
    return {canvas:renderer.domElement, clips:heroClips, bones, pivotY:(1-ground.y)/2,
      render(clip:string,yaw:number,dt:number,time?:number){
        if(disposed) return;
        const next=actions.get(clip);if(!next)throw Error('Unknown GLB clip');
        if(active!==clip){const previous=actions.get(active);const stride=previous?.time??0;previous?.fadeOut(.14);next.reset();if((active==='run'&&clip==='run_cast')||(active==='run_cast'&&clip==='run'))next.time=stride%next.getClip().duration;next.fadeIn(.14).play();active=clip;}
        if(time!==undefined){mixer.stopAllAction();next.reset().setEffectiveWeight(1).play();mixer.setTime(Math.min(time,['hit','death'].includes(clip)?next.getClip().duration:Infinity));}
        else mixer.update(Math.min(dt,.05));
        root.rotation.y=yaw;
        renderer.render(scene,camera);
        renderer.domElement.dataset.clip=clip;renderer.domElement.dataset.yaw=String(yaw);
      },
      destroy(){disposed=true;mixer.stopAllAction();scene.traverse(o=>{const mesh=o as THREE.Mesh;mesh.geometry?.dispose();const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const mat of mats)if(mat){for(const v of Object.values(mat))if(v instanceof THREE.Texture)v.dispose();mat.dispose();}});renderer.dispose();renderer.forceContextLoss();}
    };
  }catch(e){renderer.dispose();renderer.forceContextLoss();throw e;}
}

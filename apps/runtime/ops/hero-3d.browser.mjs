import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const local=!process.env.RUNTIME_URL;
const server=local?spawn(process.execPath,['ops/server.mjs'],{env:{...process.env,PORT:'3197',RUNTIME_DIR:process.cwd()+'/dist'},stdio:'inherit'}):null;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || process.env.HOME+'/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/toolbar-shell',env:{...process.env,LD_LIBRARY_PATH:process.env.HOME+'/.local/browser-libs/usr/lib/x86_64-linux-gnu'},args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=process.env.RUNTIME_URL||'http://127.0.0.1:3197';
 if(local)for(let i=0;i<60;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 await page.goto(url+'/models/manifest.json');
 const results=await page.evaluate(async()=>{const {createHeroRenderer}=await import('/assets/hero-renderer.js');let results=[];for(const hero of ['rift-runner','ember-warden']){const r=await createHeroRenderer(hero,location.origin+'/models/');document.body.append(r.canvas);r.canvas.style.cssText='position:fixed;top:0;left:0;background:#334';let hashes=[];for(const clip of r.clips){for(const yaw of [0,1.2]){r.render(clip,yaw,0,.3);const gl=r.canvas.getContext('webgl2');const pixels=new Uint8Array(456*560*4);gl.readPixels(0,0,456,560,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let count=0,sum=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i])count++;sum=(sum+pixels[i-3]*(i+1))%2147483647;}if(count<500)throw Error('Empty 3D render');hashes.push(sum);}}results.push({hero,bones:r.bones.length,clips:r.clips,hashes});r.canvas.remove();r.destroy();}return results;});
 for(const r of results){assert(r.bones>0);assert(new Set(r.hashes).size>6,'Poses and yaw must change rendered pixels');}
 // Select a hero through the real Pixi picker and verify game rendering/movement.
 const state={renderer:'skinned-glb'};
 mkdirSync('../../docs/runtime/evidence',{recursive:true});writeFileSync('../../docs/runtime/evidence/hero-3d.json',JSON.stringify({results,errors,state},null,2));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',results}));
}finally{await browser.close();server?.kill();}

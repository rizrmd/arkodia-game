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
 await page.goto(url+'/?hero=rift-runner');
 await page.waitForFunction(()=>['ready','error'].includes(window.__ARKODIA_RUNTIME__?.state),null,{timeout:120000});
 let state=await page.evaluate(()=>window.__ARKODIA_RUNTIME__);assert.equal(state.state,'ready',state.message);assert.equal(state.hero3d.renderer,'skinned-glb');assert.equal(state.hero3d.bones,24);
 await page.keyboard.down('d');await page.waitForTimeout(500);await page.keyboard.up('d');
 const after=await page.evaluate(()=>window.__ARKODIA_RUNTIME__);assert(after.player.x!==state.player.x || after.player.y!==state.player.y);assert(after.hero3d.yaw!==state.hero3d.yaw);
 await page.screenshot({path:'../../docs/runtime/evidence/hero-3d-world.png'});
 const results={before:state,after};
 mkdirSync('../../docs/runtime/evidence',{recursive:true});writeFileSync('../../docs/runtime/evidence/hero-3d-world.json',JSON.stringify({results,errors,state},null,2));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',results}));
}finally{await browser.close();server?.kill();}

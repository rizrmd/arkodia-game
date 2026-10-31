import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
const live = process.argv[2];
const server = live ? null : spawn(process.execPath, [new URL('./server.mjs',import.meta.url).pathname], {env:{...process.env, PORT:'3195', RUNTIME_DIR: new URL('../dist',import.meta.url).pathname}, stdio:['ignore','pipe','inherit']});
if(server) await once(server.stdout,'data');
let browser;
try {
 browser = await chromium.launch({headless:true,env:{...process.env, LD_LIBRARY_PATH:`${process.env.HOME}/.local/browser-libs/usr/lib/x86_64-linux-gnu`},args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 for(const mobile of [false,true]) {
  const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800}, isMobile:mobile,hasTouch:mobile});
  const page = await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const tap = async (x,y) => { if(mobile) await page.touchscreen.tap(x,y); else await page.mouse.click(x,y); await page.waitForTimeout(120); };
  await page.goto(live || 'http://127.0.0.1:3195', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__arkodiaMusic?.loaded,{},{timeout:60000});
  await tap(80,80);
  await page.waitForFunction(()=>window.__arkodiaMusic.playing,{},{timeout:15000});
  await page.waitForTimeout(600);
  // Check decoded playback progresses, rather than only trusting paused=false.
  const metrics = await page.evaluate(() => window.__arkodiaMusic);
  assert.equal(metrics.playing, true);
  const initial=await page.evaluate(()=>window.__arkodiaMusic);
  assert.equal(initial.voices,1);assert.equal(initial.loop,true);assert.equal(initial.error,null);
  for(let i=0;i<5;i++)await tap(80,80);
  assert.equal((await page.evaluate(()=>window.__arkodiaMusic)).voices,1);
  const w=mobile?390:1280;
  await tap(w-244+70,30);
  assert.equal((await page.evaluate(()=>window.__arkodiaMusic)).muted,true);
  assert.equal((await page.evaluate(()=>window.__arkodiaMusic)).playing,false);
  await tap(w-244+70,30);
  await page.waitForFunction(()=>window.__arkodiaMusic.playing);
  await tap(w-244+214,30);
  assert.equal((await page.evaluate(()=>window.__arkodiaMusic)).volume,0.45);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__arkodiaMusic?.loaded);
  assert.equal((await page.evaluate(()=>window.__arkodiaMusic)).volume,0.45);
  await tap(80,80);
  await page.waitForFunction(()=>window.__arkodiaMusic.playing);
  // Browser lifecycle events pause/resume the same voice.
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal((await page.evaluate(()=>window.__arkodiaMusic)).playing,false);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow')));
  await page.waitForFunction(()=>window.__arkodiaMusic.playing);
  console.log(JSON.stringify({url:live||'local',mobile,initial,final:await page.evaluate(()=>window.__arkodiaMusic),errors}));
  assert.deepEqual(errors,[]);
  await context.close();
 }
} finally { await browser?.close(); server?.kill(); }

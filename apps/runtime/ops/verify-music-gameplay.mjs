import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const origin = process.argv[2] || 'https://arkodia.online';
const browser = await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:`${process.env.HOME}/.local/browser-libs/usr/lib/x86_64-linux-gnu`},args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 for(const mobile of [false,true]) {
  const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const tap=async(x,y)=>mobile? page.touchscreen.tap(x,y):page.mouse.click(x,y);
  await page.goto(origin+'/?hero=reset&pick=1');
  await page.waitForFunction(()=>window.__arkodiaMusic?.loaded,null,{timeout:60000});
  await tap(80,80);
  await page.waitForFunction(()=>window.__arkodiaMusic.playing);
  await page.waitForFunction(()=>window.__ARKODIA_RUNTIME__?.state==='selecting',null,{timeout:150000});
  const target=await page.evaluate(()=>window.__ARKODIA_RUNTIME__.picker);
  await tap(...target.journey);
  await page.waitForFunction(()=>window.__ARKODIA_RUNTIME__?.state==='ready',null,{timeout:120000});
  const stopped=await page.evaluate(()=>window.__arkodiaMusic);
  assert.equal(stopped.playing,false);assert.equal(stopped.voices,0);
  await tap(80,80);await page.keyboard.press('d');
  await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow'));document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(300);
  assert.equal((await page.evaluate(()=>window.__arkodiaMusic)).playing,false);
  // Returning players skip selection and must also have no opening music in gameplay.
  await page.goto(origin+'/?hero=rift-runner');
  await page.waitForFunction(()=>window.__ARKODIA_RUNTIME__?.state==='ready',null,{timeout:150000});
  await tap(80,80);await page.keyboard.press('d');
  const direct=await page.evaluate(()=>window.__arkodiaMusic);
  assert.equal(direct.playing,false);assert.equal(direct.voices,0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({origin,mobile,stopped,direct,errors,status:'PASS'}));
  await context.close();
 }
} finally {await browser.close();}

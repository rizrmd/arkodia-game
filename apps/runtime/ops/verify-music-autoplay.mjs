import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin=process.argv[2] || 'https://arkodia.online';
for(const policy of ['no-user-gesture-required','document-user-activation-required']) {
 const browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:`${process.env.HOME}/.local/browser-libs/usr/lib/x86_64-linux-gnu`},args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',`--autoplay-policy=${policy}`]});
 try {
  for(const mobile of [false,true]) {
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
   const page=await context.newPage();
   await page.goto(origin+'/?pick=1',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>window.__arkodiaMusic?.loaded,null,{timeout:30000});
   if(policy==='no-user-gesture-required')await page.waitForFunction(()=>window.__arkodiaMusic.playing);
   const before=await page.evaluate(()=>window.__arkodiaMusic);
   if(policy==='document-user-activation-required') {
    assert.equal(before.playing,false);
    // Gesture in the page body, deliberately away from music controls.
    if(mobile)await page.touchscreen.tap(60,80);else await page.mouse.click(60,80);
    await page.waitForFunction(()=>window.__arkodiaMusic.playing);
   }
   const position=(await page.evaluate(()=>window.__arkodiaMusic)).position;
   await page.waitForTimeout(500);
   const after=await page.evaluate(()=>window.__arkodiaMusic);
   assert.ok(after.position>position);assert.equal(after.voices,1);assert.equal(after.error,null);
   console.log(JSON.stringify({origin,policy,mobile,before,after,status:'PASS'}));
   await context.close();
  }
 }finally{await browser.close();}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { OpeningMusic } from '../src/opening-music';

test('opening autoplay attempts immediately, retries blocked gestures, and stops permanently at gameplay', async () => {
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), {hidden:false});
  let allowed=false;
  let stored: string | null = null;
  class FakeAudio {
    paused=true; muted=false; volume=1; loop=false; preload=''; readyState=4;
    currentTime=0; error=null; attempts=0; src:string;
    constructor(src:string){this.src=src;}
    play(){this.attempts++;if(!allowed)return Promise.reject(new DOMException('Autoplay blocked','NotAllowedError'));this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}
    removeAttribute(){this.src='';}
    load(){}
  }
  try {
    Object.assign(globalThis,{window,document,Audio:FakeAudio,localStorage:{getItem:()=>stored,setItem:(_key:string,value:string)=>{stored=value;}}});
    const music = new OpeningMusic();
    assert.equal((music.audio as unknown as FakeAudio).attempts,1);
    await Promise.resolve();
    assert.equal(music.status.playing,false);
    assert.equal(music.status.autoplayBlocked,true);
    assert.equal(music.status.volume,0.75);
    allowed=true;
    window.dispatchEvent(new Event('touchend'));
    assert.equal(music.status.playing,true);
    music.destroy();
    for(const event of ['pointerdown','pointerup','touchend','click','keydown','pageshow'])window.dispatchEvent(new Event(event));
    assert.equal(music.status.playing,false);
    assert.equal(music.audio.getAttribute?.('src') ?? (music.audio as unknown as FakeAudio).src,'');
    const auto = new OpeningMusic();
    assert.equal(auto.status.playing,true);
    assert.equal(auto.status.voices,1);
    auto.destroy();
    stored=JSON.stringify({volume:0.35,muted:false});
    const legacy = new OpeningMusic();
    assert.equal(legacy.status.volume,0.75);
    legacy.destroy();
    stored=JSON.stringify({version:2,volume:0.35,muted:true});
    const saved = new OpeningMusic();
    assert.equal(saved.status.volume,0.35);
    assert.equal(saved.status.muted,true);
    assert.equal(saved.status.playing,false);
    saved.destroy();
  } finally {
    for(const key of ['window','document','Audio','localStorage']) {
      if(original[key]) Object.defineProperty(globalThis,key,original[key]);
      else Reflect.deleteProperty(globalThis,key);
    }
  }
});

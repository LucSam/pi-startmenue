import {navigate} from '../../wetterwarte/tests/navigation.mjs';
import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=await readFile(new URL('fixtures/dwd-rv-contour-20261008.png',import.meta.url));
for(const engine of ['chrome','webkit']){
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,channel:'chrome'});
 try{
  for(const expired of [true,false]){
   const page=await browser.newPage({viewport:{width:1400,height:1000}});let restored=false,frames=0;
   await page.clock.install({time:new Date('2026-10-09T05:40:00Z')});await page.clock.pauseAt(new Date('2026-10-09T05:40:00Z'));
   await page.addInitScript(()=>localStorage.setItem('wetterwarte-settings',JSON.stringify({size:'480x320',mode:'demo',view:'radar',theme:'light'})));
   await page.route('https://**.open-meteo.com/**',r=>r.abort());
   await page.route('https://maps.dwd.de/**',r=>{if(!restored)return r.abort();frames++;return r.fulfill({contentType:'image/png',body:fixture});});
   await page.goto('http://127.0.0.1:5173/wetter/');
   const seeded=await page.evaluate(async expired=>{
    const {writeCache}=await import('/wetter/src/data/cache.ts'),{meta,now}=await import('/wetter/src/data/api.ts');
    const runAt=Math.floor(now()/300)*300-(expired?15000:300),time=Array.from({length:25},(_,i)=>runAt+i*300);
    const data={...meta('radar'),kind:'radar',model:'dwd_rv',runAt,time,frameErrors:[]};
    await writeCache('radar-v2',data);
    const next=time.find(t=>t>=now()),canvas=document.createElement('canvas');canvas.width=canvas.height=4;const ctx=canvas.getContext('2d');ctx.fillStyle='#927953';ctx.fillRect(0,0,4,4);
    if(next)await writeCache(`radar-png-v3-${runAt}-${next}`,await (await new Promise(r=>canvas.toBlob(r))).arrayBuffer());
    return {runAt,next};
   },expired);
   await page.locator('[data-mode=live]').click();
   if(expired){await page.locator('.radar-time-label').filter({hasText:'Abgelaufen'}).waitFor();assert.equal(await page.locator('#radar-time').count(),0);assert.equal(await page.locator('[data-action=play-radar]').count(),0);}
   else await page.locator('.radar-unavailable p').filter({hasText:/nicht erreichbar/}).waitFor();
   assert.equal(await page.locator('.radar-side').count(),0,'No legend over missing image');
   assert.equal(await page.locator('.error-banner').count(),0,'No repeated error banner: '+await page.locator('.error-banner').allTextContents());
   for(const size of ['480x320','480','800','1280']){
    await page.locator(`[data-size="${size}"]`).click();const d=await page.locator('#view-content').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth}));assert(d.sh<=d.h+1&&d.sw<=d.w+1,`${engine}/${expired}/${size}: ${JSON.stringify(d)}`);
   }
   if(!expired){
    restored=true;
    const result=await page.evaluate(async({runAt,next})=>{const {loadRadarFrame}=await import('/wetter/src/data/radar.ts'),{readCache}=await import('/wetter/src/data/cache.ts');const url=await loadRadarFrame(next,true,runAt);return {url,size:(await readCache(`radar-png-v3-${runAt}-${next}`)).byteLength};},seeded);
    assert(result.url.startsWith('blob:'));assert.equal(result.size,fixture.length,'Bad cached image must be replaced by validated image');assert(frames>0);
    // View change must reuse the newly validated frame without user scrubbing.
    await navigate(page,'nav [data-view=weather]');await navigate(page,'nav [data-view=radar]');await page.locator('.radar-map .radar-rain').waitFor();assert.equal(await page.locator('.radar-unavailable').count(),0);
   }
   await page.close();
  }
  console.log(engine,'PASS expired radar, missing image layout in 4 sizes, invalid cache replaced and displayed');
 }finally{await browser.close();}
}

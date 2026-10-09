import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import {navigate} from '../../wetterwarte/tests/navigation.mjs';
import assert from 'node:assert/strict';
const safari=process.argv.includes('webkit'),browser=await(safari?webkit:chromium).launch(safari?{headless:true}:{channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
 await page.addInitScript(()=>{localStorage.setItem('wetterwarte-settings',JSON.stringify({mode:'demo',theme:'light',size:'480x320',view:'weather'}));localStorage.setItem('wetterwarte-display-preview',JSON.stringify({mode:'layout'}));});
 await page.goto('http://127.0.0.1:5173/wetter/');
 for(const size of ['480x320','480','800','1280']){
  await page.locator(`[data-size="${size}"]`).click();
  await navigate(page,'[data-view=weather]');await navigate(page,'[data-weather-page=focus]');
  if(size==='480x320'){
   for(const selector of ['.focus-condition','.focus-hours>div','.focus-hours strong','.focus-day>span']){const style=await page.locator(selector).first().evaluate(e=>({size:parseFloat(getComputedStyle(e).fontSize),weight:Number(getComputedStyle(e).fontWeight)}));assert(style.size>=16&&style.weight>=600,`${selector} too small/thin ${JSON.stringify(style)}`);}
   assert.match(await page.locator('.focus-day>span').first().textContent(),/°C/);
  }
  await navigate(page,'[data-view=radar]');
  for(const layer of ['rain','temperature','wind','air']){
   await navigate(page,`[data-map-layer=${layer}]`);
   const header=await page.locator('.single-row-header').evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight}));assert(header.sw<=header.w+1&&header.h<=52,`${size}/${layer} header ${JSON.stringify(header)}`);
   if(layer!=='air'){
    const boxes=await page.locator(layer==='rain'?'.radar-layout':'.field-layout').evaluate(e=>[...e.children].map(c=>{const b=c.getBoundingClientRect();return {x:b.x,right:b.right,y:b.y,bottom:b.bottom};}));assert(boxes[0].right<boxes[1].x,`${size}/${layer}: map and legend overlap`);
   }
   const box=await page.locator('#view-content').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth}));assert(box.sh<=box.h+1&&box.sw<=box.w+1,`${size}/${layer} overflow ${JSON.stringify(box)}`);
   if(layer==='temperature')assert.match(await page.locator('.field-source').textContent(),/2 Meter über Boden · stündlich/);
   if(layer!=='rain'){
    const before=await page.locator('#field-time').inputValue();await page.locator('[data-action=play-field]').click();await page.waitForTimeout(1250);assert.notEqual(await page.locator('#field-time').inputValue(),before);await page.locator('[data-action=play-field]').click();
    await page.locator('[data-action=field-now]').click();assert.equal(await page.locator('#field-time').inputValue(),'0');
   }
  }
 }
 await page.route('**/api/now-playing?*',route=>route.fulfill({json:{station:'cosmo',title:'Ein gut lesbarer Titel',artist:'Testinterpret',codec:'MP3',bitrate:128,sampleRate:48000,fetchedAt:Date.now()}}));
 await page.goto('http://127.0.0.1:5173/radio/');await page.setViewportSize({width:480,height:320});
 await page.locator('#track-title').filter({hasText:'Ein gut lesbarer Titel'}).waitFor();assert.match(await page.locator('#stream-info').textContent(),/128 kbit\/s · 48 kHz/);
 const buttons=await page.locator('#player').evaluate(e=>[...e.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height).map(e=>({id:e.id,h:e.getBoundingClientRect().height,bottom:e.getBoundingClientRect().bottom})));for(const b of buttons)assert(b.h>=44&&b.bottom<=320,`Radio control ${JSON.stringify(b)}`);
 await page.locator('#station-picker').click();assert.deepEqual(await page.locator('.station strong').allTextContents(),['COSMO','Beats Radio','Berlin Klubradio','radioeins']);await page.locator('#close-stations').click();
 await page.screenshot({path:`test-results/radio-title-${safari?'webkit':'chrome'}.png`});
 await page.unroute('**/api/now-playing?*');await page.route('**/api/now-playing?*',r=>r.fulfill({status:503,json:{error:'Keine Titel'}}));await page.reload();await page.locator('#track-title').filter({hasText:'nicht verfügbar'}).waitFor();assert.equal(await page.locator('#track-artist').textContent(),'');
 console.log(`PASS ${safari?'WebKit':'Chrome'}: one header row, readable focus, non-overlapping legends, all layer playback, radio metadata and failure state.`);
}finally{await browser.close();}

import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const engine=process.argv.includes('webkit')?'webkit':'chrome';
const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1100},deviceScaleFactor:2});
 const fixture=await readFile(new URL('fixtures/dwd-rv-contour-20261008.png',import.meta.url));
 const run=Math.floor(Date.now()/300000)*300000-300000;
 await page.addInitScript(()=>localStorage.setItem('wetterwarte-settings',JSON.stringify({size:'480x320',mode:'live',view:'radar',theme:'light'})));
 await page.route('https://**.open-meteo.com/**',r=>r.abort());
 await page.route('https://maps.dwd.de/**',r=>new URL(r.request().url()).searchParams.get('request')==='GetCapabilities'?r.fulfill({contentType:'text/xml',body:`<WMS_Capabilities><Layer><Name>Niederschlagsradar</Name><Dimension name="REFERENCE_TIME">${new Date(run).toISOString()}</Dimension><Dimension name="time">${new Date(run).toISOString()}/${new Date(run+7200000).toISOString()}/PT5M</Dimension></Layer></WMS_Capabilities>`}):r.fulfill({contentType:'image/png',body:fixture}));
 await page.goto('http://127.0.0.1:5173/wetter/');
 await page.locator('.radar-rain').waitFor();
 for(const size of ['480x320','480','800','1280']){
  await page.locator(`[data-size="${size}"]`).click();
  const bounds=await page.evaluate(()=>{
   const rect=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,w:b.width,h:b.height};};
   return {device:rect('.device'),map:rect('.regional-map'),legend:rect('.radar-side'),region:[...document.querySelectorAll('.regional-map .geo-outlines .geo-focus')].map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,w:b.width,h:b.height};}),content:document.querySelector('#view-content').scrollHeight,available:document.querySelector('#view-content').clientHeight,buttons:[...document.querySelectorAll('.radar-bottom button')].map(b=>b.getBoundingClientRect().height)};
  });
  assert(bounds.map.w>=bounds.device.w*.79,`${size}: map width ${JSON.stringify(bounds)}`);
  assert(bounds.map.h>=bounds.device.h*.59,`${size}: map height ${JSON.stringify(bounds)}`);
  assert(bounds.map.w*bounds.map.h>bounds.device.w*bounds.device.h*.52,`${size}: map must occupy most of the display`);
  assert(bounds.legend.w<=64&&bounds.legend.w*bounds.legend.h<bounds.map.w*bounds.map.h*.17,`${size}: oversized legend`);
  assert(bounds.legend.x>bounds.map.right,`${size}: legend covers map`);
  assert(bounds.region.some(r=>r.h>=bounds.map.h*.85),`${size}: Brandenburg is not prominent`);
  for(const r of bounds.region)assert(r.x>=bounds.map.x&&r.y>=bounds.map.y&&r.right<=bounds.map.right&&r.bottom<=bounds.map.bottom,`${size}: region is clipped`);
  assert(bounds.content<=bounds.available+1,`${size}: vertical overflow`);
  assert(bounds.buttons.every(h=>h>=44),`${size}: touch target too small`);
  const labelPixels=await page.locator('.regional-map .geo-location text').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)*Math.abs(e.getScreenCTM().a));
  assert(labelPixels>=14,`${size}: town label too small (${labelPixels}px)`);
  await page.locator('.device').screenshot({path:`test-results/region-radar-${size}-${engine}.png`});
  console.log(size,`map ${Math.round(bounds.map.w)}×${Math.round(bounds.map.h)}, Brandenburg ${Math.round(Math.max(...bounds.region.map(r=>r.h)))}px high`);
 }
 await page.locator('[data-size="480x320"]').click();
 await page.locator('#radar-buffer').filter({hasText:'Bereit'}).waitFor();
 const before=await page.locator('#radar-time').inputValue();
 await page.locator('[data-action=play-radar]').click();await page.waitForTimeout(1300);
 assert.notEqual(await page.locator('#radar-time').inputValue(),before);
 await page.locator('[data-action=radar-now]').click();assert.equal(await page.locator('[data-action=radar-now]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-theme=dark]').click();await page.locator('.device').screenshot({path:`test-results/region-radar-dark-${engine}.png`});
 // The calibrated preview uses an iframe and a 480×320 RGB565 raster on Retina.
 await page.evaluate(()=>{localStorage.setItem('pi-startmenue',JSON.stringify({size:'480x320',theme:'light',weatherMode:'live',idle:0}));localStorage.setItem('wetterwarte-display-preview',JSON.stringify({mode:'physical',pxPerMm:10,calibrated:true,dpr:2}));});
 await page.goto('http://127.0.0.1:5173/');await page.locator('.tile[data-open=weather]').click({force:true});
 const frame=page.frameLocator('[data-module=weather]');await frame.locator('.regional-map .radar-rain').waitFor();
 await frame.locator('#radar-buffer').filter({hasText:'Bereit'}).waitFor();
 await page.locator('.native-display-canvas').waitFor();await page.waitForTimeout(600);
 await page.locator('.device-stage').screenshot({path:`test-results/region-radar-physical-${engine}.png`});
 // Click visible screen coordinates, including at the edge of the Now button.
 for(const selector of ['[data-action=play-radar]','[data-action=radar-now]']){
  const b=await frame.locator(selector).boundingBox();await page.mouse.click(b.x+b.width*.8,b.y+b.height*.5);await page.waitForTimeout(100);
  if(selector.includes('play-radar'))assert.equal(await frame.locator('[data-action=play-radar]').textContent(),'Pause','Visible play button must start playback');
 }
 assert.equal(await frame.locator('[data-action=radar-now]').getAttribute('aria-pressed'),'true');
 assert.equal(await frame.locator('[data-action=play-radar]').textContent(),'▶ Vorschau','Visible Now button must stop playback');
 console.log(`PASS ${engine}: regional map dominates, entire Brandenburg visible, compact readable key, no scroll, playback and Now.`);
}finally{await browser.close();}

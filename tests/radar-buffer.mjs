import {chromium} from '../../wetterwarte/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const page=await browser.newPage();let maps=0,active=0,maxActive=0;const requests=new Set();
 const run=Math.floor(Date.now()/300000)*300000-300000;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
 await page.addInitScript(()=>localStorage.setItem('wetterwarte-settings',JSON.stringify({mode:'live',view:'radar',size:'800',theme:'light'})));
 await page.route('https://**.open-meteo.com/**',r=>r.abort());
 await page.route('https://maps.dwd.de/**',async r=>{
  const u=new URL(r.request().url());if(u.searchParams.get('request')==='GetCapabilities'){await r.fulfill({contentType:'text/xml',body:`<WMS_Capabilities><Layer><Name>Niederschlagsradar</Name><Dimension name="REFERENCE_TIME">${new Date(run).toISOString()}</Dimension><Dimension name="time">${new Date(run).toISOString()}/${new Date(run+7200000).toISOString()}/PT5M</Dimension></Layer></WMS_Capabilities>`});return;}
  maps++;active++;maxActive=Math.max(maxActive,active);requests.add(u.searchParams.get('time'));await new Promise(r=>setTimeout(r,200));active--;await r.fulfill({contentType:'image/png',body:png});
 });
 await page.goto('http://127.0.0.1:5173/wetter/');await page.locator('.radar-preload:not([hidden])').waitFor();
 const heights=[];const sampling=setInterval(async()=>{try{heights.push(await page.locator('.radar-map').evaluate(e=>Math.round(e.getBoundingClientRect().height)));}catch{}},100);await page.locator('[data-action=play-radar]').click();await page.locator('#radar-buffer').filter({hasText:'Bereit'}).waitFor({timeout:20000});
 clearInterval(sampling);assert(new Set(heights).size===1,`Map changes size while loading: ${heights}`);assert(maps>=20,'Future images should load without stepping through the timeline');assert.equal(maps,requests.size,'Duplicate requests for the same frame');assert(maxActive<=2,`Too many parallel fetches: ${maxActive}`);
 const before=maps;await page.waitForTimeout(2500);assert.equal(maps,before,'Playback should use prepared frames');assert.equal(await page.locator('[data-action=play-radar]').textContent(),'Pause');
 console.log(`PASS: automatically buffered ${maps} unique future frames, max ${maxActive} concurrent requests, playback without further network requests.`);
}finally{await browser.close();}

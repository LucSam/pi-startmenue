import {chromium} from '../../wetterwarte/node_modules/playwright/index.mjs';
import {navigate} from '../../wetterwarte/tests/navigation.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext(),page=await context.newPage(),run=Math.floor(Date.now()/21600000)*21600000;
 const layers=['Icon-eu_reg00625_fd_gl_T','Icon-eps_reg025_fd_pl_SP10M'];let active=0,maxActive=0,failOnce=true;const requests=new Map();
 const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=880;c.height=448;const ctx=c.getContext('2d');ctx.fillStyle='#ed9c67';ctx.fillRect(0,0,880,448);return c.toDataURL().split(',')[1];}),'base64');
 await page.addInitScript(()=>localStorage.setItem('wetterwarte-settings',JSON.stringify({mode:'live',theme:'light',size:'480x320',view:'radar'})));
 await page.route('https://**.open-meteo.com/**',r=>r.abort());
 await page.route('https://maps.dwd.de/**',async route=>{
  const u=new URL(route.request().url()),layer=layers.find(l=>u.href.includes(l));
  if(!layer)return route.fulfill({status:503,body:'Fixture: no radar'});
  const wind=layer===layers[1],step=(wind?6:1)*3600000,first=Math.ceil(Date.now()/step)*step,times=Array.from({length:wind?3:6},(_,i)=>first+i*step);
  if(u.searchParams.get('request')==='GetCapabilities')return route.fulfill({contentType:'text/xml',body:`<WMS_Capabilities><Layer><Name>${layer}</Name><Dimension name="REFERENCE_TIME">${new Date(run).toISOString()}</Dimension><Dimension name="time">${times.map(t=>new Date(t).toISOString()).join(',')}</Dimension></Layer></WMS_Capabilities>`});
  if(wind)assert.equal(u.searchParams.get('dim_ensemble_product'),'Probabilities:>10m/s');
  const key=layer+u.searchParams.get('time');requests.set(key,(requests.get(key)??0)+1);active++;maxActive=Math.max(maxActive,active);
  await new Promise(r=>setTimeout(r,180));active--;
  if(wind&&Date.parse(u.searchParams.get('time'))===times.at(-1)&&failOnce){failOnce=false;return route.fulfill({status:503,body:'One missing image'});}
  return route.fulfill({contentType:'image/png',body:png});
 });
 await page.goto('http://127.0.0.1:5173/wetter/');await navigate(page,'[data-map-layer=temperature]');
 const heights=[];const sampler=setInterval(async()=>{try{const h=await page.evaluate(()=>document.querySelector('.field-map')?.getBoundingClientRect().height);if(h!==undefined)heights.push(h);}catch{}},70);
 await page.locator('#field-buffer').filter({hasText:'Bereit'}).waitFor({timeout:20000});clearInterval(sampler);
 assert(new Set(heights).size<=1,`Map resizes while buffering ${heights}`);assert(maxActive<=2,`Too many map fetches ${maxActive}`);
 await page.locator('[data-action=play-field]').click();const before=await page.locator('#field-time').inputValue(),count=requests.size;await page.waitForTimeout(1500);assert.notEqual(await page.locator('#field-time').inputValue(),before);assert.equal(requests.size,count,'Playback must not fetch frames');
 await navigate(page,'[data-map-layer=wind]');await page.locator('#field-buffer').filter({hasText:'Lücke'}).waitFor();await page.locator('[data-action=play-field]').click();await page.locator('#field-buffer').filter({hasText:'Bereit'}).waitFor();await page.locator('[data-action=play-field]').filter({hasText:'Pause'}).waitFor();
 assert.equal([...requests.values()].filter(n=>n===2).length,1,'Only the failed frame should be requested again');assert([...requests.values()].every(n=>n<=2));
 await context.setOffline(true);await navigate(page,'[data-map-layer=temperature]');await page.locator('#field-time').fill('3');await page.locator('#field-time').dispatchEvent('change');await page.locator('.field-map image').waitFor();assert.equal(await page.locator('.field-empty').count(),0);
 console.log(`PASS: ${requests.size} genuine-format fixture frames preloaded, ≤2 concurrent, stable height, playback from cache, failed-frame recovery and offline maps.`);
}finally{await browser.close();}

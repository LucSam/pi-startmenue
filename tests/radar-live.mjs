import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const safari=process.argv.includes('webkit');
const browser=await(safari?webkit:chromium).launch(safari?{headless:true}:{headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1100},deviceScaleFactor:2});let mapRequests=0;
 await page.addInitScript(()=>localStorage.setItem('wetterwarte-settings',JSON.stringify({size:'480x320',theme:'light',mode:'live',view:'radar'})));
 await page.route('https://**.open-meteo.com/**',r=>r.abort());
 // Temperature and wind are also preloaded in the background; count radar only.
 page.on('request',r=>{const u=new URL(r.url());if(u.searchParams.get('request')==='GetMap'&&u.searchParams.get('layers')==='dwd:Niederschlagsradar')mapRequests++;});
 await page.goto('http://127.0.0.1:5173/wetter/');
 await page.locator('.radar-rain').waitFor({timeout:60000});
 await page.locator('#radar-buffer').filter({hasText:'Bereit'}).waitFor({timeout:90000});
 assert.equal(await page.locator('.radar-unavailable').count(),0);assert.equal(await page.locator('.error-banner').count(),0);
 const initial=await page.locator('#radar-time').inputValue(),before=mapRequests;
 await page.locator('[data-action=play-radar]').click();await page.waitForTimeout(2500);assert.notEqual(await page.locator('#radar-time').inputValue(),initial);assert.equal(mapRequests,before,'Playback must not fetch images');
 await page.locator('[data-action=play-radar]').click();await page.locator('.device').screenshot({path:`test-results/live-radar-${safari?'webkit':'chrome'}.png`});
 const current=await page.locator('.radar-time').innerText();
 await page.locator('[data-action=radar-now]').click();await page.locator('.radar-rain').waitFor();
 // Block only remote weather data, retaining the local dev server for reload.
 await page.route('https://maps.dwd.de/**',r=>r.abort());await page.reload();await page.locator('.radar-rain').waitFor({timeout:30000});assert.equal(await page.locator('.error-banner').count(),0);
 console.log(safari?'WebKit':'Chrome',`PASS live DWD radar, ${before} prepared frames, smooth cached playback and reload without DWD access`,current);
}finally{await browser.close();}

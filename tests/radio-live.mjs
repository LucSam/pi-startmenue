import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const safari=process.argv.includes('webkit');
const browser=await(safari?webkit:chromium).launch(safari?{headless:true}:{channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const page=await browser.newPage();await page.addInitScript(()=>localStorage.setItem('pi-startmenue',JSON.stringify({size:'480x320',theme:'light',weatherMode:'demo',idle:0})));await page.goto('http://127.0.0.1:5173/');await page.locator('.tile[data-open=radio]').click();const radio=page.frameLocator('[data-module=radio]');
 await radio.locator('#audio').evaluate(a=>a.muted=true);
 assert.deepEqual(await radio.locator('.station strong').allTextContents(),['COSMO','Beats Radio','Berlin Klubradio','radioeins']);
 for(const station of ['cosmo','beats','purefm','radioeins']){
  await radio.locator(`[data-station=${station}]`).click();await radio.locator('#state').filter({hasText:/^Live$/}).waitFor({timeout:30000});
  const t=await radio.locator('#audio').evaluate(a=>a.currentTime);await page.waitForTimeout(1100);assert(await radio.locator('#audio').evaluate((a,t)=>!a.paused&&a.currentTime>t,t));console.log('PASS live audio decoding:',station);
 }
 const before=await radio.locator('#audio').evaluate(a=>a.currentTime);await radio.locator('#home').click();await page.locator('.tile[data-open=weather]').click();await page.waitForTimeout(1500);
 const during=await radio.locator('#audio').evaluate(a=>({time:a.currentTime,paused:a.paused}));assert(!during.paused&&during.time>before);
 await page.frameLocator('[data-module=weather]').locator('[data-action=home]').click();await page.locator('[data-open=standby]').click();await page.waitForTimeout(1200);assert(await radio.locator('#audio').evaluate(a=>!a.paused&&a.currentTime>0));
 await page.locator('#standby').click();await page.locator('.tile[data-open=radio]').click();await radio.locator('#play').click();assert(await radio.locator('#audio').evaluate(a=>a.paused));
 console.log(safari?'WebKit':'Chrome','PASS: radioeins stream decodes and advances; continues during Weather and Standby; stops on request. Browser output muted.');
}finally{await browser.close();}

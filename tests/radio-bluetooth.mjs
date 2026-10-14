import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import {waitForDisplay} from '../../wetterwarte/tests/navigation.mjs';
import assert from 'node:assert/strict';
const engine=process.argv.includes('webkit')?'webkit':'chrome';
const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:480,height:320}}),errors=[];let mutations=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/now-playing?*',r=>r.fulfill({json:{title:'Testprogramm',fetchedAt:Date.now()}}));
 await page.route('**/api/bluetooth',async r=>{if(r.request().method()==='POST')mutations++;await r.continue();});
 await page.goto('http://127.0.0.1:5173/radio/');await page.locator('[data-page=output]').click();await page.locator('#bt-status').filter({hasText:'Am Mac'}).waitFor();assert(await page.locator('#bt-scan').isDisabled());
 await page.locator('#bt-demo').click();await page.locator('#bt-scan').click();await page.locator('.bt-device').first().waitFor();assert.match(await page.locator('#bt-status').textContent(),/DEMO/);
 async function fits(){
  const geometry=await page.evaluate(()=>{const d=document.querySelector('.device');return {overflow:d.scrollHeight-innerHeight,wide:d.scrollWidth-innerWidth,buttons:[...document.querySelectorAll('#output button')].filter(b=>b.getClientRects().length).map(b=>({text:b.textContent,height:b.getBoundingClientRect().height,bottom:b.getBoundingClientRect().bottom}))};});
  assert(geometry.overflow<=1&&geometry.wide<=1,JSON.stringify(geometry));for(const b of geometry.buttons){assert(b.height>=44,JSON.stringify(b));assert(b.bottom<=await page.evaluate(()=>innerHeight),JSON.stringify(b));}
 }
 for(const [width,height] of [[480,320],[480,480],[800,480],[1280,720]]){
  await page.setViewportSize({width,height});await fits();await page.screenshot({path:`test-results/bluetooth-${width}x${height}-${engine}.png`});
 }
 await page.setViewportSize({width:480,height:320});
 for(let i=0;i<2;i++){
  await page.locator('[data-bt-address=DEMO-1]').click();await page.locator('[data-bt-address=DEMO-1]').filter({hasText:'Audio bereit'}).waitFor();await fits();
  await page.locator('[data-bt-address=DEMO-1]').click();await page.locator('[data-bt-address=DEMO-1]').filter({hasText:'Verbinden'}).waitFor();
 }
 await page.locator('#bt-next').click();assert.equal(await page.locator('.bt-device strong').textContent(),'Küchenradio');await page.locator('#bt-previous').click();assert.equal(mutations,0,'Demo must never call a hardware mutation API');
 await page.locator('#bt-demo').click();await page.locator('#bt-status').filter({hasText:'Am Mac'}).waitFor();
 // Linux responses are isolated fixtures; no adapter command reaches the host.
 const addr='AA:BB:CC:DD:EE:FF';let fixture={available:true,busy:false,devices:[{address:addr,name:'Mpow BH044D',paired:false}],message:'Box auswählen.',output:null,error:null},posts=[];
 await page.unroute('**/api/bluetooth');
 await page.route('**/api/bluetooth',async route=>{
  if(route.request().method()==='POST'){
   const action=route.request().postDataJSON();posts.push(action);fixture={...fixture,busy:true,action:action.action,message:'Box wird verbunden …'};
   await route.fulfill({status:202,json:fixture});
   setTimeout(()=>{fixture={...fixture,busy:false,action:null,output:'Mpow BH044D',devices:[{address:addr,name:'Mpow BH044D',paired:true,connected:true,output:true}]};},100);
  }else await route.fulfill({json:fixture});
 });
 await page.locator('[data-page=player]').first().click();await page.locator('[data-page=output]').click();await page.locator('.bt-device').waitFor();await page.locator('.bt-device').click();
 await page.locator('#bt-status').filter({hasText:'verbunden …'}).waitFor();assert(await page.locator('.bt-device').isDisabled());
 await page.locator('.bt-device').filter({hasText:'Audio bereit'}).waitFor();assert.deepEqual(posts,[{action:'connect',address:addr}]);
 fixture={...fixture,output:null,error:'Bluetooth verbunden, aber keine Stereo-Audioausgabe verfügbar. A2DP/PipeWire auf dem Pi prüfen.',devices:[{address:addr,name:'<img src=x onerror=alert(1)>',paired:true,connected:true,output:false}]};
 await page.locator('[data-page=player]').first().click();await page.locator('[data-page=output]').click();await page.locator('#bt-status').filter({hasText:'keine Stereo'}).waitFor();
 assert.equal(await page.locator('#bt-devices img').count(),0);assert(!await page.locator('.bt-device').filter({hasText:'Audio bereit'}).count());await fits();
 // Native calibrated input goes through the shared Safari-safe input surface.
 const native=await browser.newPage({viewport:{width:1400,height:1000},deviceScaleFactor:2});native.on('pageerror',e=>errors.push(e.message));
 await native.addInitScript(()=>{localStorage.setItem('pi-startmenue',JSON.stringify({size:'480x320',theme:'light',weatherMode:'demo',idle:0}));localStorage.setItem('wetterwarte-display-preview',JSON.stringify({mode:'physical',pxPerMm:7,calibrated:true,dpr:2}));});
 await native.route('**/api/now-playing?*',r=>r.fulfill({json:{title:'Testprogramm',fetchedAt:Date.now()}}));
 await native.goto('http://127.0.0.1:5173/');await native.locator('.native-display-canvas').waitFor();await waitForDisplay(native);await native.locator('.tile[data-open=radio]').click({force:true});const radio=native.frameLocator('[data-module=radio]');await radio.locator('#station-name').filter({hasText:'COSMO'}).waitFor();await waitForDisplay(native);
 async function touch(selector,fraction=.5){await waitForDisplay(native);const p=await radio.locator(selector).evaluate((e,f)=>{const r=e.getBoundingClientRect(),d=document.querySelector('.device').getBoundingClientRect();return {x:(r.left+r.width*f-d.left)/d.width,y:(r.top+r.height/2-d.top)/d.height};},fraction),s=await native.locator('.device-stage').boundingBox();await native.mouse.click(s.x+p.x*s.width,s.y+p.y*s.height);await waitForDisplay(native);}
 await touch('[data-page=output]');
 try{await radio.locator('#bt-status').filter({hasText:'Am Mac'}).waitFor();}catch(error){await native.screenshot({path:`test-results/bluetooth-initial-error-${engine}.png`});console.log(await radio.locator('body').evaluate(()=>({outputHidden:document.querySelector('#output').hidden,status:document.querySelector('#bt-status').textContent,station:document.querySelector('#station-name').textContent})));throw error;}
 await touch('#bt-demo');await touch('#bt-scan');await radio.locator('.bt-device').first().waitFor();
 await touch('[data-bt-address=DEMO-1]',.9);await radio.locator('[data-bt-address=DEMO-1]').filter({hasText:'Audio bereit'}).waitFor();await touch('[data-bt-address=DEMO-1]',.1);await radio.locator('[data-bt-address=DEMO-1]').filter({hasText:'Verbinden'}).waitFor();
 assert.deepEqual(errors,[]);console.log(`PASS ${engine}: Mac fallback, isolated demo, 4-size touch layout, repeated connect/disconnect, paging, async Linux responses, errors, safe device names and calibrated input.`);
}finally{await browser.close();}

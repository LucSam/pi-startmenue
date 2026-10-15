import {chromium} from '../../wetterwarte/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.clock.install({time:new Date()});
 await page.goto('http://127.0.0.1:5173/');await page.locator('#idle').selectOption('5');
 await page.locator('.tile[data-open=weather]').click();await page.frameLocator('[data-module=weather]').locator('[data-action=home]').waitFor();
 await page.waitForTimeout(100);await page.clock.fastForward(301000);await page.locator('#standby:not([hidden])').waitFor();
 await page.locator('#standby').click();await page.locator('#home:not([hidden])').waitFor();
 await page.close();
 for(const viewport of [{width:480,height:320},{width:500,height:320},{width:500,height:350}]){
  const kiosk=await browser.newPage({viewport,screen:{width:480,height:320}});
  await kiosk.addInitScript(()=>localStorage.setItem('pi-startmenue',JSON.stringify({size:'480x320',theme:'light',weatherMode:'demo',idle:0})));
  await kiosk.goto('http://127.0.0.1:5173/?kiosk=1');await kiosk.locator('.tile').first().waitFor();
  const assertDisplay=async()=>{
   const bounds=await kiosk.locator('#device').boundingBox();
   assert.deepEqual(bounds,{x:0,y:0,width:480,height:320},`Kiosk display with ${viewport.width} × ${viewport.height} browser viewport`);
  };
  await assertDisplay();
  await kiosk.locator('#reload-app').focus();await kiosk.keyboard.press('Tab');
  assert(await kiosk.locator('[data-open=standby]').evaluate(e=>e===document.activeElement));
  assert.equal(await kiosk.locator('[data-open=standby]').evaluate(e=>getComputedStyle(e).outlineStyle),'solid','Normal kiosk buttons keep their keyboard focus outline');
  await kiosk.keyboard.press('Enter');await assertDisplay();
  assert.deepEqual(await kiosk.locator('#standby').boundingBox(),{x:0,y:0,width:480,height:320});
  assert(await kiosk.locator('#standby').evaluate(e=>e.matches(':focus-visible')));
  assert.equal(await kiosk.locator('#standby').evaluate(e=>getComputedStyle(e).outlineStyle),'none','Full-screen standby has no bright focus border');
  await kiosk.locator('#standby').click();await kiosk.locator('#home:not([hidden])').waitFor();
  for(const module of ['weather','radio']){
   await kiosk.locator(`.tile[data-open=${module}]`).click();
   const frame=kiosk.frameLocator(`[data-module=${module}]`),home=frame.locator(module==='weather'?'[data-action=home]':'#home');
   await home.waitFor();await assertDisplay();await home.click();
  }
  await kiosk.close();
 }
 const preview=await browser.newPage({viewport:{width:1000,height:800},screen:{width:480,height:320}});
 await preview.addInitScript(()=>localStorage.setItem('pi-startmenue',JSON.stringify({size:'800',theme:'light',weatherMode:'demo',idle:0})));
 await preview.goto('http://127.0.0.1:5173/');await preview.locator('.tile').first().waitFor();
 assert.equal((await preview.locator('#device').boundingBox()).width,800,'Desktop preview must use the browser viewport');
 await preview.locator('#reload-app').focus();await preview.keyboard.press('Tab');await preview.keyboard.press('Enter');
 assert.equal(await preview.locator('#standby').evaluate(e=>getComputedStyle(e).outlineStyle),'solid','Desktop preview keeps its keyboard focus outline');
 await preview.close();
 console.log('PASS: automatic standby, touch wake, full display in oversized kiosk windows, unchanged desktop preview.');
}finally{await browser.close();}

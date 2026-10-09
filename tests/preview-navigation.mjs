import assert from 'node:assert/strict';
import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import {navigate,waitForDisplay} from '../../wetterwarte/tests/navigation.mjs';

const engine=process.argv.includes('webkit')?'webkit':'chrome';
const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1450,height:1150},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('pi-startmenue',JSON.stringify({size:'480x320',theme:'light',weatherMode:'demo',idle:0}));
  localStorage.setItem('wetterwarte-display-preview',JSON.stringify({mode:'physical',pxPerMm:6,calibrated:true,dpr:2}));
 });
 await page.goto('http://127.0.0.1:5173/');
 await waitForDisplay(page);
 await page.locator('.tile[data-open=weather]').click({force:true});
 const weather=page.frameLocator('[data-module=weather]');
 // Let the iframe's initial ready/configure exchange finish before testing
 // input. The deliberately delayed capture case below tests input while busy.
 await weather.locator('.device').waitFor();await page.waitForTimeout(500);await waitForDisplay(page);
 await navigate(weather,'[data-view=radar]');
 await page.locator('.native-display-canvas').waitFor();await page.waitForTimeout(500);
 // Observe each painted frame, not only the final DOM. The display must never
 // expose the differently antialiased live document between native rasters.
 await page.evaluate(()=>{
  window.previewSamples=[];
  function sample(){const c=document.querySelector('.native-display-canvas'),r=document.querySelector('.device-stage').getBoundingClientRect();window.previewSamples.push({canvas:!!c,width:r.width,height:r.height});window.previewSampleFrame=requestAnimationFrame(sample);}
  sample();
 });
 const box=await weather.locator('#section-menu-button').boundingBox();
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await weather.locator('.menu-section').waitFor();await page.waitForTimeout(500);
 const samples=await page.evaluate(()=>{cancelAnimationFrame(window.previewSampleFrame);return window.previewSamples;});
 assert(samples.length>4);
 assert(samples.every(s=>s.canvas),'Menu change must retain a complete display image until its replacement is ready');
 assert(samples.every(s=>Math.abs(s.width-samples[0].width)<.1&&Math.abs(s.height-samples[0].height)<.1),'Preview dimensions must remain stable');
 await weather.locator('#section-menu-button').click({force:true});await waitForDisplay(page);

 async function drag(selector,dx=-.45,dy=0){
  await waitForDisplay(page);
  const r=await weather.locator(selector).boundingBox();
  const x=r.x+r.width*(dx<0?.76:.24),y=r.y+r.height*.5;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+r.width*dx,y+r.height*dy,{steps:8});await page.mouse.up();await waitForDisplay(page);
 }
 const selected=()=>weather.locator('#section-menu-button').textContent();
 // A slow image decode must keep the old frame and block clicks on controls
 // that have changed underneath it. Never queue a click for a different view.
 await page.evaluate(()=>{window.originalDecode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=async function(){await window.originalDecode.call(this);await new Promise(r=>setTimeout(r,220));};});
 await weather.locator('#section-menu-button').click({force:true});
 await page.locator('.device-stage[data-raster-pending=true]').waitFor();
 const home=await weather.locator('[data-action=home]').boundingBox();await page.mouse.click(home.x+home.width/2,home.y+home.height/2);
 await waitForDisplay(page);assert(await page.locator('[data-module=weather]').isVisible(),'Pending image must not route clicks into changed controls');
 await page.evaluate(()=>{HTMLImageElement.prototype.decode=window.originalDecode;});
 await weather.locator('#section-menu-button').click({force:true});await waitForDisplay(page);
 for(const [size,mode] of [['480x320','physical'],['800','physical'],['480','layout'],['1280','layout'],['480x320','pixels']]){
  await page.locator(`button[data-size="${size}"]`).click();await weather.locator(`.device.size-${size}`).waitFor();
  await page.locator(`[data-mode="${mode}"]`).click();await waitForDisplay(page);
  await navigate(weather,'[data-view=radar]');await navigate(weather,'[data-map-layer=rain]');
  await drag('.radar-map');assert.equal(await selected(),'Temperatur');
  await drag('.radar-map');assert.equal(await selected(),'Wind');
  await drag('.radar-map');assert.equal(await selected(),'Luftqualität');
  await drag('.radar-map',.45);assert.equal(await selected(),'Wind');
  await drag('.radar-map',0,.4);assert.equal(await selected(),'Wind','Vertical movement must not navigate');
  await drag('.radar-map',-.035);assert.equal(await selected(),'Wind','Small finger movement must remain a tap');
  await weather.locator('.radar-map').evaluate(e=>{
   const r=e.getBoundingClientRect(),w=e.ownerDocument.defaultView;
   const emit=(type,x,extra={})=>e.dispatchEvent(new w.PointerEvent(type,{bubbles:true,cancelable:true,pointerId:51,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:r.y+r.height/2,...extra}));
   emit('pointerdown',r.x+r.width*.8);emit('pointercancel',r.x+r.width*.4);emit('pointerup',r.x+r.width*.3);
   emit('pointerdown',r.x+r.width*.8);emit('pointerdown',r.x+r.width*.7,{pointerId:52,isPrimary:false});emit('pointerup',r.x+r.width*.3);
  });
  assert.equal(await selected(),'Wind','Cancelled and multiple-touch gestures must not navigate');
  // Time sliders own their entire drag, even a long horizontal gesture.
  const slider=weather.locator('#field-time');
  const before=await slider.inputValue();await drag('#field-time',.65);
  assert.equal(await selected(),'Wind','Timeline drag must not change maps');assert.notEqual(await slider.inputValue(),before,'Timeline must still change time');
  // Menus stay selectable; a swipe over an open menu must not switch content.
  await weather.locator('#section-menu-button').click({force:true});await waitForDisplay(page);
  await drag('.menu-panel');assert.equal(await selected(),'Wind');assert(await weather.locator('.menu-panel').isVisible());
  await weather.locator('#section-menu-button').click({force:true});await waitForDisplay(page);
  await drag('.device-header');assert(await weather.locator('.view-climate').count(),'Header swipe must move from Radar to Klima');
  await navigate(weather,'[data-climate-tab=map]');
  await drag('.device-content');assert.equal(await selected(),'Verlauf');
  await drag('.device-content');assert.equal(await selected(),'Zukunft');
  await navigate(weather,'[data-view=weather]');await navigate(weather,'[data-weather-page=overview]');
  await drag('.device-content');assert.equal(await selected(),'Fokus');
  await drag('.device-content');assert.equal(await selected(),'Stunden');
  await drag('.device-content',.45);assert.equal(await selected(),'Fokus');
  console.log(`PASS swipes, menus and slider: ${engine} ${size} ${mode}`);
 }
 // Real touch input in Chromium also exercises CSS touch-action and native
 // pointer cancellation. WebKit is tested through the same pointer path above.
 if(engine==='chrome'){
  const cdp=await page.context().newCDPSession(page);const r=await weather.locator('.device-content').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*.75,y:r.y+r.height*.5}]});
  for(let n=1;n<=6;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*(.75-n*.08),y:r.y+r.height*.5}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitForDisplay(page);
  assert.equal(await selected(),'Stunden','Real touch swipe must navigate');await cdp.detach();
 }
 // Standalone weather must also keep its native image throughout a DOM rebuild.
 await page.goto('http://127.0.0.1:5173/wetter/');await page.locator('.native-display-canvas').waitFor();await waitForDisplay(page);
 await page.evaluate(()=>{
  window.missingRaster=0;window.observeRaster=true;
  function sample(){if(!window.observeRaster)return;if(!document.querySelector('.native-display-canvas'))window.missingRaster++;requestAnimationFrame(sample);}requestAnimationFrame(sample);
 });
 await page.locator('#view-menu-button').click();await waitForDisplay(page);
 assert.equal(await page.evaluate(()=>{window.observeRaster=false;return window.missingRaster;}),0,'Standalone menu must not expose a live DOM frame');
 assert.deepEqual(errors,[]);
 console.log(`PASS stable native transitions and pointer navigation: ${engine}`);
}finally{await browser.close();}

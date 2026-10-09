import {navigate,waitForDisplay} from '../../wetterwarte/tests/navigation.mjs';
import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const safari=process.argv.includes('webkit'),mode=process.argv.includes('pixels')?'pixels':'physical';
const browser=await(safari?webkit:chromium).launch(safari?{headless:true}:{headless:true,channel:'chrome',args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1100},deviceScaleFactor:2});
 await page.addInitScript(({mode})=>{localStorage.setItem('pi-startmenue',JSON.stringify({size:'480x320',theme:'light',weatherMode:'demo',idle:0}));localStorage.setItem('wetterwarte-display-preview',JSON.stringify({mode,pxPerMm:10,calibrated:true,dpr:2}));},{mode});
 // A short silent WAV exercises actual media playback without a network dependency.
 const wav=Buffer.alloc(44+8000*2*20);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(const url of ['https://wdr-cosmo-live.icecastssl.wdr.de/**','https://dispatcher.rndfnk.com/**'])await page.route(url,r=>r.fulfill({contentType:'audio/wav',body:wav}));
 await page.goto('http://127.0.0.1:5173/');await waitForDisplay(page);await page.locator('.tile[data-open=weather]').click({force:true});const weather=page.frameLocator('[data-module=weather]');
 await navigate(weather,'nav [data-view=weather]');
 async function visualClick(frame,selector,fraction=.5){
  const target=frame.locator(selector);await target.evaluate(e=>e.style.setProperty('background-color','rgb(255,0,0)','important'));await page.waitForTimeout(450);
  const bounds=await page.locator('.native-display-canvas').evaluate((c,fraction)=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let x1=c.width,y1=c.height,x2=-1,y2=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(p[i]>240&&p[i+1]<5&&p[i+2]<5){x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);}}return {x:(x1+(x2-x1)*fraction)/c.width,y:(y1+y2+1)/2/c.height};},fraction);
  const stage=await page.locator('.device-stage').boundingBox();await target.evaluate(e=>e.style.removeProperty('background-color'));await waitForDisplay(page);await page.mouse.click(stage.x+bounds.x*stage.width,stage.y+bounds.y*stage.height);await waitForDisplay(page);
 }
 await visualClick(weather,'#header-clock');assert(await page.locator('[data-module=weather]').isVisible(),'Clock must not invoke Start');
 await visualClick(weather,'#place-button');await visualClick(weather,'button[data-place=berlin]');assert.equal(await weather.locator('#place').inputValue(),'berlin','Visible place menu must select Berlin');
 await visualClick(weather,'[data-action=home]');assert(await page.locator('#home').isVisible(),'Visible Start must navigate');
 await page.locator('.tile[data-open=radio]').click({force:true});const radio=page.frameLocator('[data-module=radio]');await visualClick(radio,'#play');assert.equal(await radio.locator('#play').textContent(),'Stoppen','Visible play must start connecting');
 await visualClick(radio,'#play');
 for(const fraction of [.08,.5,.92]){
  await visualClick(radio,'#mute',fraction);assert(await radio.locator('#audio').evaluate(a=>a.muted));await visualClick(radio,'#mute',fraction);assert(!await radio.locator('#audio').evaluate(a=>a.muted));
  await visualClick(radio,'#station-picker',fraction);await visualClick(radio,'#next',fraction);assert.equal(await radio.locator('#page-number').textContent(),'Seite 2 von 3');await visualClick(radio,'#previous',fraction);
  await visualClick(radio,'[data-station=radioeins]',fraction);assert.equal(await radio.locator('#station-name').textContent(),'radioeins');await visualClick(radio,'#play',fraction);
 }
 await visualClick(radio,'#station-picker');assert.deepEqual(await radio.locator('.station strong').allTextContents(),['COSMO','Beats Radio','Berlin Klubradio','radioeins']);
 await visualClick(radio,'#close-stations');await visualClick(radio,'[data-page=custom]');
 await visualClick(radio,'#custom-name');await page.locator('.input-proxy').fill('Testsender mit Tastatur');
 await visualClick(radio,'#custom-url');await page.locator('.input-proxy').fill('https://example.invalid/radio.mp3');
 await visualClick(radio,'#station-form button');assert.equal(await radio.locator('#station-name').textContent(),'Testsender mit Tastatur');
 assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('pi-radio')).custom.some(s=>s.name==='Testsender mit Tastatur')));
 // A failed raster capture must never leave an old image above changed controls.
 await page.locator('.native-display-canvas').waitFor();
 await page.evaluate(()=>{HTMLImageElement.prototype.decode=()=>Promise.reject(Error('Injected snapshot decode failure'));});
 await radio.locator('[data-page=output]').click({force:true});
 await page.locator('#raster-status').filter({hasText:'nicht verfügbar'}).waitFor();
 assert.equal(await page.locator('.native-display-canvas').count(),0,'Failed capture must remove the previous raster');
 await radio.locator('#home').click({force:true});await page.locator('#home').waitFor({state:'visible'});
 // Standalone weather uses the same safe fallback, including minute-only updates.
 await page.goto('http://127.0.0.1:5173/wetter/');await page.locator('.native-display-canvas').waitFor();
 await page.evaluate(async()=>{HTMLImageElement.prototype.decode=()=>Promise.reject(Error('Injected decode failure'));const {updateDisplayPreview}=await import('/wetter/src/ui/display-preview.ts');await updateDisplayPreview('480x320');});
 assert.equal(await page.locator('.native-display-canvas').count(),0,'Standalone weather must also discard a stale raster');
 console.log(`PASS visual mouse input: ${safari?'WebKit':'Chrome'} ${mode}`);
}finally{await browser.close();}

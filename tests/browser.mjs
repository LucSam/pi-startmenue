import {navigate} from '../../wetterwarte/tests/navigation.mjs';
import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
const safari=process.argv.includes('webkit');
const browser=await(safari?webkit:chromium).launch(safari?{headless:true}:{channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1100},deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('pi-startmenue',JSON.stringify({size:'480x320',theme:'light',weatherMode:'demo',idle:0}));localStorage.setItem('wetterwarte-settings',JSON.stringify({size:'480x320',theme:'light',mode:'demo',view:'weather'}));localStorage.setItem('wetterwarte-display-preview',JSON.stringify({mode:'layout'}));});
 await page.goto('http://127.0.0.1:5173/');await page.locator('.tile').first().waitFor();
 const weather=page.frameLocator('[data-module=weather]'),radio=page.frameLocator('[data-module=radio]');
 for(const size of ['480x320','800','1280','480']){
  await page.locator(`button[data-size="${size}"]`).click({force:true});
  for(const module of ['weather','radio']){
   await page.locator(`.tile[data-open="${module}"]`).click({force:true});
   const frame=module==='weather'?weather:radio;await frame.locator('.device').waitFor();
   if(module==='weather'){
    await navigate(frame,'[data-view=weather]');await navigate(frame,'[data-weather-page=overview]');
    const sizeStyle=await frame.locator('.high-low').evaluate(e=>getComputedStyle(e).fontSize);assert(parseFloat(sizeStyle)>=20);
    for(const view of ['weather','radar','climate','compare','clock']){
     await navigate(frame,`nav [data-view=${view}]`);await page.waitForTimeout(100);
     if(view==='radar'){for(const layer of ['temperature','wind','air','rain']){await navigate(frame,`[data-map-layer=${layer}]`);const m=await frame.locator('#view-content').evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight,sh:e.scrollHeight}));assert(m.sw<=m.w+1&&m.sh<=m.h+1,`${size}/${layer} overflow ${JSON.stringify(m)}`);await page.locator('.device-stage').screenshot({path:new URL(`../test-results/${size}-${layer}.png`,import.meta.url).pathname});}}
     const dims=await frame.locator('#view-content').evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight,sh:e.scrollHeight}));
     assert(dims.sw<=dims.w+1,`${size}/${view}: horizontal ${JSON.stringify(dims)}`);if(size!=='480')assert(dims.sh<=dims.h+1,`${size}/${view}: vertical ${JSON.stringify(dims)}`);
     await page.locator('.device-stage').screenshot({path:new URL(`../test-results/${size}-${view}.png`,import.meta.url).pathname});
    }
    await navigate(frame,'[data-view=weather]');await navigate(frame,'[data-weather-page=moon]');await page.locator('.device-stage').screenshot({path:new URL(`../test-results/${size}-moon.png`,import.meta.url).pathname});
    const moon=await frame.locator('#view-content').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight}));if(size!=='480')assert(moon.sh<=moon.h+1,`${size}/moon: ${JSON.stringify(moon)}`);
    await navigate(frame,'[data-weather-page=focus]');const focus=await frame.locator('#view-content').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight}));assert(focus.sh<=focus.h+1,`${size}/focus: ${JSON.stringify(focus)}`);await page.locator('.device-stage').screenshot({path:new URL(`../test-results/${size}-focus.png`,import.meta.url).pathname});
   }else{
    const layout=await frame.locator('#player').evaluate(e=>{const box=e.getBoundingClientRect();return [...e.querySelectorAll('button,input')].filter(n=>n.getBoundingClientRect().height>0).map(n=>({id:n.id,top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,parentBottom:box.bottom}));});for(const control of layout)assert(control.bottom<=control.parentBottom+1,`${size}/radio: clipped ${JSON.stringify(control)}`);
    for(const id of ['output','custom']){await frame.locator(`[data-page=${id}]`).click({force:true});const dims=await frame.locator('.device').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight}));assert(dims.sh<=dims.h+1,`${size}/radio/${id}: ${JSON.stringify(dims)}`);await frame.locator('[data-page=player]').filter({visible:true}).click({force:true});}
   }
   await frame.locator(module==='weather'?'[data-action=home]':'#home').click({force:true});await page.locator('.tiles').waitFor();
  }
  await page.locator('[data-open=standby]').click({force:true});assert.equal(await page.locator('#standby').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(8, 11, 14)');await page.locator('#standby').click({force:true});
 }
 await page.locator('button[data-size="480x320"]').click({force:true});await page.locator('[data-mode=pixels]').click({force:true});await page.locator('.native-display-canvas').waitFor();assert.deepEqual(await page.locator('.native-display-canvas').evaluate(e=>[e.width,e.height]),[480,320]);
 await page.locator('.tile[data-open=weather]').click({force:true});await navigate(weather,'[data-weather-page=overview]');await page.waitForTimeout(1200);await page.locator('.native-display-canvas').waitFor();
 await page.locator('.device-stage').screenshot({path:new URL('../test-results/480x320-native-weather.png',import.meta.url).pathname});
 await weather.locator('[data-action=home]').click({force:true});await page.locator('#home').waitFor({state:'visible'});await page.locator('[data-mode=layout]').click({force:true});
 await page.locator('.tile[data-open=radio]').click({force:true});await radio.locator('[data-page=custom]').click({force:true});await radio.locator('#custom-name').fill('Testsender');await radio.locator('#custom-url').fill('https://example.invalid/test.mp3');await radio.locator('#station-form button').click({force:true});assert.equal(await radio.locator('#station-name').textContent(),'Testsender');
 await radio.locator('#play').click({force:true});await radio.locator('#state.error').waitFor({timeout:25000});
 assert.equal(await radio.locator('#play').textContent(),'Abspielen');
 assert.deepEqual(errors,[]);console.log('PASS: all four sizes, weather views, larger high/low, radio subpages, error, Start, standby, native Retina preview.');
}finally{await browser.close();}

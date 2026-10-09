import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import {navigate} from '../../wetterwarte/tests/navigation.mjs';
import assert from 'node:assert/strict';
const engine=process.argv.includes('webkit')?'webkit':'chrome';
const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1100},deviceScaleFactor:2});
 await page.addInitScript(()=>localStorage.setItem('wetterwarte-settings',JSON.stringify({mode:'demo',size:'480x320',view:'radar',theme:'light'})));
 await page.goto('http://127.0.0.1:5173/wetter/');
 for(const size of ['480x320','480','800','1280']){
  await page.locator(`[data-size="${size}"]`).click();let reference;
  for(const layer of ['rain','temperature','wind','air']){
   await navigate(page,`[data-map-layer=${layer}]`);
   const geometry=await page.evaluate(()=>{
    const box=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return [b.x,b.y,b.width,b.height];};
    return {map:box('.regional-map'),key:box('.rain-key'),header:box('.radar-title'),controls:box('.radar-bottom'),bar:box('.radar-preload'),overflow:document.querySelector('#view-content').scrollHeight-document.querySelector('#view-content').clientHeight,unit:document.querySelector('.radar-side h2').textContent,direction:getComputedStyle(document.querySelector('.rain-key-colors')).flexDirection};
   });
   assert(geometry.overflow<=1,`${size}/${layer}: scroll`);
   assert.equal(geometry.direction,'column-reverse');
   assert.equal(geometry.unit,{rain:'mm/h',temperature:'°C',wind:'%',air:'EAQI'}[layer]);
   if(!reference)reference=geometry;
   for(const part of ['map','header','controls','bar'])geometry[part].forEach((v,i)=>assert(Math.abs(v-reference[part][i])<1,`${size}/${layer}: ${part} moves ${JSON.stringify(geometry[part])} vs ${JSON.stringify(reference[part])}`));
   geometry.key.forEach((v,i)=>assert(Math.abs(v-reference.key[i])<1,`${size}/${layer}: color scale moves`));
   if(layer==='air'){
    assert.equal(await page.locator('.air-point').count(),3);assert.equal(await page.locator('.regional-map image,.regional-map rect').count(),0,'Point data must not become an invented field');
    assert.match(await page.locator('.radar-side').textContent(),/Ortswerte.*PM₂,₅/s);
   }
   if(layer==='wind')assert.match(await page.locator('.radar-side').textContent(),/Wind >36 km\/h/);
   await page.locator('.device').screenshot({path:`test-results/map-${layer}-${size}-${engine}.png`});
   const id=layer==='rain'?'radar':'field',before=await page.locator(`#${id}-time`).inputValue();
   await page.locator(`[data-action=play-${id}]`).click();await page.waitForTimeout(1250);assert.notEqual(await page.locator(`#${id}-time`).inputValue(),before);
   await page.locator(`[data-action=${id}-now]`).click();assert.equal(await page.locator(`[data-action=${id}-now]`).getAttribute('aria-pressed'),'true');
  }
 }
 // Rendering also handles missing point values and dates beyond today explicitly.
 const checks=await page.evaluate(async()=>{
  const {airView,airColor,fieldView}=await import('/wetter/src/ui/fields-view.ts'),{demoAir,demoField}=await import('/wetter/src/data/fields.ts');
  const air=demoAir();air.places[0].aqi.fill(null);air.places[0].pm25.fill(null);
  return {empty:airView(air,air.places[0].id,false),colors:[null,0,20,21,40,41,100,101].map(airColor),tomorrow:fieldView(demoField('temperature'),'temperature','elstal',30,false)};
 });
 assert.match(checks.empty,/Keine Daten/);assert.equal(checks.colors[0],null);assert.equal(checks.colors[1],checks.colors[2]);assert.notEqual(checks.colors[2],checks.colors[3]);assert.notEqual(checks.colors[6],checks.colors[7]);assert.match(checks.tomorrow,/map-valid-date/);
 await page.locator('[data-size="480x320"]').click();await page.locator('[data-theme=dark]').click();
 for(const layer of ['temperature','wind','air']){await navigate(page,`[data-map-layer=${layer}]`);await page.locator('.device').screenshot({path:`test-results/map-${layer}-dark-${engine}.png`});}
 console.log(`PASS ${engine}: four map products × four sizes, identical map/header/timeline geometry, vertical scales, playback/Now, point-only air, missing values and future dates.`);
}finally{await browser.close();}

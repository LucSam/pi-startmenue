import {chromium} from '../../wetterwarte/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/wetter/');
 const result=await page.evaluate(async()=>{
  const m=await import('/wetter/src/data/fields.ts');
  const fields=await Promise.all(['temperature','wind'].map(async layer=>{try{const d=await m.fetchField(layer),url=m.fieldImage(d,d.time[0]),img=await createImageBitmap(await(await fetch(url)).blob());const result={layer,run:d.runAt,time:d.time[0],count:d.time.length,step:d.time[1]-d.time[0],width:img.width,height:img.height,request:m.fieldUrl(d,d.time[0])};img.close();return result;}catch(e){return {layer,error:e.message}}}));
  let air;try{const a=await m.fetchAir();air={places:a.places.length,hours:a.time.length,valid:a.places.every(p=>p.aqi.some(v=>v!==null)&&p.pm25.some(v=>v!==null))}}catch(e){air={error:e.message}}
  return {fields,air};
 });console.log(JSON.stringify(result,null,2));
 for(const field of result.fields){assert(!field.error,field.layer+': '+field.error);assert.equal(field.width,880);assert.equal(field.height,448);assert.equal(field.step,field.layer==='wind'?21600:3600);if(field.layer==='wind')assert.equal(new URL(field.request).searchParams.get('dim_ensemble_product'),'Probabilities:>10m/s');}
 assert(result.air.valid&&result.air.places===3);
 await page.route('https://maps.dwd.de/**',r=>r.abort());await page.reload();await page.locator('.device').waitFor();
 const cached=await page.evaluate(async()=>{const m=await import('/wetter/src/data/fields.ts'),{readCache}=await import('/wetter/src/data/cache.ts');return Promise.all(['temperature','wind'].map(async l=>{const d=await readCache('field-'+l);return !!await m.loadFieldImage(d,d.time[0]);}));});assert(cached.every(Boolean));
 console.log('PASS: real DWD field rasters, native time steps, explicit wind probability product, CAMS point values and cached image recovery.');
}finally{await browser.close();}

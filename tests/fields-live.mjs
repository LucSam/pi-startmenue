import {chromium} from '../../wetterwarte/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/wetter/');
 const result=await page.evaluate(async()=>{
  const m=await import('/wetter/src/data/fields.ts');
  const fields=await Promise.all(['temperature','wind'].map(async layer=>{try{const d=await m.fetchField(layer),url=m.fieldImage(d,d.time[0]),img=await createImageBitmap(await(await fetch(url)).blob());
   const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
   const {projector}=await import('/wetter/src/ui/geography.ts'),{RADAR_EXTENT}=await import('/wetter/src/data/radar.ts'),{PLACES}=await import('/wetter/src/config.ts'),project=projector(RADAR_EXTENT,img.width,img.height);
   const pixels=PLACES.map(p=>{const [x,y]=project(p.lon,p.lat);return {place:p.id,rgba:[...ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data]};});
   let legendMatches; if(layer==='wind'){
    const legendUrl=new URL(m.fieldUrl(d,d.time[0]));legendUrl.searchParams.set('request','GetLegendGraphic');legendUrl.searchParams.set('layer','dwd:'+m.FIELD_CONFIG.wind.layer);legendUrl.searchParams.set('style',m.FIELD_CONFIG.wind.style);legendUrl.searchParams.set('format','application/json');
    const legend=await(await fetch(legendUrl)).json(),entries=legend.Legend[0].rules[0].symbolizers[0].Raster.colormap.entries;
    legendMatches=Number(entries[0].quantity)===1&&Number(entries[0].opacity)<.001&&entries.slice(1).every((e,i)=>e.color.toLowerCase()===m.WIND_COLORS[i].toLowerCase());
   }
   const result={layer,run:d.runAt,time:d.time[0],count:d.time.length,step:d.time[1]-d.time[0],width:img.width,height:img.height,pixels,legendMatches,request:m.fieldUrl(d,d.time[0])};img.close();return result;}catch(e){return {layer,error:e.message}}}));
  let air;try{const a=await m.fetchAir(),i=a.time.findIndex(t=>t>=Math.floor(Date.now()/3600000)*3600);air={places:a.places.length,hours:a.time.length,valid:a.places.every(p=>p.aqi.some(v=>v!==null)&&p.pm25.some(v=>v!==null)),current:a.places.map(p=>({place:p.id,aqi:p.aqi[i],pm25:p.pm25[i]}))}}catch(e){air={error:e.message}}
  return {fields,air};
 });console.log(JSON.stringify(result,null,2));
 for(const field of result.fields){assert(!field.error,field.layer+': '+field.error);assert.equal(field.width,880);assert.equal(field.height,448);assert.equal(field.step,field.layer==='wind'?21600:3600);if(field.layer==='wind'){assert.equal(new URL(field.request).searchParams.get('dim_ensemble_product'),'Probabilities:>10m/s');assert(field.legendMatches,'Wind palette must match the official DWD legend');}}
 assert(result.air.valid&&result.air.places===3);
 await page.route('https://maps.dwd.de/**',r=>r.abort());await page.reload();await page.locator('.device').waitFor();
 const cached=await page.evaluate(async()=>{const m=await import('/wetter/src/data/fields.ts'),{readCache}=await import('/wetter/src/data/cache.ts');return Promise.all(['temperature','wind'].map(async l=>{const d=await readCache('field-'+l);return !!await m.loadFieldImage(d,d.time[0]);}));});assert(cached.every(Boolean));
 console.log('PASS: real DWD field rasters, native time steps, explicit wind probability product, CAMS point values and cached image recovery.');
}finally{await browser.close();}

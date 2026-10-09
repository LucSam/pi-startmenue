import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const png=await readFile(new URL('fixtures/dwd-rv-contour-20261008.png',import.meta.url));
for(const engine of ['chrome','webkit']){
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/wetter/');
  const result=await page.evaluate(async base64=>{
   const {remapRadarPixels,RAIN_CLASSES}=await import('/wetter/src/data/radar.ts');
   const bitmap=await createImageBitmap(await(await fetch('data:image/png;base64,'+base64)).blob()),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;remapRadarPixels(data);
   let mapped=0,masked=0;const colors=new Set(RAIN_CLASSES.map(c=>c.color.toLowerCase()));
   for(let i=0;i<data.length;i+=4){if(!data[i+3])continue;const rgb=[data[i],data[i+1],data[i+2]];if(Math.max(...rgb)-Math.min(...rgb)<12){masked++;continue;}const hex='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');if(!colors.has(hex))throw Error('Unexpected output colour '+hex);mapped++;}return {mapped,masked};
  },png.toString('base64'));
  assert(result.mapped>14000);assert(result.masked>123000);console.log(engine,'PASS official DWD PNG with contour:',result);
 }finally{await browser.close();}
}

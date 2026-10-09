import {navigate} from '../../wetterwarte/tests/navigation.mjs';
import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import {mkdir} from 'node:fs/promises';
await mkdir('test-results',{recursive:true});
const safari=process.argv.includes('webkit');const browser=await (safari?webkit:chromium).launch(safari?{headless:true}:{channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1100},deviceScaleFactor:2});
 await page.addInitScript(()=>{localStorage.setItem('pi-startmenue',JSON.stringify({size:'480x320',theme:'light',weatherMode:'demo',idle:0}));localStorage.setItem('wetterwarte-display-preview',JSON.stringify({mode:'physical',pxPerMm:6,calibrated:true,dpr:2}));});
 await page.goto('http://127.0.0.1:5173/');await page.locator('.tile[data-open=weather]').click();
 const weather=page.frameLocator('[data-module=weather]');await navigate(weather,'nav [data-view=radar]');await page.waitForTimeout(1300);
 await page.locator('.device-stage').screenshot({path:`test-results/alignment-${safari?'webkit':'chrome'}.png`});
 for(const [module,selector] of [['weather','[data-action=home]'],['weather','#header-clock'],['weather','#place-button'],['radio','#play'],['radio','#next']]){
  if(module==='radio'&&await page.locator('[data-module=radio]').isHidden()){await weather.locator('[data-action=home]').click();await page.locator('.tile[data-open=radio]').click();}
  const frame=page.frameLocator(`[data-module=${module}]`),target=frame.locator(selector);
  await target.evaluate(e=>e.style.setProperty('background-color','rgb(255,0,0)','important'));await page.waitForTimeout(500);
  const actual=await target.boundingBox(),stage=await page.locator('.device-stage').boundingBox();
  const pixels=await page.locator('.native-display-canvas').evaluate(canvas=>{const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let x1=canvas.width,y1=canvas.height,x2=-1,y2=-1;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;if(p[i]>240&&p[i+1]<5&&p[i+2]<5){x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);}}return {x1,y1,x2,y2,w:canvas.width,h:canvas.height};});
  const visual={x:stage.x+(pixels.x1+pixels.x2+1)/2/pixels.w*stage.width,y:stage.y+(pixels.y1+pixels.y2+1)/2/pixels.h*stage.height};
  console.log(module,selector,{actual,visual,delta:{x:visual.x-(actual.x+actual.width/2),y:visual.y-(actual.y+actual.height/2)}});
  await target.evaluate(e=>e.style.removeProperty('background-color'));
 }
}finally{await browser.close();}

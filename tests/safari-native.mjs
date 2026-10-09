import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:7050';let id,driverScale=1;
async function call(path,body,method=body===undefined?'GET':'POST'){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(data.value?.error)throw Error(data.value.message);return data.value;}
const js=async(script,...args)=>call(`/session/${id}/execute/sync`,{script,args});
// SafariDriver uses window pixels under per-site zoom; calibrate test actions
// against one real pointer event. Application input never assumes this factor.
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(script){for(let i=0;i<80;i++){if(await js(script))return;await delay(150);}throw Error('Timeout: '+script);}
async function click(x,y){await call(`/session/${id}/actions`,{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,x:Math.round(x*driverScale),y:Math.round(y*driverScale)},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});await delay(180);}
async function visiblePoint(module,selector,fx=.5,fy=.5){
 await js(`const d=arguments[0]?document.querySelector('[data-module="'+arguments[0]+'"]').contentDocument:document;d.querySelector(arguments[1]).style.setProperty('background-color','rgb(255,0,0)','important');`,module,selector);if(!module)await js("window.dispatchEvent(new Event('resize'));");await delay(700);
 const result=await js(`const c=document.querySelector('.native-display-canvas');if(!c)return null;const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=-1,b=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(p[i]>240&&p[i+1]<5&&p[i+2]<5){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}}const s=c.getBoundingClientRect();return {x:s.x+(l+(r-l)*arguments[0])/c.width*s.width,y:s.y+(t+(b-t)*arguments[1])/c.height*s.height,l,t,r,b};`,fx,fy);
 if(!result||result.r<0)throw Error('No visible pixel target: '+selector);
 await js(`const d=arguments[0]?document.querySelector('[data-module="'+arguments[0]+'"]').contentDocument:document;d.querySelector(arguments[1]).style.removeProperty('background-color');`,module,selector);
 return result;
}
async function hit(module,selector,fx=.5,fy=.5){const p=await visiblePoint(module,selector,fx,fy);await click(p.x,p.y);}

try{
 id=(await call('/session',{capabilities:{alwaysMatch:{browserName:'safari'}}})).sessionId;
 await call(`/session/${id}/window/rect`,{width:1440,height:1100});await call(`/session/${id}/url`,{url:'http://127.0.0.1:5173/'});
 await js(`localStorage.removeItem('pi-radio');localStorage.removeItem('wetterwarte-settings');localStorage.setItem('pi-startmenue',JSON.stringify({size:'480x320',theme:'light',weatherMode:'demo',idle:0}));localStorage.setItem('wetterwarte-display-preview',JSON.stringify({mode:'physical',pxPerMm:7,calibrated:true}));`);
 await call(`/session/${id}/refresh`,{});await wait("return !!document.querySelector('.native-display-canvas')");
 await js("document.addEventListener('pointerdown',e=>window.__driverPoint={x:e.clientX,y:e.clientY},{once:true,capture:true});");await click(40,40);const reported=await js('return window.__driverPoint');driverScale=40/reported.x;console.log('SafariDriver coordinate conversion',driverScale);
 for(const fraction of [.08,.5,.92]){
  await hit(null,'.tile[data-open=radio]',fraction);await wait("return !document.querySelector('[data-module=radio]').hidden");
  await js("document.querySelector('[data-module=radio]').contentDocument.querySelector('#audio').volume=0");await hit('radio','#mute',fraction);assert(await js("return document.querySelector('[data-module=radio]').contentDocument.querySelector('#audio').muted"),'Mute at '+fraction);
  await hit('radio','#mute',fraction);assert(!await js("return document.querySelector('[data-module=radio]').contentDocument.querySelector('#audio').muted"),'Unmute');
  await hit('radio','#play',fraction);await wait("return document.querySelector('[data-module=radio]').contentDocument.querySelector('#play').textContent==='Stoppen'");
  await hit('radio','#play',fraction);
  for(const station of ['cosmo','beats','purefm','radioeins']){await hit('radio',`[data-station=${station}]`,fraction);assert.equal(await js("return document.querySelector('[data-module=radio]').contentDocument.querySelector('.station[aria-pressed=true]').dataset.station"),station);await hit('radio','#play',fraction);}
  await hit('radio','#next',fraction);assert.match(await js("return document.querySelector('[data-module=radio]').contentDocument.querySelector('#page-number').textContent"),/2 von 2/);
  await hit('radio','#previous',fraction);
  await hit('radio','[data-page=custom]',fraction);await wait("return !document.querySelector('[data-module=radio]').contentDocument.querySelector('#custom').hidden");
  await hit('radio','#custom [data-page=player]',fraction);
  await hit('radio','#home',fraction);await wait("return !document.querySelector('#home').hidden");
  await hit(null,'.tile[data-open=weather]',fraction);await wait("return !document.querySelector('[data-module=weather]').hidden");
  await hit('weather','#place-button',fraction);await hit('weather','button[data-place=berlin]',fraction);assert.equal(await js("return document.querySelector('[data-module=weather]').contentDocument.querySelector('#place').value"),'berlin');
  await hit('weather','[data-weather-page=moon]',fraction);await wait("return document.querySelector('[data-module=weather]').contentDocument.querySelector('[data-weather-page=moon]').getAttribute('aria-pressed')==='true'");
  await hit('weather','#header-clock',fraction);assert(await js("return document.querySelector('#home').hidden"),'Clock must not invoke Start');
  await hit('weather','[data-action=home]',fraction);await wait("return !document.querySelector('#home').hidden");
  console.log('Safari PASS button width fraction',fraction);
 }

 await hit(null,'.tile[data-open=radio]');await hit('radio','[data-page=custom]');
 for(const [selector,value] of [['#custom-name','Safari Testsender'],['#custom-url','https://example.invalid/safari.mp3']]){
  await hit('radio',selector);const e=await call(`/session/${id}/element`,{using:'css selector',value:'.input-proxy'});await call(`/session/${id}/element/${e['element-6066-11e4-a52e-4f735466cecf']}/value`,{text:value});
 }
 await hit('radio','#station-form button');assert.equal(await js("return document.querySelector('[data-module=radio]').contentDocument.querySelector('#station-name').textContent"),'Safari Testsender');
 assert(await js("return JSON.parse(localStorage.getItem('pi-radio')).custom.some(s=>s.name==='Safari Testsender')"));
 await hit('radio','#home');await hit(null,'.tile[data-open=weather]');await hit('weather','nav [data-view=radar]');
 for(const layer of ['temperature','wind','air','rain']){await hit('weather',`[data-map-layer=${layer}]`);assert.equal(await js("return document.querySelector('[data-module=weather]').contentDocument.querySelector('[data-map-layer][aria-pressed=true]').dataset.mapLayer"),layer);}
 console.log('Safari PASS: all four presets, place menu, typed custom station, saved form and map layers.');
 await mkdir('test-results',{recursive:true});await writeFile('test-results/safari-native.png',Buffer.from(await call(`/session/${id}/screenshot`),'base64'));
 console.log('PASS installed Safari: visible left, centre and right portions of radio/weather controls.');
}catch(error){if(id){await mkdir('test-results',{recursive:true});await writeFile('test-results/safari-failure.png',Buffer.from(await call(`/session/${id}/screenshot`),'base64'));}throw error;}finally{if(id)await call(`/session/${id}`,undefined,'DELETE');}

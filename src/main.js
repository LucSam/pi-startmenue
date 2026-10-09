import {inputSurface} from './input-surface.js';
import {profiles,read,save,preview,widthMm,snapshot} from './preview.js';
const weatherSettings=read('wetterwarte-settings',{});
const settings=read('pi-startmenue',{size:weatherSettings.size??'480x320',theme:weatherSettings.theme??'auto',weatherMode:weatherSettings.mode??'demo',idle:10});
if(!Object.hasOwn(profiles,settings.size))settings.size='480x320';
const kiosk=new URLSearchParams(location.search).get('kiosk')==='1';
document.documentElement.classList.toggle('kiosk',kiosk);
const $=s=>document.querySelector(s),device=$('#device'),stage=$('.device-stage');
const modules=await fetch('./modules.json').then(r=>r.json());
let active='home',lastActivity=Date.now(),solarTheme='light',captureTimer,captureVersion=0,radioPlaying=false;
const frames=new Map(),observers=new Map();
const source=()=>({element:(frames.has(active)?frames.get(active).contentDocument?.querySelector('.device'):device)??device,...profiles[settings.size]});
inputSurface(stage,source,structural=>{activity();requestCapture(structural);});

const clock=()=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}).format(new Date());
const date=()=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
const icons={weather:'<path d="M16 30a9 9 0 1 1 14-8 7 7 0 1 1 3 14H14a6 6 0 0 1 2-12"/><path d="M20 3v4M5 18h4M8 7l3 3M32 6l-3 4M19 42l-2 4M29 42l-2 4"/>',radio:'<rect x="5" y="14" width="38" height="29" rx="4"/><path d="M10 14L36 3M29 23h7M29 30h7"/><circle cx="17" cy="28" r="6"/>'};
for(const m of modules){
 const tile=document.createElement('button');tile.className='tile';tile.dataset.open=m.id;tile.innerHTML=`<svg viewBox="0 0 48 48" aria-hidden="true">${icons[m.icon]??icons.radio}</svg><strong></strong>`;tile.querySelector('strong').textContent=m.title;$('#tiles').append(tile);
 const frame=document.createElement('iframe');frame.className='module-frame';frame.title=m.title;frame.dataset.module=m.id;frame.hidden=true;frame.allow='autoplay';frame.src=`${m.path}?embedded=1`;frames.set(m.id,frame);$('#modules').append(frame);
 frame.addEventListener('load',()=>{
  configure(frame);observers.get(m.id)?.disconnect();
  const doc=frame.contentDocument;
  if(!doc?.querySelector('#app,.device')){
   const panel=document.createElement('section');panel.className='module-error';panel.dataset.errorModule=m.id;panel.hidden=active!==m.id;
   const message=document.createElement('p');message.textContent=m.title+' ist nicht erreichbar.';const back=document.createElement('button');back.dataset.open='home';back.textContent='Start';const retry=document.createElement('button');retry.textContent='Erneut öffnen';retry.onclick=()=>{panel.remove();frame.src=frame.src;};panel.append(message,retry,back);device.append(panel);requestCapture();return;
  }
  const observer=new MutationObserver(changes=>{if(active===m.id)requestCapture(changes.some(c=>c.type==='childList'&&[...c.addedNodes,...c.removedNodes].some(n=>n.nodeType===1)||c.type==='attributes'&&['hidden','class'].includes(c.attributeName)));});observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});observers.set(m.id,observer);requestCapture(true);
 });
}
function configure(frame){frame.contentWindow?.postMessage({protocol:'pi-display-v1',type:'configure',settings},location.origin);}
function applyTheme(){document.documentElement.dataset.theme=settings.theme==='auto'?solarTheme:settings.theme;}
function fit(){
 stage.dataset.inputMode=kiosk?'layout':preview.mode;const p=profiles[settings.size];let scale=kiosk?Math.min(innerWidth/p.width,innerHeight/p.height):preview.mode==='physical'?widthMm(p)*preview.pxPerMm/p.width:preview.mode==='pixels'?2:Math.min(1,Math.max(280,innerWidth-48)/p.width);
 stage.style.width=`${p.width*scale}px`;stage.style.height=`${p.height*scale}px`;device.style.width=`${p.width}px`;device.style.height=`${p.height}px`;device.style.transform=`scale(${scale})`;device.dataset.size=settings.size;
 $('#sizes').innerHTML=Object.entries(profiles).map(([key,p])=>`<button data-size="${key}" aria-pressed="${key===settings.size}">${p.label}</button>`).join('');
 $('#modes').innerHTML=[['layout','Arbeitsansicht'],['physical','Originalgröße'],['pixels','Pixelraster 2×']].map(([key,label])=>`<button data-mode="${key}" aria-pressed="${key===preview.mode}">${label}</button>`).join('');
 $('#ruler').style.width=`${100*preview.pxPerMm}px`;
 $('#preview-note').textContent=`${p.width} × ${p.height} Pixel · ${p.inches.toLocaleString('de-DE')}″ · ${preview.mode==='physical'?(preview.calibrated?'kalibrierte':'unkalibrierte')+' Originalgröße':preview.mode==='pixels'?'native Pixel, zweifach vergrößert':'Arbeitsansicht'}${p.rgb565?' · RGB565':''}. Bildfläche aus Diagonale geschätzt; keine Simulation von Helligkeit oder Touchdruck.`;
 for(const frame of frames.values())configure(frame);save('pi-startmenue',settings);requestCapture(true);
}
function open(id){
 if(!['home','standby',...frames.keys()].includes(id))return;
 active=id;lastActivity=Date.now();$('#home').hidden=id!=='home';$('#standby').hidden=id!=='standby';for(const [key,frame] of frames)frame.hidden=key!==id;document.querySelectorAll('[data-error-module]').forEach(panel=>panel.hidden=panel.dataset.errorModule!==id);
 document.title=`Raspberry Pi · ${id==='home'?'Start':id==='standby'?'Standby':modules.find(m=>m.id===id)?.title}`;
 if(id==='standby')$('#standby').focus();else if(id==='home')$('#home [data-open]')?.focus();
 tick();requestCapture(true);
}
function requestCapture(structural=false){
 clearTimeout(captureTimer);captureVersion++;
 if(kiosk||preview.mode==='layout'){stage.querySelector('canvas')?.remove();delete stage.dataset.rasterPending;$('#raster-status').textContent='';return;}
 // Keep the native image until its replacement is complete. The input shield
 // waits too: old pixels must never activate the new view's hidden controls.
 if(structural&&stage.querySelector('canvas'))stage.dataset.rasterPending='true';captureTimer=setTimeout(capture,40);
}
async function capture(){
 const version=captureVersion,p=profiles[settings.size],{element}=source();
 try{const canvas=await snapshot(element,p.width,p.height,p.rgb565);if(version!==captureVersion)return;canvas.className='native-display-canvas';canvas.setAttribute('aria-hidden','true');const previous=stage.querySelector('canvas');if(previous)previous.replaceWith(canvas);else stage.insertBefore(canvas,stage.querySelector('.display-input-surface'));delete stage.dataset.rasterPending;$('#raster-status').textContent=`${p.width} × ${p.height} native Rasterpixel${p.rgb565?' · RGB565':''} · Maus / Touch aktiv`;}
 catch{if(version===captureVersion){stage.querySelector('canvas')?.remove();delete stage.dataset.rasterPending;$('#raster-status').textContent='Pixelansicht nicht verfügbar; skalierte Browseransicht sichtbar.';}}
}
function tick(){const time=clock();if($('#standby-time').textContent!==time){$('#standby-time').textContent=time;$('.local-time').textContent=time;$('#home-date').textContent=date();$('#standby-date').textContent=date();requestCapture();}if(settings.idle>0&&active!=='standby'&&Date.now()-lastActivity>settings.idle*60000)open('standby');}
function activity(){lastActivity=Date.now();}
document.addEventListener('pointerdown',activity,{passive:true});document.addEventListener('keydown',e=>{activity();if(e.key==='Escape')open('home');});
document.addEventListener('click',e=>{
 const button=e.target.closest('button');if(!button)return;
 if(button.dataset.open)open(button.dataset.open);
 if(button.dataset.size){settings.size=button.dataset.size;fit();}
 if(button.dataset.mode){preview.mode=button.dataset.mode;save('wetterwarte-display-preview',preview);fit();}
 if(button.id==='standby'||button.closest('#standby'))open('home');
 if(button.id==='calibrate'){
  const mm=Number($('#measured-mm').value),factor=$('#ruler').getBoundingClientRect().width/mm;
  if(mm>=20&&mm<=300&&factor>=1&&factor<=15){preview.pxPerMm=factor;preview.calibrated=true;preview.dpr=devicePixelRatio;save('wetterwarte-display-preview',preview);fit();}else $('#preview-note').textContent='Gemessene Länge zwischen 20 und 300 mm eintragen.';
 }
});
for(const [id,key] of [['theme','theme'],['weather-mode','weatherMode'],['idle','idle']]){$('#'+id).value=String(settings[key]);$('#'+id).addEventListener('change',e=>{settings[key]=key==='idle'?Number(e.target.value):e.target.value;applyTheme();fit();});}
window.addEventListener('message',e=>{
 if(e.origin!==location.origin||e.data?.protocol!=='pi-display-v1')return;
 const entry=[...frames].find(([,frame])=>e.source===frame.contentWindow);if(!entry)return;
 const [id,frame]=entry;
 if(e.data.type==='ready')configure(frame);
 if(e.data.type==='home')open('home');
 if(e.data.type==='activity')activity();
 if(e.data.type==='appearance'&&id==='weather'&&['light','dark'].includes(e.data.theme)){solarTheme=e.data.theme;applyTheme();frames.get('radio')?.contentWindow?.postMessage({protocol:'pi-display-v1',type:'appearance',theme:document.documentElement.dataset.theme},location.origin);}
 if(e.data.type==='radio-state'){radioPlaying=e.data.playing===true;$('#now-playing').hidden=!radioPlaying;$('#now-playing').textContent=`Radio · ${String(e.data.station??'').slice(0,60)}`;}
 if(e.data.type==='rendered'&&active===id)requestCapture();
});
window.addEventListener('resize',fit);setInterval(tick,1000);applyTheme();fit();tick();
// The production shell caches all three applications. A reload cannot resume audio without a user gesture.
fetch('/health').then(r=>r.json()).then(({dev})=>{if(!dev&&'serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js');}).catch(()=>{});

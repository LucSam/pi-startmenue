export const profiles={
 '480x320':{width:480,height:320,inches:3.5,rgb565:true,label:'480 × 320 · 3,5″'},
 '480':{width:480,height:480,inches:4,label:'480 × 480'},
 '800':{width:800,height:480,inches:4.3,label:'800 × 480'},
 '1280':{width:1280,height:720,inches:5,label:'1280 × 720'},
};
export function read(key,fallback){try{return {...fallback,...JSON.parse(localStorage.getItem(key)??'{}')};}catch{return {...fallback};}}
export function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Browser storage can be disabled; the current session still works. */}}
export const preview=read('wetterwarte-display-preview',{mode:'layout',pxPerMm:96/25.4,calibrated:false,dpr:devicePixelRatio});
if(!['layout','physical','pixels'].includes(preview.mode))preview.mode='layout';
if(!Number.isFinite(preview.pxPerMm)||preview.pxPerMm<1||preview.pxPerMm>15)preview.pxPerMm=96/25.4;
export const widthMm=p=>p.inches*25.4*p.width/Math.hypot(p.width,p.height);
// Native snapshots of the active module, not Retina-resolution screenshots.
export async function snapshot(element,width,height,rgb565){
 const doc=element.ownerDocument;await doc.fonts.ready;
 const clone=element.cloneNode(true);clone.style.cssText=`width:${width}px!important;height:${height}px!important;transform:none!important;border-radius:0!important;box-shadow:none!important;position:relative!important;inset:auto!important;transition:none!important`;
 clone.querySelectorAll('iframe').forEach(frame=>frame.remove());
 const originals=element.querySelectorAll('input,select');clone.querySelectorAll('input,select').forEach((e,i)=>{e.setAttribute('value',originals[i].value);if(e.tagName==='SELECT')for(const option of e.options)option.toggleAttribute('selected',option.value===originals[i].value);});
 await Promise.all([...clone.querySelectorAll('image,img')].map(async image=>{
  const attr=image.localName==='image'?'href':'src',src=image.getAttribute(attr);if(!src||src.startsWith('data:')||src.startsWith('#'))return;
  const response=await fetch(new URL(src,doc.baseURI));if(!response.ok)throw Error('Bild nicht verfügbar');
  const blob=await response.blob(),data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});image.setAttribute(attr,data);
 }));
 const css=[...doc.styleSheets].map(sheet=>[...sheet.cssRules].map(rule=>rule.cssText).join('\n')).join('\n');
 const wrap=document.createElement('div');wrap.setAttribute('xmlns','http://www.w3.org/1999/xhtml');wrap.style.cssText=`width:${width}px;height:${height}px;overflow:hidden`;
 // Preserve the module's layout context (especially its embedded display rules).
 wrap.className=doc.documentElement.className;
 const style=document.createElement('style');style.textContent=css;wrap.append(style,clone);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" data-theme="${doc.documentElement.dataset.theme??'light'}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(wrap)}</foreignObject></svg>`;
 const img=new Image();img.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;await img.decode();
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
 if(rgb565){const pixels=ctx.getImageData(0,0,width,height);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=Math.round(Math.round(pixels.data[i]/255*31)/31*255);pixels.data[i+1]=Math.round(Math.round(pixels.data[i+1]/255*63)/63*255);pixels.data[i+2]=Math.round(Math.round(pixels.data[i+2]/255*31)/31*255);}ctx.putImageData(pixels,0,0);}
 return canvas;
}

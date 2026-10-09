// Pointer coordinates are resolved in the module's unscaled document. No pointer
// is sent through a transformed iframe (Safari can hit-test that at the wrong scale).
export function inputSurface(stage,source,changed){
 const surface=document.createElement('div');surface.className='display-input-surface';stage.append(surface);
 let range=null,gesture=null,suppressClick=false;
 const pending=()=>stage.dataset.rasterPending==='true';
 function targetAt(event){
  const {element,width,height}=source(),box=surface.getBoundingClientRect();if(!element||!box.width||!box.height)return;
  const x=(event.clientX-box.left)/box.width*width,y=(event.clientY-box.top)/box.height*height;
  if(element.ownerDocument===document){
   // The home screen lives in the parent document; remove the shield for lookup.
   surface.style.pointerEvents='none';const target=document.elementFromPoint(event.clientX,event.clientY);surface.style.pointerEvents='';return {target,x,y};
  }
  // Safari's per-site page zoom is included in iframe DOMRects and hit testing,
  // but not in the native SVG raster. Measure it instead of assuming 1 CSS px.
  const content=element.getBoundingClientRect(),cx=content.left+x/width*content.width,cy=content.top+y/height*content.height;
  return {target:element.ownerDocument.elementFromPoint(cx,cy),x:cx,y:cy};
 }
 function slider(input,x){const r=input.getBoundingClientRect(),low=Number(input.min)||0,high=Number(input.max)||100,step=Number(input.step)||1;const usable=Math.max(1,r.width-24),fraction=Math.max(0,Math.min(1,(x-r.left-12)/usable));input.value=String(low+Math.round((high-low)*fraction/step)*step);input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));changed(false);}
 function forward(event,hit,target){
  const doc=target.ownerDocument??target;
  return target.dispatchEvent(new doc.defaultView.PointerEvent(event.type,{bubbles:true,cancelable:true,pointerId:event.pointerId,pointerType:event.pointerType,isPrimary:event.isPrimary,button:event.button,buttons:event.buttons,clientX:hit.x,clientY:hit.y}));
 }
 surface.addEventListener('pointerdown',event=>{
  if(event.target.closest('.input-proxy'))return;
  if(!event.isPrimary){if(gesture)forward(event,gesture.last,gesture.doc);gesture=null;range=null;suppressClick=true;return;}
  suppressClick=false;
  if(pending()){suppressClick=true;event.preventDefault();return;}
  const hit=targetAt(event),input=hit?.target?.closest('input[type=range]');
  if(input){event.preventDefault();range=input;surface.setPointerCapture(event.pointerId);slider(input,hit.x);}
  else if(hit?.target?.ownerDocument!==document&&hit?.target){gesture={doc:hit.target.ownerDocument,last:hit};surface.setPointerCapture(event.pointerId);forward(event,hit,hit.target);}
 });
 surface.addEventListener('pointermove',event=>{if(range){event.preventDefault();const hit=targetAt(event);if(hit)slider(range,hit.x);}else if(gesture){const hit=targetAt(event);if(hit){gesture.last=hit;if(!forward(event,hit,gesture.doc))event.preventDefault();}}});
 surface.addEventListener('pointerup',event=>{
  if(range){event.preventDefault();const input=range;range=null;suppressClick=true;input.dispatchEvent(new input.ownerDocument.defaultView.Event('change',{bubbles:true}));changed(true);}
  else if(gesture){const current=gesture;gesture=null;if(!forward(event,targetAt(event)??current.last,current.doc)){suppressClick=true;event.preventDefault();changed(true);}}
 });
 surface.addEventListener('pointercancel',event=>{range=null;if(gesture)forward(event,gesture.last,gesture.doc);gesture=null;suppressClick=true;});
 surface.addEventListener('click',event=>{
  if(event.target.closest('.input-proxy'))return;
  event.preventDefault();event.stopPropagation();if(suppressClick||pending()){suppressClick=false;return;}const hit=targetAt(event);let target=hit?.target;
  if(!target||target===surface)return;
  const control=target.closest('button,a,input,select,textarea,label,[data-year],[data-climate-cell]');if(!control||control.disabled||control.matches('input[type=range]'))return;
  if(control.matches('select,input:not([type=button]):not([type=submit]),textarea')){
   // Real, untransformed controls preserve Safari's keyboard, picker and caret.
   surface.querySelector('.input-proxy')?.remove();
   const proxy=control.cloneNode(true),r=control.getBoundingClientRect(),s=source(),content=s.element.getBoundingClientRect();proxy.classList.add('input-proxy');proxy.removeAttribute('id');proxy.removeAttribute('aria-hidden');proxy.removeAttribute('tabindex');
   Object.assign(proxy.style,{left:(r.left-content.left)/content.width*100+'%',top:(r.top-content.top)/content.height*100+'%',width:r.width/content.width*100+'%',height:r.height/content.height*100+'%',fontSize:Math.max(14,parseFloat(getComputedStyle(control).fontSize)*surface.clientWidth/s.width)+'px'});
   proxy.value=control.value;surface.append(proxy);proxy.focus();
   for(const name of ['input','change'])proxy.addEventListener(name,()=>{control.value=proxy.value;control.dispatchEvent(new control.ownerDocument.defaultView.Event(name,{bubbles:true}));changed(false);});
   proxy.addEventListener('click',e=>e.stopPropagation());proxy.addEventListener('keydown',e=>{if(e.key==='Enter'&&control.form){e.preventDefault();control.form.requestSubmit();proxy.remove();changed(true);}if(e.key==='Escape')proxy.blur();});proxy.addEventListener('blur',()=>{proxy.remove();changed(false);},{once:true});
   if(proxy.tagName==='SELECT'){try{proxy.showPicker?.();}catch{/* Keyboard selection remains available. */}}
  }else{
   surface.querySelector('.input-proxy')?.blur();
   control.click?.();if(!control.click)control.dispatchEvent(new control.ownerDocument.defaultView.MouseEvent('click',{bubbles:true}));changed(true);
  }
 });
 return surface;
}

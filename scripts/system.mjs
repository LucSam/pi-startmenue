import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
const destination=['org.freedesktop.login1','/org/freedesktop/login1','org.freedesktop.login1.Manager'];
const permissionError='Herunterfahren ist für diesen Benutzer nicht freigegeben.';

export function createPowerControl({platform=process.platform,run=execute,now=Date.now}={}){
 const call=(method,...args)=>run('/usr/bin/busctl',['--system','--allow-interactive-authorization=no','--timeout=4s','call',...destination,method,...args],{timeout:5000,maxBuffer:16384,env:{...process.env,LC_ALL:'C'}});
 return {
  async capabilities(){
   if(platform!=='linux')return {supported:false,canPowerOff:false};
   try{
    const {stdout}=await call('CanPowerOff');
    const capability=stdout.trim().match(/^s "([a-z-]+)"$/)?.[1];
    return {supported:true,canPowerOff:capability==='yes',...(capability==='yes'?{}:{error:capability?.includes('inhibitor')?'Ein Programm verhindert gerade das Herunterfahren.':permissionError})};
   }catch{return {supported:true,canPowerOff:false,error:'Die Ausschaltfunktion des Systems ist nicht erreichbar.'};}
  },
  async powerOff(){
   if(platform!=='linux')throw Error('Herunterfahren wird auf diesem System nicht unterstützt.');
   // logind owns the scheduled action, so the HTTP response can reach the display first.
   await call('ScheduleShutdown','st','poweroff',String(BigInt(now()+3000)*1000n));
  }
 };
}

export function createSystemHandler({control=createPowerControl()}={}){
 let pending=false;
 const reply=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
 return async(req,res)=>{
  if(req.method==='GET'){
   try{reply(res,200,{...await control.capabilities(),pending});}
   catch{reply(res,503,{supported:true,canPowerOff:false,error:'Die Ausschaltfunktion des Systems ist nicht erreichbar.'});}
   return;
  }
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');reply(res,405,{error:'Methode nicht erlaubt.'});return;}
  const host=req.headers.host??'';
  if(!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)||req.headers.origin!==`http://${host}`||req.headers['x-pi-system']!=='1'){
   reply(res,403,{error:'Herunterfahren ist nur über das lokale Startmenü möglich.'});return;
  }
  if((req.headers['content-type']??'').split(';')[0].trim()!=='application/json'){
   reply(res,415,{error:'JSON erforderlich.'});return;
  }
  let body;
  try{
   const chunks=[];let bytes=0;
   for await(const chunk of req){bytes+=chunk.length;if(bytes>1024){reply(res,413,{error:'Anfrage zu groß.'});return;}chunks.push(chunk);}
   body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{reply(res,400,{error:'Ungültige Anfrage.'});return;}
  if(!body||Array.isArray(body)||body.action!=='poweroff'||Object.keys(body).length!==1){reply(res,400,{error:'Unbekannte Aktion.'});return;}
  if(pending){reply(res,409,{error:'Herunterfahren wurde bereits angefordert.'});return;}
  pending=true;
  try{
   const capabilities=await control.capabilities();
   if(!capabilities.supported||!capabilities.canPowerOff){
    pending=false;reply(res,403,{error:capabilities.error??permissionError});return;
   }
   await control.powerOff();
   reply(res,202,{accepted:true});
  }catch{
   pending=false;reply(res,503,{error:'Das System hat die Ausschaltanforderung nicht bestätigt. Bitte den Strom angeschlossen lassen.'});
  }
 };
}

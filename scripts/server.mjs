import http from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
export async function safeFile(directory,path){
 const base=await realpath(directory),target=await realpath(resolve(base,'.'+path));
 if(target!==base&&!target.startsWith(base+sep))throw Error('Invalid path');
 return (await stat(target)).isFile()?target:resolve(target,'index.html');
}
export async function createServer({dev=false}={}){
 const modules=JSON.parse(await readFile(resolve(root,'modules.json'),'utf8'));
 return http.createServer(async(req,res)=>{
  if(!['127.0.0.1','localhost','[::1]'].includes((req.headers.host??'').replace(/:\d+$/,''))){res.writeHead(403).end('Local access only');return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const url=new URL(req.url,'http://localhost');let path;
  try{path=decodeURIComponent(url.pathname);}catch{res.writeHead(400).end();return;}
  if(path==='/'&&dev)res.setHeader('Cache-Control','no-store');
  if(path==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,dev}));return;}
  if(path==='/modules.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(modules.map(({directory,...m})=>m)));return;}
  const module=modules.find(m=>path.startsWith(m.path));
  if(module?.id==='radio'&&path===module.path+'api/now-playing'){
   const {serveMetadata}=await import(pathToFileURL(resolve(root,module.directory,'server/metadata.mjs')));
   await serveMetadata(req,res,url);return;
  }
  if(dev&&module?.id==='weather'){
   const proxy=http.request({hostname:'127.0.0.1',port:5174,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:5174'}},upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});
   proxy.on('error',()=>{res.writeHead(503,{'Content-Type':'text/html; charset=utf-8'}).end('<p>Wetter wird gestartet. Bitte kurz warten und neu öffnen.</p>');});proxy.end();return;
  }
  try{
   // Only the public shell and explicitly mounted modules can be served.
   const shellAllowed=path==='/'||path==='/index.html'||path==='/sw.js'||path.startsWith('/src/');
   if(!module&&!shellAllowed)throw Error('Not found');
   const file=await safeFile(module?resolve(root,module.directory):root,module?'/'+path.slice(module.path.length):path);
   const body=await readFile(file);res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Permissions-Policy','microphone=(), camera=()');
   res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Modul oder Datei nicht verfügbar. README prüfen.');}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const dev=process.argv.includes('--dev'),port=Number(process.env.PORT??5173),server=await createServer({dev});let vite;
 server.on('error',error=>{console.error(`Start fehlgeschlagen: ${error.code==='EADDRINUSE'?`Port ${port} ist belegt. Die laufende Vorschau öffnen oder beenden.`:error.message}`);process.exit(1);});
 server.listen(port,'127.0.0.1',()=>{
  console.log(`Raspberry Pi · http://127.0.0.1:${port}/`);
  if(dev){vite=spawn(process.execPath,[resolve(root,'../wetterwarte/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5174','--strictPort'],{cwd:resolve(root,'../wetterwarte'),env:{...process.env,WETTER_BASE:'/wetter/'},stdio:'inherit'});vite.on('exit',code=>{if(code)console.error('Wetter-Entwicklungsserver beendet. Startmenü und Radio bleiben erreichbar.');});}
 });
 const stop=()=>{vite?.kill('SIGTERM');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}

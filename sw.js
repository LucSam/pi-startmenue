const CACHE='pi-display-shell-8e86e4a5660e';
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE),files=['/','/modules.json','/src/style.css','/src/main.js','/src/preview.js','/src/input-surface.js','/radio/','/radio/src/main.js','/radio/src/style.css','/radio/src/stations.js','/wetter/'];
 const manifest=await fetch('/wetter/.vite/manifest.json').then(r=>r.json());
 for(const entry of Object.values(manifest)){files.push('/wetter/'+entry.file);for(const path of entry.css??[])files.push('/wetter/'+path);for(const path of entry.assets??[])files.push('/wetter/'+path);}
 await cache.addAll([...new Set(files)]);await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('pi-display-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match(event.request,{ignoreSearch:true})||(event.request.mode==='navigate'?await cache.match(url.pathname.startsWith('/wetter/')?'/wetter/':url.pathname.startsWith('/radio/')?'/radio/':'/'):null)||Response.error();}));
});

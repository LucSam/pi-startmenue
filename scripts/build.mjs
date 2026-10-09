import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const result=spawnSync('npm',['run','build'],{cwd:fileURLToPath(new URL('../../wetterwarte/',import.meta.url)),env:{...process.env,WETTER_BASE:'/wetter/'},stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
console.log('Startmenü und Radio sind ohne Bundler lauffähig. Wetter wurde für /wetter/ gebaut. Start: npm start');

const workerUrl=new URL('../sw.js',import.meta.url),worker=await readFile(workerUrl,'utf8');
const paths=['../index.html','../modules.json','../src/main.js','../src/preview.js','../src/input-surface.js','../src/style.css','../../radio/index.html','../../radio/src/main.js','../../radio/src/style.css','../../radio/src/stations.js','../../wetterwarte/dist/.vite/manifest.json'];
const hash=createHash('sha256').update(worker.replace(/const CACHE='[^']+';/,"const CACHE='BUILD';"));
for(const path of paths)hash.update(await readFile(new URL(path,import.meta.url)));
await writeFile(workerUrl,worker.replace(/const CACHE='[^']+';/,`const CACHE='pi-display-shell-${hash.digest('hex').slice(0,12)}';`));

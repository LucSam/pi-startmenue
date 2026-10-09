import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeFile,root} from '../scripts/server.mjs';
import {streamUrl} from '../../radio/src/stations.js';
test('Public file resolution refuses parent traversal',async()=>{
 assert.equal(await safeFile(root,'/index.html'),root+'/index.html');
 await assert.rejects(()=>safeFile(root,'/../package.json'));
});
test('Custom radio stations accept secure audio URLs without embedded credentials',()=>{
 assert.equal(streamUrl('https://radio.example/live.mp3'),'https://radio.example/live.mp3');
 for(const url of ['javascript:alert(1)','file:///etc/passwd','https://name:password@example.com/live','http://example.com/live','not a URL'])assert.equal(streamUrl(url),null);
});

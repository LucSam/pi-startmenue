import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createServer} from '../scripts/server.mjs';
import {createPowerControl} from '../scripts/system.mjs';

async function fixture(t,overrides={}){
 let calls=0;
 const server=await createServer({systemControl:{capabilities:async()=>({supported:true,canPowerOff:true}),powerOff:async()=>{calls++;},...overrides}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const request=(options={})=>fetch(origin+'/api/system',options);
 const post=(body={action:'poweroff'},headers={})=>request({method:'POST',headers:{Origin:origin,'X-Pi-System':'1','Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 return {request,post,calls:()=>calls,origin};
}

test('System capability reads and unsupported methods never request shutdown',async t=>{
 const f=await fixture(t);
 assert.deepEqual(await(await f.request()).json(),{supported:true,canPowerOff:true,pending:false});
 assert.equal((await f.request({method:'DELETE'})).status,405);
 assert.equal(f.calls(),0);
});
test('Shutdown rejects cross-origin, missing-header, malformed and oversized requests',async t=>{
 const f=await fixture(t);
 for(const headers of [{Origin:'https://example.com'},{Origin:''},{'X-Pi-System':''}])assert.equal((await f.post(undefined,headers)).status,403,JSON.stringify(headers));
 const foreignHost=await new Promise((resolve,reject)=>{http.get(f.origin+'/api/system',{headers:{Host:'example.com'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
 assert.equal(foreignHost,403);
 assert.equal((await f.post(undefined,{'Content-Type':'text/plain'})).status,415);
 for(const body of ['{',null,[],{action:'reboot'},{action:'poweroff',command:'anything'}])assert.equal((await f.post(body)).status,400);
 assert.equal((await f.post(' '.repeat(1025))).status,413);
 assert.equal(f.calls(),0);
});
test('Shutdown rechecks permissions and never invokes an unavailable operation',async t=>{
 const f=await fixture(t,{capabilities:async()=>({supported:true,canPowerOff:false,error:'Keine Freigabe.'})});
 const response=await f.post();assert.equal(response.status,403);assert.equal((await response.json()).error,'Keine Freigabe.');assert.equal(f.calls(),0);
});
test('Only one shutdown request is accepted, including concurrent requests',async t=>{
 let release,started;
 const entered=new Promise(resolve=>{started=resolve;});
 let calls=0;
 const f=await fixture(t,{powerOff:async()=>{calls++;started();await new Promise(resolve=>{release=resolve;});}});
 const first=f.post();await entered;
 assert.equal((await f.post()).status,409);assert.equal(calls,1);
 release();assert.equal((await first).status,202);assert.equal((await f.post()).status,409);assert.equal(calls,1);
});
test('A rejected system operation reports failure and permits a later retry',async t=>{
 let attempts=0;
 const f=await fixture(t,{powerOff:async()=>{if(++attempts===1)throw Error('Private system details');}});
 const failed=await f.post();assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/Private system details/);
 assert.equal((await f.post()).status,202);assert.equal(attempts,2);
});
test('Non-Linux capability checks do not execute commands',async()=>{
 const control=createPowerControl({platform:'darwin',run:()=>{throw Error('Must not run');}});
 assert.deepEqual(await control.capabilities(),{supported:false,canPowerOff:false});await assert.rejects(()=>control.powerOff(),/nicht unterstützt/);
});
test('logind authorization must be yes, without prompting or elevating privileges',async()=>{
 for(const permission of ['yes','challenge','no','na','yes-inhibitor-blocked','unexpected']){
  const calls=[];
  const control=createPowerControl({platform:'linux',run:async(...args)=>{calls.push(args);return {stdout:`s "${permission}"\n`};}});
  assert.equal((await control.capabilities()).canPowerOff,permission==='yes');assert.equal(calls.length,1);
  assert.equal(calls[0][0],'/usr/bin/busctl');assert(calls[0][1].includes('--allow-interactive-authorization=no'));assert.equal(calls[0][1].at(-1),'CanPowerOff');
 }
 const control=createPowerControl({platform:'linux',run:async()=>{throw Error('missing busctl');}});
 assert.equal((await control.capabilities()).canPowerOff,false);
});
test('Shutdown schedules only poweroff three seconds later through logind',async()=>{
 const calls=[];
 const control=createPowerControl({platform:'linux',now:()=>10000,run:async(...args)=>{calls.push(args);return {stdout:''};}});
 await control.powerOff();assert.equal(calls.length,1);assert.equal(calls[0][0],'/usr/bin/busctl');
 assert.deepEqual(calls[0][1].slice(-4),['ScheduleShutdown','st','poweroff','13000000']);
 assert.equal(calls[0][2].shell,undefined);
});

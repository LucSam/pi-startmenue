import {navigate} from '../../wetterwarte/tests/navigation.mjs';
import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['scripts/server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:'4173'},stdio:'pipe'});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Server exit ${code}`)));});
const safari=process.argv.includes('webkit');
const browser=await(safari?webkit:chromium).launch(safari?{headless:true}:{channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto('http://127.0.0.1:4173/');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 if(safari){
  // WebKit's protocol-level offline switch rejects navigation internally before
  // the service worker can handle it. A stopped origin exercises real fallback.
  await page.route(/^https:\/\//,r=>r.abort());
  const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped;
 }else await context.setOffline(true);
 await page.reload();await page.locator('.tile[data-open=weather]').click();
 const weather=page.frameLocator('[data-module=weather]');await weather.locator('.data-badge.demo').waitFor();await navigate(weather,'nav [data-view=climate]');await weather.locator('.climate-field-map').waitFor();
 await weather.locator('[data-action=home]').click();await page.locator('.tile[data-open=radio]').click();const radio=page.frameLocator('[data-module=radio]');
 if(safari)await context.setOffline(true); // No navigation remains; exercise the actual offline radio state.
 await radio.locator('#play').click();await radio.locator('#state.error').waitFor({timeout:25000});assert.match(await radio.locator('#state').textContent(),/Offline|nicht erreichbar|antwortet nicht/);
 await radio.locator('#home').click();await page.locator('[data-open=standby]').click();await page.locator('#standby-time').waitFor();console.log('PASS: offline reload, weather demo + climate field, radio error, standby.');
}finally{await browser.close();server.kill('SIGTERM');}

import {chromium} from '../../wetterwarte/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.PI_TEST_URL??'http://127.0.0.1:5173';
async function setup(state,{post,preview=false}={}){
 const page=await browser.newPage({viewport:preview?{width:1000,height:800}:{width:480,height:320},screen:{width:480,height:320}});
 await page.addInitScript(()=>{
  localStorage.setItem('pi-startmenue',JSON.stringify({size:'480x320',theme:'light',weatherMode:'demo',idle:5}));
  localStorage.setItem('wetterwarte-display-preview',JSON.stringify({mode:'layout'}));
 });
 const requests=[];
 // Every system request is mocked; this test cannot shut down its host.
 await page.route('**/api/system',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:state});
  requests.push(route.request());
  if(post)return post(route);
  return route.fulfill({status:202,json:{accepted:true}});
 });
 const systemResponse=page.waitForResponse(response=>response.url().endsWith('/api/system'));
 await page.goto(base+(preview?'/':'/?kiosk=1'));await page.locator('.tile').first().waitFor();await systemResponse;
 return {page,requests};
}
try{
 const unsupported=await setup({supported:false,canPowerOff:false});
 assert(await unsupported.page.locator('#power-control').isHidden());assert.equal(unsupported.requests.length,0);await unsupported.page.close();

 const unavailable=await setup({supported:true,canPowerOff:false});
 await unavailable.page.locator('#power-control').waitFor();assert(await unavailable.page.locator('#power-open').isDisabled());
 assert.equal(await unavailable.page.locator('#power-unavailable').textContent(),'Noch nicht eingerichtet');assert.equal(unavailable.requests.length,0);await unavailable.page.close();

 let finishRequest;
 const accepted=await setup({supported:true,canPowerOff:true},{post:route=>new Promise(resolve=>{finishRequest=async()=>{await route.fulfill({status:202,json:{accepted:true}});resolve();};})});
 const {page,requests}=accepted;await page.locator('#power-open').waitFor();
 await page.evaluate(()=>{
  const frame=document.querySelector('[data-module=radio]');
  dispatchEvent(new MessageEvent('message',{origin:location.origin,source:frame.contentWindow,data:{protocol:'pi-display-v1',type:'radio-state',playing:true,station:'Ein besonders langer Sendername für den laufenden Sender'}}));
 });
 const layout=await page.locator('#home').evaluate(home=>{
  const bounds=home.getBoundingClientRect();
  return [...home.querySelectorAll('button')].filter(button=>button.getClientRects().length).map(button=>({id:button.id||button.dataset.open,height:button.getBoundingClientRect().height,left:button.getBoundingClientRect().left,right:button.getBoundingClientRect().right,bottom:button.getBoundingClientRect().bottom,edge:bounds.right,floor:bounds.bottom}));
 });
 for(const button of layout){assert(button.height>=44,`${button.id}: touch height`);assert(button.left>=0&&button.right<=button.edge&&button.bottom<=button.floor,`${button.id}: clipped`);}
 await page.locator('#power-open').click();assert.equal(requests.length,0);assert.equal(await page.locator('#power-title').textContent(),'Pi herunterfahren?');
 assert(await page.locator('#power-cancel').evaluate(button=>button===document.activeElement));
 await page.keyboard.press('Shift+Tab');assert(await page.locator('#power-confirm').evaluate(button=>button===document.activeElement));
 await page.keyboard.press('Tab');assert(await page.locator('#power-cancel').evaluate(button=>button===document.activeElement));
 await page.keyboard.press('Escape');assert(await page.locator('#power-dialog').isHidden());assert.equal(requests.length,0);
 await page.locator('#power-open').click();await page.locator('#power-cancel').click();assert(await page.locator('#power-dialog').isHidden());assert.equal(requests.length,0);
 await page.locator('#power-open').click();await page.locator('#power-confirm').click();
 assert(await page.locator('#power-confirm').isDisabled());assert(await page.locator('#power-cancel').isDisabled());
 await page.waitForFunction(()=>document.querySelector('#power-message').textContent.includes('angefordert …'));
 await page.locator('#power-confirm').evaluate(button=>{button.click();button.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
 await page.keyboard.press('Escape');assert(await page.locator('#power-dialog').isVisible());
 for(let attempt=0;!finishRequest&&attempt<50;attempt++)await page.waitForTimeout(20);
 assert.equal(requests.length,1);assert.deepEqual(requests[0].postDataJSON(),{action:'poweroff'});
 assert.equal(requests[0].headers()['x-pi-system'],'1');assert.equal(requests[0].headers()['origin'],base);assert.match(requests[0].headers()['content-type'],/^application\/json/);
 await finishRequest();await page.waitForFunction(()=>document.querySelector('#power-message').textContent.startsWith('Herunterfahren angefordert.'));
 assert(await page.locator('#power-confirm').isDisabled());assert(await page.locator('#power-cancel').isDisabled());assert.equal(requests.length,1);await page.close();

 const failed=await setup({supported:true,canPowerOff:true},{post:route=>route.fulfill({status:503,json:{error:'Herunterfahren ist derzeit nicht möglich.'}})});
 await failed.page.locator('#power-open').click();await failed.page.locator('#power-confirm').click();
 await failed.page.locator('#power-message.error').waitFor();assert.equal(await failed.page.locator('#power-message').textContent(),'Herunterfahren ist derzeit nicht möglich.');
 assert(await failed.page.locator('#power-confirm').isEnabled());assert(await failed.page.locator('#power-cancel').isEnabled());await failed.page.locator('#power-cancel').click();assert.equal(failed.requests.length,1);await failed.page.close();

 const disconnected=await setup({supported:true,canPowerOff:true},{post:route=>route.abort('failed')});
 await disconnected.page.locator('#power-open').click();await disconnected.page.locator('#power-confirm').click();await disconnected.page.locator('#power-message.error').waitFor();
 assert.equal(await disconnected.page.locator('#power-message').textContent(),'Keine Bestätigung erhalten. Bitte Verbindung prüfen.');assert(await disconnected.page.locator('#power-cancel').isEnabled());await disconnected.page.close();
 console.log('PASS: shutdown availability, 480 × 320 layout, confirmation/cancel, keyboard focus, one pending request, acceptance and failure states.');
}finally{await browser.close();}

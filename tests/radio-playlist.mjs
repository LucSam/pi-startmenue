import {chromium,webkit} from '../../wetterwarte/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const engine=process.argv.includes('webkit')?'webkit':'chrome';
const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:480,height:320}});let mode='playlist';
 await page.clock.install();
 const playedAt=Date.now()-600000;
 const wav=Buffer.alloc(44+8000*2*10);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 await page.route('https://stream.srg-ssr.ch/**',r=>r.fulfill({contentType:'audio/wav',body:wav}));
 await page.route('**/api/now-playing?*',async r=>{if(mode==='error')return r.fulfill({status:503,json:{error:'Titelquelle nicht erreichbar'}});const id=new URL(r.request().url()).searchParams.get('station');return r.fulfill({json:id==='swissjazz'?{station:id,title:'Jazzaar Festival Big Band - Stompin’ At The Savoy',codec:'MP3',bitrate:128,fetchedAt:Date.now()}:mode==='playlist'?{station:id,title:'TWIST & TURN',artist:'Popcaan feat. Drake & PARTYNEXTDOOR',playedAt,fetchedAt:Date.now(),kind:'playlist',stale:false,codec:'MP3',bitrate:128,sampleRate:48000}:{station:id,title:'COSMO mit …',playlistUnavailable:true,fetchedAt:Date.now()}});});
 await page.goto('http://127.0.0.1:5173/radio/');await page.locator('#track-title').filter({hasText:'TWIST & TURN'}).waitFor();assert.match(await page.locator('#track-label').textContent(),/^Zuletzt gespielt/);assert.match(await page.locator('#track-label').textContent(),new RegExp(new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}).format(playedAt)));
 assert.equal(await page.locator('#track-artist').textContent(),'Popcaan feat. Drake & PARTYNEXTDOOR');
 for(const [width,height] of [[480,320],[480,480],[800,480],[1280,720]]){
  await page.setViewportSize({width,height});
  const bounds=await page.evaluate(()=>{const title=document.querySelector('.now-playing').getBoundingClientRect(),controls=document.querySelector('.audio-controls').getBoundingClientRect(),artist=document.querySelector('#track-artist').getBoundingClientRect();return {title: title.bottom,controls:controls.top,artist:artist.bottom,scroll:document.querySelector('.device').scrollHeight,h:innerHeight};});
  assert(bounds.artist<=bounds.controls+1&&bounds.scroll<=bounds.h+1,JSON.stringify(bounds));
 }
 await page.setViewportSize({width:480,height:320});await page.locator('#station-picker').click();assert.deepEqual(await page.locator('.station strong').allTextContents(),['COSMO','Beats Radio','Berlin Klubradio','radioeins']);await page.locator('#next').click();assert.equal(await page.locator('#page-number').textContent(),'Seite 2 von 3');assert.equal(await page.locator('.station strong').first().textContent(),'Radio Swiss Jazz');
 await page.locator('[data-station=swissjazz]').click();await page.locator('#state').filter({hasText:'Live'}).waitFor();await page.locator('#track-title').filter({hasText:'Jazzaar'}).waitFor();assert.equal(await page.locator('#track-artist').textContent(),'');assert.equal(await page.locator('#play').textContent(),'Stoppen');await page.locator('#play').click();
 await page.reload();assert.equal(await page.locator('#station-name').textContent(),'Radio Swiss Jazz');
 mode='fallback';await page.evaluate(()=>document.querySelector('#audio').muted=true);await page.locator('#station-picker').click();await page.locator('[data-station=cosmo]').click();await page.locator('#track-label').filter({hasText:'Streamangabe · Playlist fehlt'}).waitFor();assert.equal(await page.locator('#track-artist').textContent(),'');await page.locator('#play').click();
 mode='error';await page.clock.fastForward(46000);await page.locator('#track-title').filter({hasText:'Titelinformationen nicht verfügbar'}).waitFor();assert.equal(await page.locator('#track-label').textContent(),'Aktuelles Programm');assert.equal(await page.locator('#track-artist').textContent(),'');
 console.log(`PASS ${engine}: COSMO playlist time, title/artist, 4-size layout, fifth preset, Swiss Jazz playback, persistence, explicit fallback and refresh failure.`);
}finally{await browser.close();}

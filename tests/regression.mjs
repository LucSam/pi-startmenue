// Requires the local development server and Playwright Chrome + WebKit.
import {spawn} from 'node:child_process';
const checks=[
 ['preview-navigation.mjs'],['preview-navigation.mjs','webkit'],
 ['maps-consistency.mjs'],['maps-consistency.mjs','webkit'],
 ['radar-layout.mjs'],['radar-layout.mjs','webkit'],
 ['radio-playlist.mjs'],['radio-playlist.mjs','webkit'],
 ['readability.mjs'],['readability.mjs','webkit'],['field-buffer.mjs'],['radar-fixture.mjs'],['radar-recovery.mjs'],['radar-buffer.mjs'],
 ['visual-input.mjs','pixels'],['visual-input.mjs','physical'],
 ['visual-input.mjs','webkit','pixels'],['visual-input.mjs','webkit','physical'],
];
for(const [file,...args] of checks){
 console.log('\nPrüfung:',file,...args);
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[`tests/${file}`,...args],{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>resolve(code??1));});
 if(code)process.exit(code);
}
console.log('\nAlle Radar- und Vorschau-Regressionsprüfungen bestanden.');

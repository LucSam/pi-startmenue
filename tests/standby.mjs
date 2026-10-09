import {chromium} from '../../wetterwarte/node_modules/playwright/index.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.clock.install({time:new Date()});
 await page.goto('http://127.0.0.1:5173/');await page.locator('#idle').selectOption('5');
 await page.locator('.tile[data-open=weather]').click();await page.frameLocator('[data-module=weather]').locator('[data-action=home]').waitFor();
 await page.waitForTimeout(100);await page.clock.fastForward(301000);await page.locator('#standby:not([hidden])').waitFor();
 await page.locator('#standby').click();await page.locator('#home:not([hidden])').waitFor();
 console.log('PASS: automatic standby after inactivity and touch wake.');
}finally{await browser.close();}

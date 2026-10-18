import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('../.local-tools/browser/node_modules/playwright');
const rows=JSON.parse(await readFile(process.argv[2] || '.local-tools/audit-input.json','utf8')).filter(r=>String(r.Archived).toUpperCase()!=='TRUE');
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
try{
  const queue=[...rows];
  await Promise.all(Array.from({length:3},async()=>{
    const page=await browser.newPage();
    while(queue.length){
      const row=queue.shift(),url=row.URL;
      if(!url){results.push({id:row.ID,state:'unknown',reason:'No direct URL'});continue;}
      if(new URL(url).hostname.includes('facebook.com')){results.push({id:row.ID,state:'unknown',reason:'Facebook requires logged-in verification'});continue;}
      try{
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:18000});
        const title=await page.title(),finalUrl=page.url();
        const body=(await page.locator('body').innerText({timeout:6000})).slice(0,16000);
        const blocked=/captcha|access denied|just a moment|verify you are human|security check/i.test(title+' '+body.slice(0,350));
        const kijijiRemoved=url.includes('kijiji.ca/v-') && (finalUrl.includes('adRemoved=') || /kijiji\.ca\/b-/.test(finalUrl));
        const roomiesRemoved=url.includes('roomies.ca/rooms/') && /listing is no longer available|room is no longer available|this listing has expired/i.test(body);
        const unavailable=response?.status()===404 || response?.status()===410 || kijijiRemoved || roomiesRemoved;
        results.push({id:row.ID,state:blocked?'unknown':unavailable?'off-market':response?.ok()?'reachable':'unknown',status:response?.status(),title,finalUrl,reason:kijijiRemoved?'Kijiji redirects removed ad to browse':roomiesRemoved?'Roomies explicitly says listing is no longer available':unavailable?'Listing URL returns '+response?.status():blocked?'Site verification blocked check':'Page reachable; availability still needs confirmation'});
      }catch(e){results.push({id:row.ID,state:'unknown',reason:String(e).slice(0,150)});}
    }
    await page.close();
  }));
}finally{await browser.close();}
await writeFile('.local-tools/audit-results-2026-10-17.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));

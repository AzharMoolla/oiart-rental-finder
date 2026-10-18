import {chromium} from '../.local-tools/browser/node_modules/playwright/index.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

// Keep source evidence local; no collected page writes to the live Sheet.
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext();
const page=await context.newPage();
const records=[],failures=[];
const output='.local-tools/peterborough-web-sweep-2026-10-18.json';
const follow=process.argv.includes('--follow'),managers=process.argv.includes('--managers');
if(follow||managers){const saved=JSON.parse(await readFile(output,'utf8'));records.push(...saved.records);failures.push(...saved.failures);}
await mkdir('.local-tools',{recursive:true});
async function capture(url){
  try{
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
    await page.waitForTimeout(1000);
    const row=await page.evaluate(()=>({url:location.href,title:document.title,h1:document.querySelector('h1')?.innerText,
      text:document.body.innerText,images:[...document.querySelectorAll('meta[property="og:image"]')].map(x=>x.content),
      structured:[...document.querySelectorAll('script[type="application/ld+json"]')].map(x=>{try{return JSON.parse(x.textContent);}catch{return null;}}),
      links:[...document.querySelectorAll('a[href]')].map(a=>({url:a.href,text:a.innerText.trim()}))}));
    row.status=response?.status();records.push(row);
    console.log(JSON.stringify({url:row.url,status:row.status,title:row.title,chars:row.text.length}));
    await writeFile(output,JSON.stringify({capturedAt:new Date().toISOString(),records,failures},null,2));
    return row;
  }catch(e){failures.push({url,error:String(e)});return null;}
}
try{
  if(managers){
    const seed=records.find(r=>r.url==='https://www.babcockandrobinson.ca/apartments-for-rent-peterborough');
    for(const url of [...new Set((seed?.links||[]).filter(l=>l.text==='Read More').map(l=>l.url))])await capture(url);
  }else if(follow){
    const seed=[...records];
    const kijiji=seed.find(r=>r.url.includes('kijiji.ca/b-'));
    const urls=[...new Set((kijiji?.links||[]).filter(l=>l.url.includes('/v-')&&!/looking-for-a-new-home|needed-private|roseneath|buckhorn/.test(l.url)).map(l=>l.url))];
    urls.push('https://www.kijiji.ca/v-apartments-condos/peterborough/private-room/1744317621');
    for(const url of urls){const r=await capture(url);if(r&&[403,429].includes(r.status))break;}
    const zumper=seed.find(r=>r.url.includes('zumper.com/apartments-for-rent/'));
    for(const url of [...new Set((zumper?.links||[]).filter(l=>l.url.includes('/apartment-buildings/')).map(l=>l.url))]){
      const r=await capture(url);if(r&&[403,429].includes(r.status))break;
    }
    await capture('https://www.babcockandrobinson.ca/apartments-for-rent-peterborough');
  }else{
  const rooms=new Set();
  for(const url of ['https://www.roomies.ca/rooms/peterborough-on','https://www.roomies.ca/rooms/peterborough-on?page=2']){
    const row=await capture(url);
    for(const link of row?.links||[])if(/^https:\/\/www.roomies.ca\/rooms\/\d+$/.test(link.url))rooms.add(link.url);
  }
  for(const url of rooms)await capture(url);
  const rentals=await capture('https://rentals.ca/peterborough');
  const addresses=[...new Set((rentals?.links||[]).map(x=>x.url).filter(u=>/^https:\/\/rentals.ca\/peterborough\/.+/.test(u)&&!u.includes('all-')&&!u.includes('apartments')&&!u.includes('houses')&&!u.includes('condos')&&!u.includes('townhouses')))];
  for(const url of addresses.slice(0,20))await capture(url);
  await capture('https://www.kijiji.ca/b-room-rental-roommate/peterborough/c36l1700218');
  await capture('https://www.babcockandrobinson.ca/');
  await capture('https://www.zumper.com/apartments-for-rent/peterborough-on');
  }
}finally{
  await writeFile(output,JSON.stringify({capturedAt:new Date().toISOString(),records,failures},null,2));
  await browser.close();
}
console.log(JSON.stringify({finished:true,pages:records.length,failures,output}));

import assert from 'node:assert/strict';
import {chromium} from '../.local-tools/browser/node_modules/playwright/index.mjs';

// Every profile request is intercepted; no QA data reaches the real Sheet.
const browser=await chromium.launch({channel:'msedge',headless:true});
const saved=new Map();let clock=0,offline=false;
const baseUrl=process.env.BASE_URL||'http://127.0.0.1:4186/';
async function device(){
  const context=await browser.newContext(),page=await context.newPage();
  await context.route('https://script.google.com/**',async route=>{
    if(offline)return route.fulfill({status:503,body:'Offline'});
    const request=route.request();let result;
    if(request.method()==='POST'){
      const p=request.postDataJSON(),old=saved.get(p.profile.id);
      if(p.expectedUpdatedAt!==(old?.UpdatedAt||''))result={ok:false,code:'PROFILE_CONFLICT',error:'Changed on another device'};
      else{
        const updatedAt='revision-'+(++clock);
        saved.set(p.profile.id,{ProfileID:p.profile.id,Name:p.profile.name,SearchID:p.profile.searchId,ProfileJSON:JSON.stringify(p.profile),UpdatedAt:updatedAt});
        result={ok:true,action:'saveProfile',id:p.profile.id,updatedAt};
      }
    }else if(new URL(request.url()).searchParams.get('action')==='listProfiles')result={ok:true,action:'listProfiles',profiles:[...saved.values()]};
    else result={ok:true,capabilities:['workflow','saveProfile','listProfiles','profileRevisions']};
    await route.fulfill({json:result});
  });
  await page.goto(baseUrl+'?search=trent-peterborough');
  await page.locator('#profileSearch').waitFor();return page;
}
async function finish(page){for(let i=0;i<5;i++)await page.click('#qnext');await page.click('#qnext');await page.waitForFunction(()=>document.getElementById('quiz').hidden);}
try{
  const a=await device();await a.click('#startNewQuiz');await a.fill('#budget','1250');
  for(let i=0;i<5;i++)await a.click('#qnext');await a.fill('#profileName','Realistic test friend');await a.click('#qnext');
  await a.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('Available on your other devices'));
  assert.equal(saved.size,1);const id=[...saved.keys()][0];assert.equal(JSON.parse(saved.get(id).ProfileJSON).budgetRent,1250);
  const b=await device();await b.locator(`[data-profile-choice="${id}"]`).click();
  assert.equal(await b.evaluate(()=>activeProfile().budgetRent),1250);
  await b.click('#qopen');await b.fill('#budget','1400');await finish(b);
  await b.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('Available on your other devices'));
  assert.equal(saved.size,1);assert.equal(JSON.parse(saved.get(id).ProfileJSON).budgetRent,1400);
  // A still has the previous revision: its edit must not clobber B.
  await a.click('#qopen');await a.fill('#budget','1500');await finish(a);
  await a.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('Changed on another device'));
  assert.equal(JSON.parse(saved.get(id).ProfileJSON).budgetRent,1400);
  await a.click('#chooseProfile');await a.locator(`[data-profile-choice="sheet:${id}"]`).waitFor();
  a.once('dialog',d=>d.accept());await a.locator(`[data-profile-choice="sheet:${id}"]`).click();
  assert.equal(await a.evaluate(()=>activeProfile().budgetRent),1400);
  // A fresh device sees B's current answers, not A's stale local version.
  const c=await device();await c.locator(`[data-profile-choice="${id}"]`).click();
  assert.equal(await c.evaluate(()=>activeProfile().budgetRent),1400);
  offline=true;await c.click('#qopen');await c.fill('#budget','1450');await finish(c);
  await c.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('Your edits remain on this device'));
  assert.ok(await c.evaluate(id=>JSON.parse(localStorage.getItem('hf_profile_pending'))[id],id));
  offline=false;await c.click('#chooseProfile');await c.locator('#profileSearch').waitFor();
  assert.equal(JSON.parse(saved.get(id).ProfileJSON).budgetRent,1450);
  assert.equal(await c.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('hf_profile_pending'))).length),0);
  await c.screenshot({path:'.local-tools/qa/shared-profiles-desktop.png'});
  await c.setViewportSize({width:390,height:844});
  assert.ok(await c.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await c.screenshot({path:'.local-tools/qa/shared-profiles-mobile.png'});
  console.log(JSON.stringify({passed:true,devices:3,profileRows:saved.size,budget:1450,checks:['cross-device create/update','stale revision rejection','conflict recovery','offline retry']}));
}finally{await browser.close();}

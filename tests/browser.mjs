import assert from 'node:assert/strict';
import {chromium} from '../.local-tools/browser/node_modules/playwright/index.mjs';
import {mkdir} from 'node:fs/promises';
await mkdir('.local-tools/qa',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:4186/?search=trent-peterborough',{waitUntil:'domcontentloaded'});
  await page.locator('#startNewQuiz').waitFor({timeout:20000});
  await page.screenshot({path:'.local-tools/qa/entry-desktop.png',fullPage:true});
  await page.click('#startNewQuiz');
  await page.fill('#budget','1200');await page.fill('#ideal','1000');await page.fill('#timing','November 2026');
  await page.click('#qnext');
  await page.locator('input[name="housingTypes"][value="room"]').check();
  await page.selectOption('#bedroom','yes');await page.selectOption('#bathroom','no');
  await page.click('#qnext');
  await page.selectOption('#transport','transit');await page.fill('#commute','30');await page.selectOption('#parkingNeed','no');
  await page.click('#qnext');
  await page.selectOption('#internetNeed','yes');await page.selectOption('#pets','no');
  await page.click('#qnext');
  await page.fill('#roommates','3');await page.click('#qnext');
  await page.fill('#profileName','Browser test - Trent');await page.click('#qnext');
  await page.locator('#quiz').waitFor({state:'hidden'});
  const result=await page.evaluate(()=>{
    const p=activeProfile();
    const base={SearchID:'trent-peterborough',Type:'Private room in shared house',Roommates:2,'Listing / lead':'Test rental','Address / locator':'100 Test Road',AddressConfirmed:true,Latitude:44.3579,Longitude:-78.29,'Approx monthly share':900,'Internet / utilities':'Wi-Fi and all utilities included',Availability:'November 2026',URL:'https://www.roomies.ca/rooms/999999',ImageURL:'',Archived:false};
    applyData({rows:[{...base,ID:'TEST-core'},{...base,ID:'TEST-stretch','Internet / utilities':''},{...base,ID:'TEST-outside',Type:'Shared bedroom in apartment'},{...base,ID:'TEST-london',SearchID:'london-oiart'}],sites:[]});
    return {profile:p,rows:rows.map(r=>({id:r.ID,score:r.ScoreNum,fit:r.FitCategory,unknown:r.ScoreCritUnknown})),center:map?.getCenter(),hasMap};
  });
  assert.equal(result.profile.searchId,'trent-peterborough');
  assert.equal(result.profile.budgetRent,1200);
  assert.deepEqual(result.profile.mustHaves.sort(),['internet','privateBedroom']);
  assert.equal(result.rows.length,3);
  assert.equal(result.rows.find(r=>r.id==='TEST-core').fit,'core');
  assert.equal(result.rows.find(r=>r.id==='TEST-stretch').fit,'stretch');
  assert.equal(result.rows.find(r=>r.id==='TEST-outside').fit,'outside');
  assert.ok(result.hasMap,'Leaflet map loaded');
  const gates=await page.evaluate(()=>{
    const base=allRows.find(r=>r.ID==='TEST-core');
    const wrong=deriveListing({...base,ID:'WRONG-MONTH',Availability:'December 2026'});
    const incomplete=deriveListing({...base,ID:'NO-INTERNET','Internet / utilities':''});
    const weights=weightsFor('rent');
    const missingId=deriveListing({...base,ID:'',_RowNumber:999});deriveListing(missingId);
    const overBudget=deriveListing({...base,ID:'OVER-MAX','Approx monthly share':1250});
    return {wrong:wrong.FitCategory,incomplete:scoreLevelClass(incomplete),sum:Object.values(weights).reduce((a,b)=>a+b,0),missingId:missingId.NeedsId,overBudget:overBudget.FitCategory};
  });
  assert.equal(gates.wrong,'outside');assert.equal(gates.incomplete,'scorewarn');assert.equal(gates.sum,100);
  assert.equal(gates.missingId,true,'Missing-ID rows remain read-only after recalculation');
  assert.equal(gates.overBudget,'outside','A firm maximum is not just a weak preference');
  await page.selectOption('#volume','outside');
  assert.equal(await page.locator('tr.mainrow').count(),1);
  await page.selectOption('#volume','');
  await page.screenshot({path:'.local-tools/qa/board-desktop.png',fullPage:true});
  await page.locator('tr.mainrow').first().click();
  assert.equal(await page.locator('tr.selectedrow').count(),1);
  const refresh=await page.evaluate(()=>{
    map.setView([44.35,-78.30],15,{animate:false});const before=map.getCenter();const zoom=map.getZoom();
    applyData({rows:allRows,sites:[]});return {before,after:map.getCenter(),zoom,afterZoom:map.getZoom()};
  });
  assert.equal(refresh.zoom,refresh.afterZoom);assert.equal(refresh.before.lat,refresh.after.lat);
  const endpoint='https://script.google.com/macros/**';
  await page.route(endpoint,route=>route.fulfill({json:{ok:false,error:'Test rejected save'}}));
  const rollback=await page.evaluate(async()=>{
    const row=rows.find(r=>r.ID==='TEST-core');
    await saveWorkflow(row.ID,{Archived:'TRUE',Status:'Archived'});
    return {archived:isArchived(row),status:row.Status};
  });
  assert.equal(rollback.archived,false,'Failed writes must undo the archive');
  assert.notEqual(rollback.status,'Archived');
  await page.unroute(endpoint);
  await page.route(endpoint,async route=>{
    if(route.request().method()==='GET'){await route.fulfill({json:{ok:true,capabilities:['workflow','saveProfile']}});return;}
    const payload=route.request().postDataJSON();
    await route.fulfill({json:{ok:true,written:payload.fields}});
  });
  const written=await page.evaluate(async()=>{
    const row=rows.find(r=>r.ID==='TEST-core');
    await saveWorkflow(row.ID,{Status:'Waiting reply',Contacted:'TRUE'});
    return {status:row.Status,contacted:row.Contacted};
  });
  assert.equal(written.status,'Waiting reply');assert.equal(String(written.contacted).toUpperCase(),'TRUE');
  await page.setViewportSize({width:390,height:844});
  await page.click('#qopen');
  await page.screenshot({path:'.local-tools/qa/quiz-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.click('#qclose');await page.screenshot({path:'.local-tools/qa/board-mobile.png',fullPage:true});
  const persistence=await page.evaluate(()=>JSON.parse(localStorage.getItem('hf_profiles')).list.some(p=>p.name==='Browser test - Trent' && p.tuned));
  assert.ok(persistence,'Profile persisted');
  await page.evaluate(()=>{
    const base=activeProfile();
    HF.list=Array.from({length:500},(_,i)=>({...base,id:'many-'+i,name:'Friend '+String(i).padStart(3,'0')}));
    HF.activeId='many-0';saveProfiles();
  });
  await page.click('#chooseProfile');
  await page.locator('#profileSearch').waitFor();
  assert.equal(await page.locator('[data-profile-choice]').count(),40);
  await page.click('#moreProfiles');
  assert.equal(await page.locator('[data-profile-choice]').count(),80);
  await page.fill('#profileSearch','Friend 047');
  assert.equal(await page.locator('[data-profile-choice]').count(),1);
  await page.locator('[data-profile-choice]').click();
  assert.equal(await page.evaluate(()=>activeProfile().name),'Friend 047');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,result,refresh,screenshots:'.local-tools/qa'},null,2));
}finally{await browser.close();}

import assert from 'node:assert/strict';
import {chromium} from '../.local-tools/browser/node_modules/playwright/index.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
const url=process.env.BASE_URL||'http://127.0.0.1:4186/';
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('https://script.google.com/**',route=>route.fulfill({json:{ok:true,capabilities:['workflow']}}));
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url+'?search=trent-peterborough');
  await page.waitForFunction(()=>typeof ListingRules!=='undefined'&&allRows.length>0);
  assert.match(await page.locator('#sourceBadge').innerText(),/Live Sheet/);
  assert.equal(await page.evaluate(()=>allRows.find(r=>r.ID==='PTB-RM-1056256').LeaseMonths),'Minimum 8 months');
  await page.locator('#qclose').click();
  const expected=await page.evaluate(()=>{
    upsertProfile({...DEFAULT_PROFILE,id:'source-test',name:'Source QA',searchId:'trent-peterborough',city:'Peterborough, Ontario',pois:[CampusTools.poi(CampusTools.choices('Trent Peterborough')[0])],answers:{},budgetRent:null,mustHaves:[],dealBreakers:[],timing:''});
    window.applyProfileChange({fitMap:true});
    return {total:rows.filter(r=>!isArchived(r)).length,sites:[...new Set(rows.map(ListingRules.sourceSite))]};
  });
  const results=[];
  for(const site of expected.sites){
    await page.selectOption('#source',site);
    const data=await page.evaluate(site=>({count:filtered().length,expected:rows.filter(r=>!isArchived(r)&&ListingRules.sourceSite(r)===site).length,correct:filtered().every(r=>ListingRules.sourceSite(r)===site)}),site);
    assert.equal(data.count,data.expected);assert.ok(data.correct);results.push({site,count:data.count});
  }
  await page.selectOption('#source','Facebook Marketplace');await page.selectOption('#housingType','room');
  assert.ok(await page.evaluate(()=>filtered().every(r=>ListingRules.sourceSite(r)==='Facebook Marketplace'&&ListingRules.housingMarket(r)==='room')));
  const refresh=await page.evaluate(()=>{map.setView([44.32,-78.30],14,{animate:false});const before=map.getCenter();applyData({rows:allRows,sites:[]});return {source:document.getElementById('source').value,housing:document.getElementById('housingType').value,zoom:map.getZoom(),lat:map.getCenter().lat,before:before.lat};});
  assert.equal(refresh.source,'Facebook Marketplace');assert.equal(refresh.zoom,14);assert.equal(refresh.lat,refresh.before);
  assert.equal(refresh.housing,'room');
  await page.selectOption('#source','');
  for(const type of ['room','sharedBedroom','unit','building','unknown']){
    await page.selectOption('#housingType',type);
    const result=await page.evaluate(type=>({count:filtered().length,expected:rows.filter(r=>!isArchived(r)&&ListingRules.housingMarket(r)===type).length,correct:filtered().every(r=>ListingRules.housingMarket(r)===type)}),type);
    assert.ok(result.correct);assert.equal(result.count,result.expected);
  }
  await page.click('#reset');assert.equal(await page.inputValue('#housingType'),'');
  assert.equal(await page.locator('tr.mainrow').count(),expected.total);
  await page.screenshot({path:'.local-tools/qa/source-filters-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'.local-tools/qa/source-filters-mobile.png'});
  const fallback=await browser.newPage();
  await fallback.route('https://docs.google.com/spreadsheets/**',route=>route.fulfill({status:503,body:'Unavailable for fallback test'}));
  await fallback.goto(url+'?search=trent-peterborough');
  await fallback.waitForFunction(()=>typeof allRows!=='undefined'&&allRows.length>0);
  assert.match(await fallback.locator('#sourceBadge').innerText(),/Seed CSV fallback/);
  assert.equal(await fallback.evaluate(()=>allRows.find(r=>r.ID==='PTB-RM-1056256').LeaseMonths),'Minimum 8 months');
  await fallback.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,expected,results,refresh}));
}finally{await browser.close();}

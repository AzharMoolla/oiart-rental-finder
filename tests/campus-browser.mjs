import assert from 'node:assert/strict';
import {chromium} from '../.local-tools/browser/node_modules/playwright/index.mjs';
import {mkdir} from 'node:fs/promises';
await mkdir('.local-tools/qa',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:4186/?search=trent-peterborough');
  await page.locator('#startNewQuiz').waitFor();await page.click('#startNewQuiz');await page.click('#qnext');
  const checkbox=await page.locator('.quizchecks input').first().boundingBox();assert.ok(checkbox.width<22);
  await page.screenshot({path:'.local-tools/qa/quiz-housing-fixed.png'});
  await page.click('#qnext');
  await page.fill('#campusSearch','Trent Peterborough');
  const campusId=await page.locator('#campus option').evaluateAll(nodes=>nodes.find(n=>n.value&&n.textContent.includes('Trent University'))?.value);
  assert.ok(campusId);await page.selectOption('#campus',campusId);
  assert.equal(await page.locator('#customDestination').isVisible(),false);
  await page.screenshot({path:'.local-tools/qa/quiz-campus-desktop.png'});
  await page.click('#qnext');await page.click('#qnext');
  await page.fill('#preferredAreas','East City');await page.fill('#avoidedAreas','Downtown');
  await page.click('#qnext');await page.fill('#profileName','Campus QA');await page.click('#qnext');
  const result=await page.evaluate(()=>{
    const p=activeProfile();p.budgetRent=null;p.maxRoommates=null;p.timing='';p.mustHaves=[];p.dealBreakers=[];
    const base={ID:'AREA-TEST',SearchID:p.searchId,Type:'Private room',Neighbourhood:'East City',Latitude:44.34,Longitude:-78.30,'Approx monthly share':800,URL:'https://www.roomies.ca/rooms/999999'};
    const preferred=deriveListing({...base}),avoid=deriveListing({...base,Neighbourhood:'Downtown'}),unknown=deriveListing({...base,Neighbourhood:'Peterborough, Ontario'});
    const inventory=rows.length,sourceCounts=rows.reduce((a,r)=>(a[r.Source]=(a[r.Source]||0)+1,a),{});
    p.answers={};window.applyProfileChange({fitMap:true});
    return {campus:p.pois[0],preferred:preferred.ScoreComponents.find(c=>c.key==='location'),avoid:avoid.FitCategory,unknown:unknown.RequirementUnknown,inventory,sourceCounts};
  });
  assert.ok(result.campus.campusId);assert.equal(result.avoid,'outside');assert.ok(result.preferred.note.includes('preferred area'));assert.ok(result.unknown.includes('neighbourhood'));assert.ok(result.inventory>=159);
  await page.selectOption('#routePoi','campus:oiart');
  const route=await page.evaluate(()=>({link:routeLink(rows[0]),primary:config.pois[0].campusId}));
  assert.ok(route.link.includes(encodeURIComponent('42.937,-81.215')));assert.equal(route.primary,campusId);
  await page.click('#under1000');assert.equal(await page.getAttribute('#under1000','aria-pressed'),'true');
  await page.click('#reset');assert.equal(await page.getAttribute('#under1000','aria-pressed'),'false');
  const photos=await page.evaluate(async()=>{
    const sources=[...new Set(rows.map(r=>r.Source))];
    const results=[];
    for(const source of sources){
      const r=rows.find(r=>r.Source===source&&r.ImageURL);if(!r)continue;
      const loaded=await new Promise(resolve=>{const i=new Image();const timeout=setTimeout(()=>resolve({ok:false}),10000);i.referrerPolicy='no-referrer';i.onload=()=>{clearTimeout(timeout);resolve({ok:i.naturalWidth>0,width:i.naturalWidth,height:i.naturalHeight});};i.onerror=()=>{clearTimeout(timeout);resolve({ok:false});};i.src=r.ImageURL;});
      results.push({source,id:r.ID,...loaded});
    }
    return results;
  });
  await page.screenshot({path:'.local-tools/qa/campus-board-desktop.png'});
  await page.click('#poiBtn');await page.locator('.poirow[data-poi="1"] .campuscontrols select').selectOption('oiart');
  await page.click('#poiSave');
  assert.equal(await page.evaluate(()=>activeProfile().pois[1].campusId),'oiart');
  await page.click('#poiClose');
  await page.setViewportSize({width:390,height:844});await page.click('#qopen');await page.click('#qnext');
  await page.screenshot({path:'.local-tools/qa/quiz-housing-mobile-fixed.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.click('#qnext');await page.screenshot({path:'.local-tools/qa/quiz-campus-mobile.png'});
  await page.click('#qclose');await page.screenshot({path:'.local-tools/qa/campus-board-mobile.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,result,route,photos,errors},null,2));
}finally{await browser.close();}

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const context=vm.createContext({});
for(const name of ['campus-data.js','campuses.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context);
const tools=context.CampusTools;

test('official campus catalogue covers main and satellite campuses without duplicate IDs',()=>{
  const all=tools.list();assert.equal(all.length,180);assert.equal(tools.choices().length,58);
  assert.equal(new Set(all.map(c=>c.id)).size,all.length);
  for(const c of all){assert.ok(c.address&&c.institution&&c.city);assert.ok(c.lat>41&&c.lat<57);assert.ok(c.lon>-96&&c.lon<-74);}
  assert.ok(tools.choices('Trent Peterborough').some(c=>c.institution==='Trent University'));
  assert.ok(tools.choices('Toronto',true).length>tools.choices('Toronto').length);
  assert.equal(tools.find('oiart').address,'502 Newbold Street, London, ON');
});
test('area matching is word-bounded, accent-insensitive and never geocodes an address',()=>{
  assert.equal(tools.areaMatches('East City, Edmison Heights','East City / Ashburnham').length,1);
  assert.equal(tools.areaMatches('York','Yorkville').length,0);
  assert.equal(tools.areaMatches('Cote','Côté').length,1);
  assert.equal(tools.areaMatches('185 Hunter Street East','East City').length,0);
  const generic=tools.areaEvidence({Neighbourhood:'Peterborough, Ontario'},{avoidedAreas:'Downtown'},'Peterborough, Ontario');
  assert.equal(generic.unknown,true);assert.equal(generic.avoided.length,0);
  const specific=tools.areaEvidence({Neighbourhood:'Downtown / East City'},{preferredAreas:'East City',avoidedAreas:'Downtown'},'Peterborough, Ontario');
  assert.equal(specific.preferred.length,1);assert.equal(specific.avoided.length,1);
});

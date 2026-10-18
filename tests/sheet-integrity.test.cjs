const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('cleaned fallback has unique records and the required schema',()=>{
  const csv=fs.readFileSync(path.join(__dirname,'../oiart_listings.csv'),'utf8');
  const ids=[...csv.matchAll(/^"([^"]+)",/gm)].map(m=>m[1]).slice(1);
  assert.ok(ids.length>0);assert.equal(new Set(ids).size,ids.length);
  for(const id of ['A3','A4','A7','E8','E3','E4','B6','WAT-L-0110'])assert.equal(ids.includes(id),false,id);
  const header=csv.split('\n')[0];
  for(const field of ['SearchID','OffMarketSince','TimingConfirmed','Roommates','ImageURL'])assert.ok(header.includes(`"${field}"`),field);
});

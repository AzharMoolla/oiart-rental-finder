const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../listing-rules.js');
const R=globalThis.ListingRules;
test('paid and negative parking beat a checkbox or the word available',()=>{
  assert.equal(R.parking({Parking:'Available for $25/month',ParkingConfirmed:true}).pts,7);
  assert.equal(R.parking({Parking:'No parking; street only',ParkingConfirmed:true}).pts,0);
  assert.equal(R.parking({Parking:'Not stated; parking-filter result'}).state,'unknown');
  assert.equal(R.parking({Parking:'Parking available upon request'}).state,'unknown');
  assert.equal(R.parking({Parking:'Not included; extra $50/month'}).state,'paid');
});
test('utility mentions do not invent included internet or all-in pricing',()=>{
  assert.equal(R.internet({'Internet / utilities':'Utilities included; internet not stated'}).state,'unknown');
  assert.equal(R.internet({'Internet / utilities':'Wi-Fi included; utilities extra'}).allIn,false);
  assert.equal(R.internet({'Internet / utilities':'Wi-Fi included; utilities extra'}).includedNet,true);
  assert.equal(R.internet({'Internet / utilities':'No internet / internet extra'}).pts,2);
  assert.equal(R.internet({'Internet / utilities':'Wi-Fi and all utilities included'}).pts,5);
  assert.equal(R.internet({'Internet / utilities':'Wi-Fi and all utilities included'}).allIn,true);
});
test('shared-home rooms never become private apartments',()=>{
  assert.equal(R.privacy({Type:'Private room in shared house'}).pts,12);
  assert.equal(R.privacy({Type:'Basement room in shared apartment'}).pts,11);
  assert.equal(R.privacy({Type:'Shared bedroom in apartment'}).pts,5);
  assert.equal(R.privacy({Type:'Private 1-bedroom apartment'}).pts,15);
});
test('verification questions and old July checkboxes are not move-in facts',()=>{
  assert.equal(R.timing({Availability:'', 'What to verify':'Confirm November'},'November 2026').state,'unknown');
  assert.equal(R.timing({Availability:'July 2026',JulyConfirmed:true},'November 2026').state,'mismatch');
  assert.equal(R.timing({Availability:'November 2025'},'November 2026').state,'mismatch');
  assert.equal(R.timing({Availability:'2026-11-01'},'November 2026').pts,10);
});
test('inventory groups are independent of scoring profiles',()=>{
  assert.equal(R.matchesSearch({ID:'F1',SearchID:'london-oiart'},'trent-peterborough'),false);
  assert.equal(R.matchesSearch({ID:'new',SearchID:'trent-peterborough'},'trent-peterborough'),true);
  assert.equal(R.matchesSearch({ID:'WAT-L-0112'},'waterloo'),true);
  assert.equal(R.matchesSearch({ID:'unassigned'},'waterloo'),false);
});
test('tracking query strings cannot defeat direct listing deduplication',()=>{
  assert.equal(R.canonicalKey('https://www.facebook.com/marketplace/item/123/?ref=search'),'facebook:123');
  assert.equal(R.canonicalKey('https://www.kijiji.ca/v-room-rental-roommate/london/test/1738506664?x=2'),'kijiji:1738506664');
  assert.equal(R.canonicalKey('javascript:alert(1)'), '');
});
test('drive ranges use the upper bound and silence stays unknown',()=>{
  assert.equal(R.driveMinutes('10-15 min'),15);
  assert.equal(R.driveMinutes('~7'),7);
  assert.equal(R.driveMinutes('8 to 12 minutes'),12);
  assert.ok(Number.isNaN(R.driveMinutes('')));
});

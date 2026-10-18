const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../listing-rules.js');
const rules=globalThis.ListingRules;
test('source platforms group aliases without rewriting the stored source',()=>{
  assert.equal(rules.sourceSite({Source:'Kijiji (private leaseholder)',URL:''}),'Kijiji');
  assert.equal(rules.sourceSite({Source:'Independent',URL:'https://www.facebook.com/marketplace/item/123'}),'Facebook Marketplace');
  assert.equal(rules.sourceSite({URL:'https://www.places4students.com/Student/Listing?ID=123'}),'Places4Students');
  assert.equal(rules.sourceSite({Source:'Babcock & Robinson (official)'}),'Babcock & Robinson');
  assert.notEqual(rules.sourceSite({URL:'https://facebook.com.evil.example/'}),'Facebook Marketplace');
});
test('housing markets are inferred from the listing, never from its platform',()=>{
  assert.equal(rules.housingMarket({Type:'Private room with own bathroom',Source:'Roomies'}),'room');
  assert.equal(rules.housingMarket({Type:'Shared bedroom',Source:'Facebook Marketplace'}),'sharedBedroom');
  assert.equal(rules.housingMarket({Type:'1-bedroom basement apartment',Source:'Facebook Marketplace'}),'unit');
  assert.equal(rules.housingMarket({Type:'Room in a basement'}),'room');
  assert.equal(rules.housingMarket({Type:'Private room in a 2-bedroom apartment'}),'room');
  assert.equal(rules.housingMarket({Type:'1-bedroom apartment',ListingKind:'Building page'}),'building');
  assert.equal(rules.housingMarket({Type:''}),'unknown');
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../apps-script/OIART_WRITEBACK.gs'),'utf8');
function context(){
  const ctx=vm.createContext({});vm.runInContext(source,ctx);return ctx;
}
test('image verification dates stay dates, generic timing is boolean',()=>{
  const c=context();
  assert.equal(c.normalizeValue_('ImageChecked','2026-10-18'),'2026-10-18');
  assert.equal(c.normalizeValue_('TimingConfirmed','TRUE'),true);
  assert.equal(c.normalizeValue_('TimingConfirmed','FALSE'),false);
  assert.equal(c.normalizeValue_('FriendNotes','=1+1'),"'=1+1");
});
test('listing facts and search assignments are not writable workflow fields',()=>{
  const c=context();
  for(const field of ['ID','SearchID','Rent text','PetsAllowed','Accessible','Roommates'])assert.equal(c.isWritable_(field),false,field);
  for(const field of ['Archived','Status','FriendNotes','TimingConfirmed','ImageURL'])assert.equal(c.isWritable_(field),true,field);
});
test('renamed listings tab is supported',()=>{
  const c=context(),sheet={};
  c.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:name=>name==='OIART BASED LISTINGS'?sheet:null})};
  assert.equal(c.getListingsSheet_(),sheet);
});

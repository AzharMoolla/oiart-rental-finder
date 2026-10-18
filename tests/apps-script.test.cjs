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

function profileContext(){
  const data=[['ProfileID','Name','SearchID','ProfileJSON','UpdatedAt']];
  const sh={getLastRow:()=>data.length,getMaxRows:()=>1000,insertRowsAfter:()=>{},getRange:(row,col,n=1,m=1)=>({
    getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[row+i-1]?.[col+j-1]??'')),
    getValue:()=>data[row-1]?.[col-1]??'',
    setValues:values=>values.forEach((r,i)=>{data[row+i-1]??=[];r.forEach((v,j)=>data[row+i-1][col+j-1]=v);})
  })};
  const c=context();c.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>sh}),flush:()=>{}};c.json_=x=>x;
  return {c,data};
}
test('profiles upsert without duplicates, and stale devices cannot overwrite newer answers',()=>{
  const {c,data}=profileContext(),p={id:'friend-1',name:'Friend',budgetRent:1000,answers:{parkingNeed:'yes'}};
  const first=c.saveSearchProfile_(p,'');assert.equal(first.ok,true);assert.ok(first.updatedAt);assert.equal(data.length,2);
  assert.equal(c.saveSearchProfile_(p,'').ok,true,'A retry of the same successful save is idempotent');
  const edited={...p,budgetRent:1200};
  assert.equal(c.saveSearchProfile_(edited,'stale').code,'PROFILE_CONFLICT');assert.equal(JSON.parse(data[1][3]).budgetRent,1000);
  assert.equal(c.saveSearchProfile_(edited,first.updatedAt).ok,true);assert.equal(data.length,2);assert.equal(JSON.parse(data[1][3]).budgetRent,1200);
  assert.equal(c.searchProfileRows_()[0].ProfileID,'friend-1');
  assert.equal(c.saveSearchProfile_({...p,id:'bad id'},'').ok,false);
});

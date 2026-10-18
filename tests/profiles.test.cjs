const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function load(saved,failStorage=false){
  const memory=new Map(saved?[['hf_profiles',JSON.stringify(saved)]]:[]);
  const c=vm.createContext({URLSearchParams,location:{search:''},localStorage:{
    getItem:key=>memory.get(key)??null,
    setItem:(key,value)=>{if(failStorage)throw Error('Quota exceeded');memory.set(key,value);}
  }});
  for(const file of ['searches.js','profile.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c);
  return {c,value:expr=>JSON.parse(vm.runInContext(`JSON.stringify(${expr})`,c))};
}
test('only OIART is seeded on a fresh device',()=>{
  const {value}=load();
  assert.deepEqual(value('HF.list.map(p=>p.searchId)'),['london-oiart']);
  assert.equal(value('activeProfile().tuned'),true);
});
test('old generated stubs are removed without deleting real saved profiles',()=>{
  const p={id:'preset-waterloo',name:'Waterloo',searchId:'waterloo',budgetRent:1400,pois:[{name:'University of Waterloo - EV3',lat:43.4685,lon:-80.539}]};
  const real={...p,id:'friend-real',name:'Friends real search',tuned:true};
  const {value}=load({list:[p,real],activeId:p.id});
  assert.deepEqual(value('HF.list.map(p=>p.id).sort()'),['friend-real','preset-london-oiart']);
  assert.equal(value('HF.list.some(p=>p.id===HF.activeId)'),true);
});
test('a completed or edited old preset remains a genuine saved profile',()=>{
  const {value}=load({list:[{id:'preset-waterloo',name:'Waterloo',searchId:'waterloo',tuned:true}],activeId:'preset-waterloo'});
  assert.ok(value('HF.list.some(p=>p.id==="preset-waterloo")'));
});
test('large profile lists remain intact and storage failures are detectable',()=>{
  const list=Array.from({length:500},(_,i)=>({id:'friend-'+i,name:'Friend '+i,searchId:'trent-peterborough',tuned:true}));
  const {value}=load({list,activeId:'friend-499'});
  assert.equal(value('HF.list.length'),501);
  assert.equal(value('activeProfile().id'),'friend-499');
  assert.equal(load(null,true).value('profilesSavedLocally'),false);
});

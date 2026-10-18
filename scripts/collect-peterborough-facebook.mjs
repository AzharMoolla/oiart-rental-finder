import {FacebookMarketplace} from '../.local-tools/secondhand-mcp/dist/marketplaces/facebook/index.js';
import {mkdir,writeFile} from 'node:fs/promises';

// Collect typed records from the same adapter used by Secondhand MCP. Review
// the raw evidence before importing anything into the shared inventory.
const adapter=new FacebookMarketplace();
const queries=['room for rent','private room','student room','studio apartment','bachelor apartment','basement apartment','one bedroom apartment','apartment for rent'];
const found=new Map(),searches=[],failures=[];
const output='.local-tools/peterborough-facebook-sweep-2026-10-18.json';
await mkdir('.local-tools',{recursive:true});
async function checkpoint(){await writeFile(output,JSON.stringify({capturedAt:new Date().toISOString(),searches,failures,listings:[...found.values()]},null,2));}
for(const query of queries){
  const result=await adapter.search({query,location:'Peterborough, Canada',radius:10,limit:24,showSold:false});
  searches.push({query,success:result.success,count:result.listings.length,error:result.error});
  for(const row of result.listings){
    if(!/peterborough|lakefield|selwyn|bridgenorth|ennismore|douro/i.test(row.location||''))continue;
    if(!found.has(row.id))found.set(row.id,{...row,searchQueries:[query]});
    else found.get(row.id).searchQueries.push(query);
  }
  await checkpoint();console.log(JSON.stringify({query,returned:result.listings.length,uniqueLocal:found.size,error:result.error}));
  await new Promise(r=>setTimeout(r,1500));
}
let checked=0;
for(const row of found.values()){
  try{row.details=await adapter.getListingDetails(row.id);}catch(e){failures.push({id:row.id,error:String(e)});row.detailError=String(e);}
  checked++;if(checked%10===0){await checkpoint();console.log(JSON.stringify({detailsChecked:checked,total:found.size}));}
  await new Promise(r=>setTimeout(r,500));
}
await checkpoint();console.log(JSON.stringify({finished:true,unique:found.size,failures:failures.length,output}));

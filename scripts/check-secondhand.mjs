import {Client} from '../.local-tools/secondhand-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../.local-tools/secondhand-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {fileURLToPath} from 'node:url';
import {writeFile,mkdir} from 'node:fs/promises';
const client=new Client({name:'rental-secondhand-check',version:'1'});
const results=[];
try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../.local-tools/secondhand-mcp/dist/index.js',import.meta.url))],env:{...process.env,MARKETPLACES:'facebook'}}));
  console.log('TOOLS',JSON.stringify((await client.listTools()).tools.map(t=>t.name)));
  const searches=process.argv.includes('--broad') ? [['sofa','Toronto, Canada'],['bicycle','New York, NY'],['room for rent','Peterborough, Canada']] : [['room for rent','Peterborough, Canada']];
  let checkedDetails=false;
  for(const [query,location] of searches){
    const result=await client.callTool({name:'search_marketplace',arguments:{marketplace:'facebook',query,location,limit:3,includeImages:true,radiusMiles:15}},undefined,{timeout:45000});
    results.push({query,location,result});
    const text=result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
    console.log('SEARCH',JSON.stringify({query,location,isError:result.isError,response:text.slice(0,5000),structured:result.structuredContent}));
    const id=text.match(/(?:ID:|\/marketplace\/item\/)\s*(\d+)/)?.[1];
    if(id && !checkedDetails){
      const details=await client.callTool({name:'get_listing_details',arguments:{marketplace:'facebook',listingId:id,imageMode:'urls',maxImages:1}},undefined,{timeout:30000});
      results.push({listingId:id,details});console.log('DETAILS',JSON.stringify(details).slice(0,3500));checkedDetails=true;
    }
  }
  await mkdir('.local-tools',{recursive:true});
  await writeFile('.local-tools/secondhand-check-results.json',JSON.stringify(results,null,2));
}finally{await client.close();}

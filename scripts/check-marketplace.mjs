import { Client } from '../.local-tools/facebook-marketplace-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../.local-tools/facebook-marketplace-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { fileURLToPath } from 'node:url';
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../.local-tools/facebook-marketplace-mcp/dist/index.js',import.meta.url))]});
const client=new Client({name:'homefinder-smoke-check',version:'1.0.0'});
try{
  await client.connect(transport);
  console.log('TOOLS',JSON.stringify((await client.listTools()).tools.map(t=>t.name)));
  const searches=process.argv.includes('--broad') ? [
    ['sofa','Toronto, Ontario, Canada'],['bicycle','Toronto, Ontario, Canada'],
    ['car','New York, New York'],['go kart','Phoenix, Arizona'],
    ['apartment','London, Ontario, Canada'],['room','Peterborough, Ontario, Canada']
  ] : [['room for rent','Peterborough, Ontario, Canada']];
  let detailsChecked=false;
  for(const [query,location] of searches){
    const result=await client.callTool({name:'search_marketplace',arguments:{query,location,limit:3,showSold:process.argv.includes('--broad'),includeImages:true}},undefined,{timeout:25000});
    const text=result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
    console.log('SEARCH',JSON.stringify({query,location,isError:!!result.isError,response:text.slice(0,1800)}));
    const id=text.match(/\bID: (\d+)/)?.[1];
    if(id && !detailsChecked){
      const details=await client.callTool({name:'get_listing_details',arguments:{listingId:id}},undefined,{timeout:25000});
      console.log('DETAILS',JSON.stringify(details).slice(0,2500));detailsChecked=true;
    }
  }
}catch(e){console.error(String(e));process.exitCode=1;}
finally{await client.close();}

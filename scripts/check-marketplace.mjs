import { Client } from '../.local-tools/facebook-marketplace-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../.local-tools/facebook-marketplace-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { fileURLToPath } from 'node:url';
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../.local-tools/facebook-marketplace-mcp/dist/index.js',import.meta.url))]});
const client=new Client({name:'homefinder-smoke-check',version:'1.0.0'});
try{
  await client.connect(transport);
  console.log('TOOLS',JSON.stringify((await client.listTools()).tools.map(t=>t.name)));
  const result=await client.callTool({name:'search_marketplace',arguments:{query:'room for rent',location:'Peterborough, Ontario, Canada',limit:2,includeImages:true}},undefined,{timeout:25000});
  console.log('SEARCH',JSON.stringify(result));
}catch(e){console.error(String(e));process.exitCode=1;}
finally{await client.close();}

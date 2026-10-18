import { Client } from '../.local-tools/facebook-marketplace-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../.local-tools/facebook-marketplace-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { fileURLToPath } from 'node:url';
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../.local-tools/browser/node_modules/@playwright/mcp/cli.js',import.meta.url)),'--browser','msedge','--headless','--isolated']});
const client=new Client({name:'housing-browser-check',version:'1.0.0'});
try{
  await client.connect(transport);
  const list=await client.listTools();console.log('Browser tools:',list.tools.length);
  const result=await client.callTool({name:'browser_navigate',arguments:{url:'http://127.0.0.1:4186/?search=trent-peterborough'}},undefined,{timeout:30000});
  const snapshot=result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
  if(result.isError || !snapshot.includes('Home Finder'))throw new Error(snapshot.slice(0,1000));
  console.log('Browser MCP navigates and reads Home Finder successfully.');
}finally{await client.close();}

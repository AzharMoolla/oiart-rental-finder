import {writeFile} from 'node:fs/promises';
import '../csv-data.js';

// Run after a reviewed Sheet cleanup so the offline seed cannot resurrect rows.
const id='1ddciH2oqLcQxEePD-AEoO4GCqI8XztRcC1YTMJxZm9s';
const sources=[['oiart_listings.csv',280478168,'ID'],['oiart_sites.csv',262262253,'Category']];
for(const [filename,gid,required] of sources){
  // Unlike gviz, native CSV does not null minority cell types in a column.
  const res=await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,{signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw new Error(`${filename}: HTTP ${res.status}`);
  const {header,rows}=CsvData.read(await res.text());
  if(!header.includes(required))throw new Error(`${filename}: missing ${required} header`);
  if(!rows.length)throw new Error(`${filename}: refusing to replace seed with empty data`);
  await writeFile(new URL(`../${filename}`,import.meta.url),CsvData.stringify(header,rows));
  console.log(`${filename}: ${rows.length} rows, ${header.length} columns`);
}

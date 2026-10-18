import {writeFile} from 'node:fs/promises';

// Run after a reviewed Sheet cleanup so the offline seed cannot resurrect rows.
const id='1ddciH2oqLcQxEePD-AEoO4GCqI8XztRcC1YTMJxZm9s';
const sources=[['oiart_listings.csv',280478168,'ID'],['oiart_sites.csv',262262253,'Category']];
function value(cell){
  const v=cell?.v;
  if(v==null)return '';
  if(typeof v==='string' && /^Date\(/.test(v)){
    const m=v.match(/^Date\((\d+),(\d+),(\d+)(?:,.*)?\)$/);
    if(m)return `${m[1]}-${String(+m[2]+1).padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  }
  return typeof v==='boolean' ? String(v).toUpperCase() : String(v);
}
const quote=v=>`"${String(v).replaceAll('"','""')}"`;
for(const [filename,gid,required] of sources){
  const res=await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&headers=1&gid=${gid}`,{signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw new Error(`${filename}: HTTP ${res.status}`);
  const text=await res.text();
  const start=text.indexOf('{'),end=text.lastIndexOf('}');
  const data=JSON.parse(text.slice(start,end+1));
  if(data.status==='error' || !data.table)throw new Error(`${filename}: unexpected Sheet response`);
  const header=data.table.cols.map(c=>c.label);
  if(!header.includes(required))throw new Error(`${filename}: missing ${required} header`);
  const rows=data.table.rows.map(r=>header.map((_,i)=>value(r.c[i]))).filter(r=>r.some(Boolean));
  if(!rows.length)throw new Error(`${filename}: refusing to replace seed with empty data`);
  await writeFile(new URL(`../${filename}`,import.meta.url),[header,...rows].map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n');
  console.log(`${filename}: ${rows.length} rows, ${header.length} columns`);
}

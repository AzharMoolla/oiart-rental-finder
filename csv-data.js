(function(root){
  function read(text){
    const rows=[];let row=[],field='',quoted=false;
    text=String(text).replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const ch=text[i],next=text[i+1];
      if(quoted){
        if(ch==='"'&&next==='"'){field+='"';i++;}
        else if(ch==='"')quoted=false;
        else field+=ch;
      }else if(ch==='"')quoted=true;
      else if(ch===','){row.push(field);field='';}
      else if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';}
      else if(ch!=='\r')field+=ch;
    }
    if(quoted)throw new Error('Incomplete CSV response');
    if(field||row.length){row.push(field);rows.push(row);}
    const header=(rows.shift()||[]).map(s=>s.trim());
    return {header,rows:rows.filter(r=>r.some(s=>s.trim()))};
  }
  function objects(text){
    const {header,rows}=read(text);
    return rows.map((r,i)=>({...Object.fromEntries(header.map((h,j)=>[h,r[j]??''])),_RowNumber:i+2}));
  }
  function stringify(header,rows){
    const quote=s=>'"'+String(s??'').replaceAll('"','""')+'"';
    return [header,...rows].map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n';
  }
  root.CsvData=Object.freeze({read,objects,stringify});
})(globalThis);

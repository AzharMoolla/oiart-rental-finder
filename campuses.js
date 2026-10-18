/* Offline campus choices and explicit neighbourhood-name matching. */
(function(root){
  const normalized=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const list=()=>CAMPUS_CATALOGUE.campuses;
  const find=id=>list().find(c=>c.id===id);
  const label=c=>{
    const name=c.name.replace(/^Main(?: Campus)?\s*[-:]?\s*/i,'').replace(/^\((.*)\)$/,'$1').trim()||c.city;
    return `${c.institution} - ${name}`+(normalized(name).includes(normalized(c.city))?'':` (${c.city})`);
  };
  const poi=c=>({name:label(c),lat:c.lat,lon:c.lon,campusId:c.id});
  function choices(query='',all=false){
    const words=normalized(query).split(' ').filter(Boolean);
    return list().filter(c=>(all||c.main)&&words.every(w=>normalized(label(c)+' '+c.address).includes(w)));
  }
  const areaNames=value=>String(value||'').split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
  function areaMatches(value,neighbourhood){
    const hay=' '+normalized(neighbourhood)+' ';
    return areaNames(value).filter(n=>hay.includes(' '+normalized(n)+' '));
  }
  function areaEvidence(row,answers,city=''){
    // Only the labelled neighbourhood is compared. An address is not a polygon
    // or neighbourhood boundary, and we never infer one from a map pin.
    const area=row.Neighbourhood||'';
    const clean=value=>normalized(value).replace(/\b[a-z]\d[a-z] \d[a-z]\d\b/g,'').replace(/\b(?:ontario|on)\b/g,'').trim();
    const unknown=!normalized(area)||(city&&clean(area)===clean(city));
    return {preferred:unknown?[]:areaMatches(answers.preferredAreas,area),avoided:unknown?[]:areaMatches(answers.avoidedAreas,area),unknown:!!unknown};
  }
  root.CampusTools=Object.freeze({list,find,label,poi,choices,areaNames,areaMatches,areaEvidence,normalized});
})(globalThis);

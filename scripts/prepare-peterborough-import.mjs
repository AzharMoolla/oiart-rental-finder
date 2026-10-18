import {readFile,writeFile} from 'node:fs/promises';
import '../listing-rules.js';

// Build a review file only. Importing into Sheets is a separate explicit step.
const read=async name=>JSON.parse(await readFile(`.local-tools/${name}`,'utf8'));
const fb=await read('peterborough-facebook-sweep-2026-10-18.json');
const web=await read('peterborough-web-sweep-2026-10-18.json');
const reviewed=await read('peterborough-reviewed-facts.json');
const rows=[],skipped=[];
const today='2026-10-18';
const line=(t,label)=>t.split('\n').map(s=>s.trim()).filter(Boolean).find((_,i,a)=>a[i-1]===label)||'';
const flat=t=>String(t||'').replace(/\s+/g,' ').trim();
const money=s=>Number(String(s).replace(/[^\d.]/g,''));
const image=x=>typeof x==='string'?x:Array.isArray(x)?image(x[0]):x?.contentUrl||x?.url||'';
function base(id,source,url){return {ID:id,Source:source,SearchID:'trent-peterborough',Action:'Verify',ListingKind:'Direct listing',
  'Date seen':today,'Last checked':today,URL:url,Archived:false,IsNew:true,Status:'New',Contacted:false,ViewingBooked:false,
  ParkingConfirmed:false,InternetConfirmed:false,AddressConfirmed:false,JulyConfirmed:false,TimingConfirmed:false,
  UpdatedAt:new Date().toISOString(),UpdatedBy:'Codex reviewed Peterborough sweep',CanonicalKey:ListingRules.canonicalKey(url),
  'What to verify':'Confirm current vacancy, total monthly cost, exact address, lease dates and suitability. Page checked, not landlord-confirmed.'};}
function amenities(r,desc){
  const t=flat(desc);
  if(/no (?:on.site )?parking|no parking available|no on.site parking/i.test(t))r.Parking='No parking';
  else if(/parking.{0,35}(?:\$|extra|fee)|\$\d+.{0,20}parking/i.test(t))r.Parking='Parking extra; confirm fee';
  else if(/parking.{0,20}(?:may be|upon request|restrictions)|assigned parking spot available between/i.test(t))r.Parking='Parking subject to confirmation';
  else if(/parking (?:available|included)|free parking|parking (?:space|spot)|driveway parking|lots of parking|ample parking|off.street parking/i.test(t))r.Parking='Parking available (advertised)';
  const net=/wi.?fi|internet/i.test(t), netExtra=/(?:wifi|wi-fi|internet).{0,15}(?:excluded|not included)|excluding (?:wifi|wi-fi|internet)/i.test(t);
  const all=/all.inclusive|all inclusive|all utilities.{0,20}included|utilities and.{0,15}included|utilities.{0,15}included/i.test(t);
  if(netExtra)r['Internet / utilities']='Internet extra / not included';
  else if(net&&/included|all.inclusive|all inclusive/i.test(t))r['Internet / utilities']='Internet included'+(all?'; utilities included':'');
  else if(all)r['Internet / utilities']='Utilities included; internet not stated';
  if(/utilities (?:not included|extra)|(?:plus|\+) utilities|utilities.{0,10}responsibility/i.test(t))r['Internet / utilities']=(r['Internet / utilities']||'Internet not stated')+'; utilities extra';
  if(/hydro (?:excluded|extra|separate)|plus hydro|\+ hydro/i.test(t))r['Internet / utilities']=(r['Internet / utilities']||'Internet not stated')+'; hydro extra';
  if(/no pets|pets (?:not allowed|not permitted)|no additional pets/i.test(t))r.PetsAllowed='FALSE';
  else if(/pet friendly|pets.{0,15}(?:welcome|allowed)|dog or cat no problem/i.test(t))r.PetsAllowed='TRUE';
  if(/no laundry|does not include laundry/i.test(t))r.Laundry='Not available';
  else if(/laundry|washer|dryer/i.test(t))r.Laundry='On site (advertised; confirm terms)';
  if(/unfurnished|not furnished|bedrooms are not/i.test(t))r.Furnishing='Unfurnished';
  else if(/furnished/i.test(t))r.Furnishing='Furnished (advertised)';
  if(/12.month|1.year|one.year|yearly (?:lease|contract)/i.test(t))r.LeaseMonths=12;
  else if(/month.to.month/i.test(t))r.LeaseMonths='Month-to-month';
}
function pin(r,lat,lon){if(Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&lat!=null&&lon!=null){r.Latitude=Number(lat);r.Longitude=Number(lon);r['What to verify']+=' Map pin is source-supplied and approximate, not a verified street address.';}}
for(const x of fb.listings){
  if(reviewed.skipFacebook[x.id]){skipped.push({url:x.url,reason:reviewed.skipFacebook[x.id]});continue;}
  const facts=reviewed.facebook[x.id];
  if(!facts||!x.details?.description||x.details.unavailable){skipped.push({url:x.url,reason:'No reviewed/live description'});continue;}
  const [title,type,price,availability,note]=facts;
  const r=base(`PTB-FB-${x.id}`,'Facebook Marketplace',x.url);
  r['Listing / lead']=title;r.Type=type;r.Neighbourhood=x.location;
  const amount=price===null?null:price||x.priceNumeric||money(x.price);
  if(amount>10)r['Approx monthly share']=amount;
  r['Rent text']=price===null?'Price needs confirmation':`CAD ${amount}/month; see inclusions`;
  r.Availability=availability;r['Why add / note']=note;
  amenities(r,x.details.description);
  const address=flat(x.details.description).match(/(?:\b(?:90 Golden Mdws Dr|100 Benson Ave\.?|1630 Hetherington Drive|345 Grady Ave|947 Southlawn Dr|657 Bethune Street|323 Dalhousie St|874 George St N|1211 Goodfellow Rd|1189 Talwood Crt\.?))\b/i);
  if(address)r['Address / locator']=address[0]+(x.id==='1817163089457592'?' apartment 2':'')+', Peterborough, ON';
  if(x.id==='1689452815845641'){r.Neighbourhood='Cavan (outside Peterborough)';r['Address / locator']='Cavan; exact address required';}
  else pin(r,x.details.locationCoords?.latitude,x.details.locationCoords?.longitude);
  r.ImageURL=x.id==='1185560660190315'?'':image(x.details.images)||image(x.images);
  if(r.ImageURL){r.ImageAlt=title+' (listing photo; may be representative)';r.ImageSource=x.url;}
  rows.push(r);
}
for(const x of web.records.filter(x=>/roomies.ca\/rooms\/\d+$/.test(x.url))){
  const s=x.structured.find(y=>y?.['@type']==='RealEstateListing');if(!s||x.status!==200)continue;
  const id=x.url.split('/').pop(),t=x.text,about=s.about||{};
  const r=base(`PTB-RM-${id}`,'Roomies',x.url);
  const location=x.h1.split('\n').slice(-1)[0];
  r['Listing / lead']=(/room$/.test(x.h1.split('\n')[0])?location:x.h1.split('\n')[0])+': '+x.title.split(' | ')[0];
  r.Type=/Shared (?:unfurnished |furnished )?room/i.test(x.title)?'Shared bedroom':/own bathroom/i.test(x.title)?'Private room with own bathroom':'Private room, shared bathroom';
  r.Neighbourhood=location;r['Address / locator']=[about.address?.streetAddress,about.address?.postalCode].filter(Boolean).join(', ');
  r['Approx monthly share']=id==='922792'?650:Number(s.offers?.price);
  r['Rent text']=`CAD ${r['Approx monthly share']}/month; bills ${line(t,'Bills').toLowerCase()}`;
  r.Availability=line(t,'Available on');r.Furnishing=line(t,'Room furnishing');
  const features=about.amenityFeature||[];
  if(features.some(a=>a.name==='Parking'&&a.value===true))r.Parking='Parking available (advertised)';
  if(features.some(a=>a.name==='Internet access'&&a.value===true))r['Internet / utilities']='Internet included'+(line(t,'Bills')==='Included'?'; utilities included':'; utilities extra');
  else if(line(t,'Bills')==='Included')r['Internet / utilities']='Utilities included; internet not stated';
  const description=t.split(/About the (?:room|property)\n/)[1]?.split(/\nAbout the roomies|\n[^\n]+verifications/)[0]||s.description;
  const extra={};amenities(extra,description);
  const knownInternet=r['Internet / utilities'];
  Object.assign(r,extra);
  if(knownInternet&&!/extra|not included/.test(extra['Internet / utilities']||''))r['Internet / utilities']=knownInternet;
  if(/not included/i.test(line(t,'Bills'))&&/all.inclusive/i.test(description))r['Internet / utilities']='Verify conflicting utility inclusions';
  const stay=line(t,'Stay length');if(stay)r.LeaseMonths=stay;
  const roomies=t.match(/\n(\d+) roomies?\n/);if(roomies)r.Roommates=+roomies[1];
  const gender=line(t,'Preferred gender');
  r['Why add / note']=[gender&&!/females or males/i.test(gender)?`Advertised preference: ${gender}.`:'',reviewed.roomiesNotes[id]||'Direct room page; confirm current terms and vacancy.'].filter(Boolean).join(' ');
  if(id==='922792')r.Parking='Parking extra $50/month';
  if(id==='1074006'||id==='1075384')r.DuplicateOf=id==='1075384'?'PTB-RM-1074006':'';
  if(id==='1025775')r.DuplicateOf='PTB-RM-1038153';
  if(id==='1062527')r.Type='Private room, shared bathroom';
  if(id==='842018')r.Availability='Verify stale December 1, 2025 date';
  Object.assign(r,reviewed.roomiesFields?.[id]||{});
  pin(r,about.latitude,about.longitude);r.ImageURL=image(s.image);r.ImageAlt=r['Listing / lead'];r.ImageSource=x.url;rows.push(r);
}
// Other-site records require a short human-reviewed summary; no raw descriptions
// or seller contact details are copied into the public inventory.
for(const x of web.records.filter(x=>x.url.includes('kijiji.ca/v-'))){
  const s=x.structured.find(y=>y?.offers),id=x.url.split('/').pop(),facts=reviewed.kijiji?.[id];
  if(!s||!facts||x.status!==200)continue;
  if(facts.skip){skipped.push({url:x.url,reason:facts.skip});continue;}
  const r=base(`PTB-KJ-${id}`,'Kijiji',x.url);
  r['Listing / lead']=facts.title||x.h1;r.Type=facts.type||'Private room, shared bathroom';
  r['Approx monthly share']=facts.price===null?'':facts.price||Number(s.offers.price);
  r['Rent text']=r['Approx monthly share']?`CAD ${r['Approx monthly share']}/month; see inclusions`:'Confirm conflicting price';
  r['Address / locator']=typeof s.address==='string'?s.address:s.address?.streetAddress||'';
  r.Neighbourhood=(x.text.match(/\nAbout ([^\n]+)\n/)||[])[1]||s.offers.availableAtOrFrom?.name||'Peterborough';
  r.Availability=facts.availability||'';r['Why add / note']=facts.note;
  amenities(r,s.description);Object.assign(r,facts.fields||{});
  if(facts.duplicate)r.DuplicateOf=facts.duplicate;
  pin(r,s.offers.availableAtOrFrom?.latitude,s.offers.availableAtOrFrom?.longitude);
  r.ImageURL=image(s.image)||image(x.images);r.ImageAlt=r['Listing / lead'];r.ImageSource=x.url;rows.push(r);
}
for(const x of web.records.filter(x=>x.url.includes('/apartment-buildings/'))){
  const b=x.structured.find(y=>y?.['@type']==='ApartmentComplex'),p=x.structured.find(y=>y?.offers?.lowPrice);
  if(!b||!p||x.status!==200)continue;
  const id=x.url.match(/\/p(\d+)\//)[1],r=base(`PTB-ZU-${id}`,'Zumper',x.url);
  r.ListingKind='Building page';r['Listing / lead']=b.name;r['Address / locator']=[b.address.streetAddress,b.address.addressLocality,b.address.postalCode].filter(Boolean).join(', ');
  r.Neighbourhood=(x.text.match(/CAN\|([^\n]+)/)||[])[1]||'Peterborough';
  r.Type='Apartment building; '+line(x.text,'BEDS')+' bedrooms (confirm specific unit)';
  // A building's floor-plan minimum is not a verified monthly quote for a unit.
  r['Rent text']=`Advertised building range CAD ${p.offers.lowPrice}-${p.offers.highPrice}/month; obtain unit quote`;
  r['Why add / note']='Building-level lead, not a confirmed individual vacancy. Advertised starting rent may vary by floor plan, fees and incentives; do not split whole-unit rent.';
  const a=b.amenityFeature||[];
  if(a.some(v=>/parking/i.test(v.name)&&v.value))r.Parking='Parking subject to unit/fee confirmation';
  if(a.some(v=>/laundry/i.test(v.name)&&v.value))r.Laundry='On site (building amenity)';
  if(/Pet Friendly/i.test(x.text))r.PetsAllowed='TRUE';
  pin(r,b.geo?.latitude,b.geo?.longitude);r.ImageURL=image(b.image);r.ImageAlt=b.name+' (building photo)';r.ImageSource=x.url;rows.push(r);
}
for(const facts of reviewed.managers||[]){
  const x=web.records.find(x=>x.url===facts.url);if(!x||x.status!==200)continue;
  const r=base(facts.id,'Babcock & Robinson (official)',x.url);
  Object.assign(r,facts.fields);r.ImageURL=image(x.images);r.ImageSource=x.url;r.ImageAlt=r['Listing / lead']+' (property photo)';rows.push(r);
}
for(const x of web.records.filter(x=>x.url.startsWith('https://www.babcockandrobinson.ca/apartments-for-rent-peterborough/'))){
  const t=x.text,title=x.h1;
  if(!title||x.status!==200||/DO NOT USE/i.test(title))continue;
  const amount=t.match(/\$([\d,]+)/),layout=t.match(/\n([^\n]*\bBed[^\n]*Bath[^\n]*|Single Occupancy Room Rental)\n/);
  if(!amount||!layout)continue;
  const id=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
  const r=base(`PTB-BR-${id}`,'Babcock & Robinson (official)',x.url);
  r['Listing / lead']=title;r['Address / locator']=title+', '+(/Bridgenorth/i.test(title)?'Ontario':'Peterborough, ON');
  r.Neighbourhood=/Bridgenorth/i.test(title)?'Bridgenorth':'Peterborough';
  r.Type=layout[1].includes('Single')?'Private room, shared bathroom':layout[1]+' (whole unit)';
  r['Approx monthly share']=money(amount[1]);r['Rent text']=`CAD ${r['Approx monthly share']}/month; whole-unit price unless marked room`;
  r.Availability=(t.match(/\n(Available[^\n]*)/)||[])[1]||'';
  const bills=(t.match(/\n((?:Including|Plus):[^\n]*)/)||[])[1];
  r['Internet / utilities']=bills?bills+'; internet not stated':'';
  r.Parking=/NO parking/i.test(t)?'No parking':/parking space|Parking for|parking for/i.test(t)?'Parking available (advertised)':'';
  if(/washer|laundry|dryer/i.test(t))r.Laundry=/hook ups/i.test(t)?'Laundry hookups; machines not confirmed':/coin-operated/i.test(t)?'Shared coin laundry':'On site (advertised)';
  r['Why add / note']='Direct property-manager page. '+(r.Type.startsWith('Private')?'Single-occupancy room; shared kitchen/bathroom.':'Full dwelling price, not divided between hypothetical housemates. ')+(bills||'Confirm utility inclusions.')+'; confirm live vacancy and lease conditions.';
  r.ImageURL=image(x.images).replace(/^http:\/\/static1.squarespace.com/,'https://static1.squarespace.com');r.ImageSource=x.url;r.ImageAlt=title+' (property photo)';rows.push(r);
}
const ids=new Set(),keys=new Set();
for(const r of rows){
  if(ids.has(r.ID)||keys.has(r.CanonicalKey))throw new Error('Duplicate import key '+r.ID);
  if(r['Approx monthly share']!==undefined&&r['Approx monthly share']!==''&&!(r['Approx monthly share']>10))throw new Error('Invalid price '+r.ID);
  ids.add(r.ID);keys.add(r.CanonicalKey);
}
await writeFile('.local-tools/peterborough-import-review.json',JSON.stringify({rows,skipped},null,2));
console.log(JSON.stringify({rows:rows.length,bySource:rows.reduce((a,r)=>(a[r.Source]=(a[r.Source]||0)+1,a),{}),photos:rows.filter(r=>r.ImageURL).length,flaggedDuplicates:rows.filter(r=>r.DuplicateOf).length,skipped}));

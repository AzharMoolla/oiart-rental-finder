import {readFile,writeFile} from 'node:fs/promises';
import '../listing-rules.js';

// Reviewed facts only. This builds a local proposal and never writes the Sheet.
const evidence=JSON.parse(await readFile('.local-tools/peterborough-extra-sources-2026-10-18.json','utf8')).records;
const rows=[],skipped=[],today='2026-10-18';
const flat=s=>String(s||'').replace(/\s+/g,' ').trim();
const last=url=>url.split('/').filter(Boolean).pop();
const photo=x=>typeof x==='string'?x:Array.isArray(x)?photo(x[0]):x?.contentUrl||x?.url||'';
function base(page,id,source,title){
  if(page.status!==200)throw new Error('Non-success source: '+page.url);
  const r={ID:id,Source:source,SearchID:'trent-peterborough',Action:'Verify',ListingKind:'Direct listing',
    'Listing / lead':title,Neighbourhood:'Peterborough (area not stated)',Type:'Private room, shared home',
    'Date seen':today,'Last checked':today,URL:page.url,Archived:false,IsNew:true,Status:'New',Contacted:false,
    ViewingBooked:false,ParkingConfirmed:false,InternetConfirmed:false,AddressConfirmed:false,JulyConfirmed:false,
    TimingConfirmed:false,UpdatedAt:new Date().toISOString(),UpdatedBy:'Codex source-by-source review',
    CanonicalKey:ListingRules.canonicalKey(page.url),
    'What to verify':'Confirm vacancy, total monthly cost, address, lease dates and suitability. Page checked, not landlord-confirmed.'};
  const img=page.images.find(u=>/^https:\/\//.test(u));
  if(img){r.ImageURL=img;r.ImageAlt=title+' (advertised photo; may be representative or staged)';r.ImageSource=page.url;r.ImageChecked=today;}
  rows.push(r);return r;
}
function note(r,s){r['What to verify']+=' '+s;}
function pin(r,lat,lon){if(lat!=null&&lon!=null&&Number.isFinite(+lat)&&Number.isFinite(+lon)){r.Latitude=+lat;r.Longitude=+lon;note(r,'Source-supplied map pin is approximate, not address-verified.');}}

// Room prices are copied from the description, not search-card guesses.
const kijiji={
 '1741355790':[795,'Available immediately','Two century-home rooms: CAD 795 or CAD 925. Shared five-bedroom home; no pets.'],
 '1744094539':[720,'','Furnished Stewart Street room; owner lives upstairs. Confirm what the broad inclusion claim covers.'],
 '1744090634':[650,'Available','Student-preferred room near Trent; utilities shared. Advertiser estimates five minutes by car.'],
 '1744006286':[750,'','Furnished west-end room near Fleming; serious students preferred.'],
 '1743983951':[750,'October 1; reconfirm current vacancy','Bethune Street room advertised for a female student.'],
 '1743890787':[800,'September 1, 2026; reconfirm current vacancy','Rooms in a three-bedroom basement; confirm whether CAD 800 is per bedroom.'],
 '1743884673':[1300,'November 1; contingent on bathroom completion','Outside Peterborough: Trent Lakes between Buckhorn and Bobcaygeon; requires a vehicle.'],
 '1743864681':[700,'','Room in two-bedroom basement shared with an older working adult; unfurnished, bed may be supplied.'],
 '1743786288':[900,'Available now','Owner-shared furnished room; older single adult preferred, no guests, stairs and weekly laundry limits.'],
 '1743783630':[900,'November 1','Possibly the same room as the other CAD 900 owner-shared advertisement; verify before contacting twice.'],
 '1743606268':[800,'','Driscoll Terrace room; female preferred, students welcome.'],
 '1743520102':[750,'','Female-only private bedroom in two-bedroom Lemay Grove basement; no parking and utilities extra.'],
 '1743480091':[750,'September 2026 to April 30, 2027','Two furnished rooms; confirm remaining lease and current vacancy.'],
 '1743469018':[850,'September 1, 2026; reconfirm current vacancy','Owner/family-shared Park Street South basement bedroom; five other occupants, no parking.'],
 '1743308325':[750,'October 2026','2125 Lorraine Drive student house; Trent enrolment and strict no-guest policy.'],
 '1743244674':[700,'','Glendale Drive room sharing with two working professionals.'],
 '1743138663':[850,'Available immediately','Owner-shared room near YMCA; weekly chore, no on-site parking. Check applicable tenancy arrangements.'],
 '1737049747':[690,'','Male-only furnished basement room; minimum six months, no parking/pets/guests.'],
 '1743056250':[null,'November 1','Welsh Street basement room; contact for price.'],
 '1743054184':[700,'','Female Trent students preferred. Description says rooms start at CAD 700, card says CAD 650; request a current quote.'],
 '1736805193':[800,'August 1; year not stated, reconfirm','Furnished north-end basement bedroom; female students preferred, 12-month lease.'],
 '1739582245':[750,'','Furnished private room advertising meals, utilities and internet; confirm terms and privacy.'],
 '1742913942':[700,'','Long-term male household; partly furnished on request, strict house rules.'],
 '1742819895':[600,'October 2026','University Heights furnished student room; no parking, strict no-guest policy.'],
 '1742797535':[600,'September 1; year not stated, reconfirm','Room near Fleming with shared kitchenette and bathroom.'],
 '1742721544':[830,'','London Street room: CAD 830 including internet, plus CAD 90-180 utilities per person; up to CAD 1,010 in winter.'],
 '1742700074':[750,'','Room in owner-shared garden home; scent-sensitive household, Wi-Fi extra, parking available.'],
 '1742684652':[725,'Contact for current availability','Private rooms from CAD 725 plus utilities; female tenants preferred, internet excluded.'],
 '1742676654':[800,'','Two rooms sharing with two male occupants; driveway parking and on-site laundry.'],
 '1742649959':[650,'September 1, 2026; reconfirm current vacancy','Female Trent student bedroom at 800 George Street North; no parking.'],
 '1742632464':[650,'November 1, 2026 to April 30, 2027','Female student preferred in Parkhill/Water shared house; parking for four students.']
};
const kjSkip={
 '1744147650':'Same Chamberlain Street description as existing Roomies 1057871; different advertised prices need confirmation.',
 '1744138092':'Same Parkhill Road furnished-room household as existing Roomies 789264/783528.',
 '1741177487':'Same Millbrook private-room advertisement as existing Kijiji 1744179243.',
 '1743696348':'Exact description cross-post of Roomies 1064608.',
 '1743546203':'Same November-December room as Roomies 1007929; price differs.',
 '1723136127':'Same Edinburgh Street female-student home as Places4Students 296174, which gives more current occupancy.'
};
for(const page of evidence.filter(p=>p.url.includes('kijiji.ca/v-'))){
  const id=last(page.url),f=kijiji[id];
  if(kjSkip[id]){skipped.push({url:page.url,reason:kjSkip[id]});continue;}
  if(!f)continue;
  const s=page.structured.find(s=>s?.offers)||{},d=flat(s.description||page.text.split('Description\n')[1]?.split('About ')[0]);
  const r=base(page,'PTB-KJ-'+id,'Kijiji',flat(page.h1));
  if(f[0]!=null)r['Approx monthly share']=f[0];
  r['Rent text']=f[0]==null?'Contact for price':`CAD ${f[0]}/month; confirm inclusions`;
  r.Availability=f[1];r['Why add / note']=f[2];
  const place=s.offers?.availableAtOrFrom;
  r['Address / locator']=place?.address?.streetAddress||({1743056250:'Welsh Street, Peterborough',1742684652:'Peterborough K9L 1T2'}[id]||'');
  pin(r,place?.latitude,place?.longitude);
  if(/no (?:onsite |on.site )?parking|no parking available/i.test(d))r.Parking='No parking';
  else if(/parking available upon request/i.test(d))r.Parking='Parking subject to confirmation';
  else if(/parking available|parking space|free parking spot|room for parking|parking for all/i.test(d))r.Parking='Parking available (advertised)';
  if(/wifi included|wi-fi.{0,10}included|internet.{0,15}included|included.{0,20}(?:wifi|internet)|rent includes.{0,100}internet/i.test(d))r['Internet / utilities']='Internet included (advertised; confirm other bills)';
  if(/all utilities|utilities included|all.inclusive|includes heat, hydro and water/i.test(d))r['Internet / utilities']=(r['Internet / utilities']||'Internet not stated')+'; utilities included';
  if(/utilities.{0,12}(?:extra|not included)|shared utilities|utilities are shared/i.test(d))r['Internet / utilities']=(r['Internet / utilities']||'Internet not stated')+'; utilities extra';
  if(/internet is not included|not wifi/i.test(d))r['Internet / utilities']='Internet extra; confirm utilities';
  if(/no pets|pet.free/i.test(d))r.PetsAllowed='FALSE';
  else if(/pet.friendly/i.test(d))r.PetsAllowed='TRUE';
  if(/unfurnished|not furnished/i.test(d))r.Furnishing='Unfurnished';else if(/furnished/i.test(d))r.Furnishing='Furnished (advertised)';
  if(/laundry|washer|dryer/i.test(d))r.Laundry='On site (advertised; confirm terms)';
  if(/12.month/i.test(d))r.LeaseMonths=12;
  if(id==='1743884673')r.Neighbourhood='Trent Lakes (outside Peterborough)';
  if(id==='1743783630')r.DuplicateOf='PTB-KJ-1743786288';
  if(id==='1743890787')delete r['Approx monthly share'];
  if(id==='1742684652'){r.Furnishing='Unfurnished';r.PetsAllowed='FALSE';}
  if(id==='1743056250'){r.Furnishing='Unfurnished';r.PetsAllowed='TRUE';}
  if(id==='1744090634')r['Est drive min']=5;
  if(id==='1742721544')r['Internet / utilities']='Internet included; utilities extra CAD 90-180/person';
  if(id==='1742700074')r['Internet / utilities']='Utilities included; internet extra (CAD 40 total household)';
  if(id==='1743308325'||id==='1742819895')r['Internet / utilities']='Internet, hydro and water included (advertised)';
  note(r,f[2]);
}

// Prices are per room except the explicitly identified private apartments.
const p4s={
 '168818':['Severn Court private student bedrooms',null,'Private room in student residence','Immediately; flexible 8/12-month options','CAD 675-825 per private room, all-inclusive; parking extra'],
 '325066':['Lemay Grove furnished student rooms',895,'Private room, shared house','Immediately; title still says September','Confirm current room and parking availability; eight-month lease advertised.'],
 '251269':['297 Mason Avenue upstairs room',null,'Private room, shared house','Verify: description says summer sublet, table says immediately','CAD 769-779/room; conflicting seasonal description and 12-month table.'],
 '325703':['721 Vinette Street one-bedroom apartment',1350,'1-bedroom apartment','November 1, 2026','CAD 1,350 whole apartment plus utilities; water and parking advertised included.'],
 '321997':['Female graduate-student basement room',700,'Private room, shared basement','Contact for date','Upper-year/postgraduate female roommate sought; no parking.'],
 '287100':['801 Water Street female-student rooms',600,'Private room, shared house','Immediately','Two rooms sharing with two others; all-inclusive excluding internet.'],
 '313346':['494 Wolfe Street student rooms',null,'Private room, shared apartment','Verify: July 1, 2026 description, immediately table','CAD 720-725; female students/young professionals preferred. Reconfirm current room and price.'],
 '255788':['323 Lindan Avenue furnished bedroom',null,'Private room, shared home','November 1, 2026','Price conflict: CAD 875 description versus CAD 880 rental field. Confirm before budgeting.'],
 '231783':['Cardinal Drive room with own bathroom',1200,'Private room with own bathroom','Immediately; description September 1, 2026','CAD 1,200 plus shared utilities; furnished; high-speed internet mentioned, inclusion unclear.'],
 '271144':['Gilmour Street two-bedroom basement',1450,'2-bedroom basement apartment','Immediately; description September/October','Whole unit, explicitly not per room; utilities included, internet unconfirmed.'],
 '324680':['82 Dublin Street riverside bedrooms',null,'Private room, shared house','Immediately','CAD 850-900 per bedroom; individual applicants accepted; landlord has a separate private wing.'],
 '296174':['214 Edinburgh Street female-student room',750,'Private room, shared house','Immediately','Shared with two senior/graduate female Trent students.'],
 '219053':['807 Highland student bedrooms',750,'Private room, shared house','October 1, 2026 or January 1, 2027','Confirm which of the two rooms remains and exact street suffix.'],
 '327167':['Verulam House one-bedroom apartment',1590,'1-bedroom apartment','November 1, 2026','236 Burnham Street second-floor unit; heat, water and one parking spot included; hydro/internet unconfirmed.'],
 '295831':['Female-household room sublet',750,'Private room, shared house','Immediately','Unfurnished bedroom, three other residents; utilities and Wi-Fi extra; seven-month lease advertised.'],
 '293746':['785 George Street North bedroom sublet',900,'Private room, shared house','2026-27 school year; contact for start','Furnished room in five-person quiet household, all utilities and Wi-Fi; two parking spots advertised.'],
 '295303':['Downtown room - November onwards',735,'Private room, shared house','November 2026 to April 2027','Description says six-month sublet; lease field says 12 months. Confirm term.'],
 '294836':['Near-Trent female-preferred sublet',765,'Private room, shared house','Immediately to May 2027','Downstairs room in seven-bedroom split-level household. Confirm remaining sublet term.'],
 '295841':['Female roommate in separate-entrance basement',750,'Private room, shared basement','Immediately','Share two-bedroom apartment; one parking spot, in-unit laundry; resident has pets.'],
 '295633':['Furnished bedroom in nine-person student house',800,'Private room, shared house','Verify: immediately field vs after-May description','Two kitchens/two bathrooms; ambiguous start year, confirm before planning a move.']
};
for(const page of evidence.filter(p=>/places4students.com\/schools\/196\/listings\/(?:properties|sublets)\/\d+$/.test(p.url))){
  const id=last(page.url),f=p4s[id];
  if(!f){skipped.push({url:page.url,reason:/273397|295862/.test(id)?'Clear cross-post of existing Philip Street Roomies / Eastdale Kijiji lead.':'2027/2028 intake or contradictory future availability, not a verified near-term lead.'});continue;}
  const r=base(page,'PTB-P4S-'+id,'Places4Students',f[0]),t=page.text;
  r.Type=f[2];r.Availability=f[3];r['Why add / note']=f[4];note(r,f[4]);
  if(f[1]!=null)r['Approx monthly share']=f[1];
  r['Rent text']=f[1]==null?f[4]:`CAD ${f[1]}/month; see inclusions`;
  r['Address / locator']=t.split('Location\n\n')[1]?.split('\n')[0]||'';
  if(r['Address / locator'].startsWith('Contact For Address'))r['Address / locator']='';
  const drive=t.match(/(\d+) mins\ndrive to Trent/);if(drive){r['Est drive min']=+drive[1];note(r,'Drive estimate comes from the source route widget; not independently time-checked.');}
  const lease=t.match(/LEASE PERIOD\n\n(\d+) month/);if(lease)r.LeaseMonths=+lease[1];
  if(/Internet Included/.test(t))r['Internet / utilities']='Internet included (advertised)';
  if(/All Inclusive/.test(t))r['Internet / utilities']=(r['Internet / utilities']||'Internet not stated')+'; utilities included';
  if(/Parking - Driveway|Includes Parking/.test(t))r.Parking='Parking available (advertised; confirm assignment)';
  if(/Common Laundry|Dryer in Unit|Washing Machine in Unit/.test(t))r.Laundry='On site (advertised; confirm terms)';
  if(/\nFurnished\n/.test(t))r.Furnishing='Furnished (advertised)';
  if(/Cats Allowed|Dogs Allowed/.test(t))r.PetsAllowed='TRUE';
  if(id==='168818')r.Parking='Parking extra; confirm fee';
  if(id==='325066')r.Parking='Parking subject to confirmation';
  if(id==='321997')r.Parking='No parking';
  if(id==='287100')r['Internet / utilities']='Utilities included; internet extra';
  if(id==='295831'){r.Furnishing='Unfurnished';r['Internet / utilities']='Utilities and internet extra';}
  if(id==='231783')r['Internet / utilities']='Utilities extra; internet inclusion unconfirmed';
  if(id==='271144')r['Internet / utilities']='Utilities included; internet not stated';
  if(id==='327167')r['Internet / utilities']='Heat and water included; hydro/internet unconfirmed';
  if(id==='325703')r['Internet / utilities']='Water included; other utilities extra; internet unconfirmed';
}

const visture={
 'renovated-2-bedroom-lower-level-apartment-with-shared-backyard-2100-utilities':['Lower 542 Hillside Street',2100,'2-bedroom lower apartment','October 20, 2026','Utilities extra including 40% water; backyard shared; some photos virtually staged.'],
 'newly-renovated-2-bedroom-basement-apartment-all-utilities-included':['Upper 569 Sherbrooke Street',1895,'2-bedroom upper apartment','October 15, 2026','Current description is an upper unit plus utilities, despite the outdated URL slug.'],
 'newly-renovated-3-bedroom-home-with-private-laundry-parking-in-central-peterborough':['Lower 467 Rubidge Street',2395,'3-bedroom apartment','October 15, 2026','Whole unit plus utilities; compact secondary rooms; pets welcomed.'],
 '2-bedroom-lower-unit-for-rent-200-lake-st-unit-2-peterborough':['Unit 2 - 200 Lake Street',1695,'2-bedroom lower apartment','October 1, 2026','Whole unit plus hydro; water/sewer included, shared laundry/backyard.'],
 'bright-3-bedroom-main-floor-home-with-a-c-parking-yard':['139 Dumble Avenue whole home',2975,'3-bedroom whole house','Available now','Whole home plus utilities; finished lower level and two bathrooms.'],
 '5-bedroom-student-house-all-inclusive-central-peterborough':['500 Aylmer Street North whole house',2895,'5-bedroom whole house','Available now','Whole-house joint lease only; no individual room rentals. CAD 2,495/2,695 for approved 3/4-student groups; do not divide by assumed roommates.'],
 'bright-spacious-2-bedroom-apartment-with-renovated-kitchen-parking':['Unit 6 - 455 Cordach Crescent',1795,'2-bedroom apartment','Available now','Whole unit plus hydro and water/sewer; pets considered, 12-month minimum.']
};
for(const page of evidence.filter(p=>p.url.includes('visture.ca/rental/'))){
  const f=visture[last(page.url)];if(!f)continue;
  const r=base(page,'PTB-VI-'+last(page.url).slice(0,45),'Visture (official)',f[0]);
  r['Approx monthly share']=f[1];r['Rent text']=`CAD ${f[1]}/month, whole unit; see inclusions`;
  r.Type=f[2];r.Availability=f[3];r['Address / locator']=f[0]+', Peterborough, ON';r['Why add / note']=f[4];note(r,f[4]);
  r.Laundry=/shared laundry/i.test(page.text)?'Shared laundry':'In-unit laundry (advertised)';
  if(!page.url.includes('hillside'))r.Parking='Parking included (advertised; confirm spaces)';
  r['Internet / utilities']='Utilities extra; internet not stated';
  if(f[0].startsWith('Lower 542'))r.Parking='';
  if(f[0].startsWith('500 Aylmer')){r['Internet / utilities']='Internet and utilities included';r.ParkingSpaces=3;}
  if(f[0].startsWith('Unit 2 -'))r['Internet / utilities']='Water/sewer included; hydro extra; internet not stated';
  if(f[0].includes('Rubidge')||f[0].includes('Dumble'))r.PetsAllowed='TRUE';
}
for(const page of evidence.filter(p=>/zumper.com\/apartment-buildings\/p(?:898413|213725)\//.test(p.url))){
  const s=page.structured.find(s=>s?.['@type']==='ApartmentComplex'),offer=page.structured.find(s=>s?.['@type']==='Product')?.offers;
  if(!s||!offer)continue;
  const r=base(page,'PTB-ZU-'+page.url.match(/\/p(\d+)\//)[1],'Zumper',s.name);
  r.ListingKind='Building page';r.Type='Apartment building';r['Address / locator']=[s.address?.streetAddress,'Peterborough'].join(', ');
  r['Rent text']=`Advertised CAD ${offer.lowPrice}-${offer.highPrice}/month range; request an exact unit quote`;
  r['Why add / note']='Building page, not an individually verified vacant unit. Incentives and fees need a current quote.';
  pin(r,s.geo?.latitude,s.geo?.longitude);r.ImageURL=photo(s.image)||r.ImageURL;
  if(s.amenityFeature?.some(a=>a.name==='Outdoor Parking'&&a.value))r.Parking='Outdoor parking advertised; confirm availability and fee';
}
for(const page of evidence.filter(p=>/valiantgroup.ca\/apartments\/(701-parkhill|899-clonsilla)/.test(p.url))){
  const park=page.url.includes('701-parkhill'),address=park?'701 Parkhill Road West':'899 Clonsilla Avenue';
  const r=base(page,park?'PTB-VA-701-parkhill':'PTB-VA-899-clonsilla','Valiant Group (official)',address);
  r.ListingKind='Building page';r.Type='Apartment building';r['Address / locator']=address+', Peterborough, ON';
  r['Rent text']=park?'Vacancies page: 1-bed CAD 1650; 2-bed CAD 1675-1900':'Vacancies page: 2-bed CAD 1950';
  r['Why add / note']='Building page plus manager vacancy directory https://valiantgroup.ca/home-2/; multiple units/dates, confirm current vacancy and exact quote.';
}
const meant=evidence.find(p=>p.url==='https://meant4rent.ca/ons/a261-student-rental-47-62');
if(meant){
  const r=base(meant,'PTB-M4R-261','Meant4Rent','258 McDonnell Street student rental');
  r.Type='Private room (individual lease and price basis unclear)';r['Address / locator']='258 McDonnell Street, Peterborough, K9H 2W3';
  r['Rent text']='CAD 2000 advertised; per-room vs whole-unit basis needs confirmation';r.Availability='Immediately';r.LeaseMonths=12;
  r['Internet / utilities']='Internet, heat and hydro included (advertised)';r.Laundry='On site';r.PetsAllowed='FALSE';
  r['Why add / note']='Four-bedroom student townhouse with lockable bedrooms and shared common areas; ask whether individual leases are offered and what each person pays.';
}
const bick={
 '616-mckellar-street-1br-2':['616 McKellar Street one-bedroom',1410,1,'616 McKellar Street','October; year not stated','Student applicants listed; inclusive quote does not explicitly promise internet.'],
 '389-murray-street-smoke-free-pet-free':['389 Murray Street two-bedroom',2200,2,'389 Murray Street','Available now','Advertised for mature adults 55+; smoke-free and pet-free building.'],
 '389-murray-street-apartment-w-balcony-smoke-free-pet-free-building':['389 Murray Street one-bedroom',1525,1,'389 Murray Street','Available now','Advertised for mature adults 55+; smoke-free and pet-free building.'],
 '710-george-st-5':['710 George Street North apartment 5',2600,4,'710 George Street North, unit 5','Available now','Whole four-bedroom unit, not a single room quote; heat and hydro included, no on-site laundry.']
};
for(const page of evidence.filter(p=>p.url.includes('bickproperties.com/residential-property-rentals/'))){
  const f=bick[last(page.url)];if(!f)continue;
  const r=base(page,'PTB-BI-'+last(page.url).slice(0,50),'Bick Properties (official)',f[0]);
  r.Type=f[2]+'-bedroom apartment';r['Address / locator']=f[3]+', Peterborough, ON';r.Availability=f[4];
  r['Approx monthly share']=f[1];r['Rent text']=`CAD ${f[1]}/month, whole unit; see inclusions`;
  r.Parking='Parking available (advertised; confirm fee)';r.Laundry=f[2]===4?'Not available on site':'Coin laundry on site';
  r['Internet / utilities']=f[2]===4?'Heat and hydro included; internet not stated':'Inclusive quote; confirm which utilities and internet';
  if(f[3]==='389 Murray Street')r.PetsAllowed='FALSE';
  r['Why add / note']=f[5];note(r,f[5]);
}
const keys=new Set();for(const r of rows){if(keys.has(r.CanonicalKey))throw new Error('Duplicate URL '+r.URL);keys.add(r.CanonicalKey);}
await writeFile('.local-tools/peterborough-extra-reviewed.json',JSON.stringify({rows,skipped},null,2));
console.log(JSON.stringify({rows:rows.length,photos:rows.filter(r=>r.ImageURL).length,sources:rows.reduce((a,r)=>(a[r.Source]=(a[r.Source]||0)+1,a),{}),skipped},null,2));

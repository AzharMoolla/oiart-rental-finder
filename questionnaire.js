/* Eighteen-question brief and Sheet-backed named profiles with local recovery. */
(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STEPS=["Budget & dates","Household","Commute","Home setup","Location & priorities","Viewings & save"];
  let draft=null,step=0,opener=null,chooser=false,sharedWriteReady=false,sharedReadReady=false;
  const readStored=key=>{try{return JSON.parse(localStorage.getItem(key))||{};}catch{return {};}};
  const pendingProfiles=new Map(Object.entries(readStored('hf_profile_pending')).filter(([id,p])=>p?.profile?.id===id));
  const sheetRevisions=new Map();
  const revisions=readStored('hf_profile_revisions');
  const inFlight=new Set();
  let sharedReadError='';
  function persistSync(){try{localStorage.setItem('hf_profile_pending',JSON.stringify(Object.fromEntries(pendingProfiles)));localStorage.setItem('hf_profile_revisions',JSON.stringify(revisions));}catch{}}
  function input(id,label,value,type="text",attrs=""){
    return `<label class="quizfield" for="${id}"><span>${label}</span><input class="qinput" id="${id}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  }
  function select(id,label,value,options){
    return `<label class="quizfield" for="${id}"><span>${label}</span><select class="qinput" id="${id}">${options.map(([v,t])=>`<option value="${esc(v)}"${String(value)===v?" selected":""}>${t}</option>`).join("")}</select></label>`;
  }
  function checks(id,options,values){return `<div class="quizchecks">${options.map(([v,label])=>`<label><input type="checkbox" name="${id}" value="${v}"${(values||[]).includes(v)?" checked":""}><span>${label}</span></label>`).join("")}</div>`;}
  function campusOptions(query='',all=false,selected=''){
    const matches=CampusTools.choices(query,all),current=CampusTools.find(selected);
    if(current&&!matches.some(c=>c.id===selected))matches.unshift(current);
    return '<option value="">Custom destination / map point</option>'+matches.map(c=>`<option value="${esc(c.id)}"${c.id===selected?' selected':''}>${esc(CampusTools.label(c))}</option>`).join('');
  }
  function campusFields(p){
    const point=p.pois[0]||{},inferred=CampusTools.choices().find(c=>CampusTools.normalized(point.name).includes(CampusTools.normalized(c.institution))&&Math.abs(c.lat-point.lat)<0.001&&Math.abs(c.lon-point.lon)<0.001);
    const id=point.campusId||inferred?.id||'';
    return `<div class="campuscontrols"><label for="campusSearch">Find an Ontario school or city</label><input id="campusSearch" class="qinput" type="search" placeholder="School, campus or city" autocomplete="off"><label><input id="campusAll" type="checkbox"${id&&!CampusTools.find(id)?.main?' checked':''}> Include satellite campuses</label><label for="campus">Campus pin</label><select id="campus" class="qinput">${campusOptions('',id&&!CampusTools.find(id)?.main,id)}</select></div><div id="customDestination"${id?' hidden':''}>${input('destination','Custom place name',point.name||'')}<div class="qtwo">${input('destinationLat','Latitude',point.lat??'','number','step="any" min="-90" max="90"')}${input('destinationLon','Longitude',point.lon??'','number','step="any" min="-180" max="180"')}</div></div>`;
  }
  const question=(n,title,body)=>`<fieldset class="quizquestion"><legend>${n}. ${title}</legend>${body}</fieldset>`;
  function paint(){
    chooser=false;
    $("qtitle").textContent="Your housing search";
    $("qsteps").innerHTML=STEPS.map((s,i)=>`<span class="qstep${i===step?" on":""}">${esc(s)}</span>`).join("");
    $("qback").hidden=false;$("qback").disabled=step===0;
    $("qnext").hidden=false;$("qnext").disabled=false;$("qnext").textContent=step===5?"Save profile":"Next";
    const p=draft,a=p.answers;
    const unknown=[["","Not decided"],["yes","Required"],["preferred","Preferred"],["no","Not needed"]];
    let html="";
    if(step===0)html=
      question(1,"Monthly budget",`<div class="qtwo">${input("ideal","Preferred ($)",p.budgetIdeal,"number",'min="1"')}${input("budget","Maximum including bills ($)",p.budgetRent,"number",'min="1"')}</div>`)+
      question(2,"Move-in dates",`<div class="qtwo">${input("timing","Preferred date or month",p.timing)}${input("latest","Latest move-in",p.timingLatest)}</div>`)+
      question(3,"Length of stay",select("lease","Preferred lease",p.leaseMonths,[["","Not decided"],["short","A few months"],["8","Academic year / 8 months"],["12","12 months"],["flexible","Flexible"]]));
    if(step===1)html=
      question(4,"Who is moving?",`<div class="qtwo">${select("household","Household",p.household,[["solo","Just me"],["couple","Couple"],["roommates","With roommates"],["family","Family"]])}${input("occupants","Number moving in",a.occupants,"number",'min="1" max="20"')}</div>${input("existingRoommates","Existing roommate plan",a.existingRoommates)}`)+
      question(5,"Acceptable housing",checks("housingTypes",[["room","Room in a shared home"],["whole","Private apartment / basement / studio"],["split","Larger place split with roommates"]],a.housingTypes))+
      question(6,"Bedroom and bathroom",`<div class="qtwo">${select("bedroom","Private bedroom",a.bedroom,unknown)}${select("bathroom","Private bathroom",a.bathroom,unknown)}</div>`);
    if(step===2)html=
      question(7,"School and main destination",select("scope","Listing inventory",p.searchId,[["","All listings"],...SEARCH_PRESETS.map(x=>[x.id,x.name])])+campusFields(p))+
      question(8,"Travel and commute",`<div class="qtwo">${select("transport","Travel mode",p.transport,[["car","Drive"],["transit","Transit"],["active","Walk / cycle"],["mixed","Mix / undecided"]])}${input("commute","Maximum one-way minutes",p.maxCommute,"number",'min="5" max="180"')}</div>`)+
      question(9,"Parking",`<div class="qtwo">${select("parkingNeed","Parking",a.parkingNeed,unknown)}${input("parkingSpaces","Number of spaces",a.parkingSpaces,"number",'min="0" max="10"')}</div>${select("paidParking","Paid parking",a.paidParking,[["","Not decided"],["yes","Acceptable within budget"],["no","Not acceptable"]])}`);
    if(step===3)html=
      question(10,"Furniture",select("furnishing","Preference",a.furnishing,[["","No preference"],["furnished","Furnished required"],["unfurnished","Unfurnished preferred"]]))+
      question(11,"Internet, bills and laundry",`<div class="qtwo">${select("internetNeed","Internet",a.internetNeed,unknown)}${select("laundryNeed","Laundry",a.laundryNeed,unknown)}</div>${select("bills","Utilities",a.bills,[["","Flexible / undecided"],["included","Must be included"],["extra","Extra okay within budget"]])}${select("sharedLaundry","Shared laundry",a.sharedLaundry,[["","Not decided"],["yes","Fine"],["no","Private laundry required"]])}`)+
      question(12,"Pets",select("pets","Pets moving with you",a.pets,[["","Not decided"],["no","No pets"],["yes","Yes, pet-friendly needed"]]));
    if(step===4)html=
      question(13,"Accessibility and stairs",input("access","Requirements (optional)",a.access))+
      question(14,"Household atmosphere",`<div class="qtwo">${select("atmosphere","Preference",a.atmosphere,[["","No preference"],["quiet","Quiet / study-focused"],["social","Social"],["owner","Owner-occupied okay"]])}${input("roommates","Maximum other roommates",p.maxRoommates,"number",'min="0" max="20"')}</div>`)+
      question(15,"Areas and other destinations",input("preferredAreas","Preferred neighbourhood names (comma-separated)",a.preferredAreas,'text','list="areaChoices" placeholder="e.g. East City, Edmison Heights"')+input("avoidedAreas","Avoided neighbourhood names (comma-separated)",a.avoidedAreas,'text','list="areaChoices" placeholder="e.g. Downtown"')+'<datalist id="areaChoices"></datalist><p class="areastatus" id="areaStatus"></p>'+(a.areas?input('areas','Earlier area notes (not used for matching)',a.areas):'')+`<details><summary>Other destinations (up to two)</summary>${[1,2].map(i=>`${input('placeName'+i,'Destination '+(i+1)+' name',p.pois[i]?.name||'')}<div class="qtwo">${input('placeLat'+i,'Latitude',p.pois[i]?.lat??'','number','step="any" min="-90" max="90"')}${input('placeLon'+i,'Longitude',p.pois[i]?.lon??'','number','step="any" min="-180" max="180"')}</div>`).join('')}</details>`+input("otherPlaces","Other destination notes (not mapped)",a.otherPlaces));
    if(step===5)html=
      question(16,"Priorities and dealbreakers",`<div class="qsliders">${Object.keys(BASE_WEIGHTS).map(key=>`<label class="quizpriority">${esc(SCORE_SHORT[key]||key)}<input aria-label="${key} priority" type="range" min="1" max="5" step="1" data-pri="${key}" value="${p.priorities[key]}"><output>${p.priorities[key]}/5</output></label>`).join("")}</div>${checks("dealBreakers",[["noParking","No parking"],["overBudget","Over maximum budget"],["longCommute","Beyond commute limit"],["sharedBedroom","Shared bedroom"]],p.dealBreakers)}${input("otherDealbreakers","Other dealbreakers",a.otherDealbreakers)}`)+
      question(17,"Viewings",select("viewings","How can you view?",a.viewings,[["","Not decided"],["inPerson","In person"],["video","Video required"],["either","Either"]]))+
      question(18,"Temporary options",select("temporary","Short-term place while searching",a.temporary,[["","Not decided"],["yes","Open to it"],["no","Long-term only"]]))+
      `<div class="quizsave">${input("profileName","Save profile as",p.name)}<p class="qhint">${sharedWriteReady?"Saved to the shared Sheet, with a backup on this device.":"Sheet connection update needed. Your profile will stay on this device until it can sync."}</p></div>`;
    $("qbody").innerHTML=html;
    $("qbody").scrollTop=0;
    $("qbody").querySelectorAll("[data-pri]").forEach(el=>el.oninput=()=>{p.priorities[el.dataset.pri]=+el.value;el.nextElementSibling.textContent=el.value+"/5";});
    $("qbody").querySelector("input,select")?.focus();
    const scope=$("scope");
    if(scope)scope.onchange=()=>{
      const preset=SEARCH_PRESETS.find(x=>x.id===scope.value);if(!preset)return;
      const point=preset.pois[0],match=CampusTools.list().find(c=>Math.abs(c.lat-point.lat)<0.002&&Math.abs(c.lon-point.lon)<0.002);
      $("campus").value=match?.id||'';$("customDestination").hidden=!!match;
      $("customDestination").querySelectorAll('input').forEach(input=>input.disabled=!!match);
      $("destination").value=point.name;$("destinationLat").value=point.lat;$("destinationLon").value=point.lon;
    };
    if($("campus")){
      const filter=()=>{$("campus").innerHTML=campusOptions($("campusSearch").value,$("campusAll").checked,$("campus").value);};
      $("campusSearch").oninput=filter;$("campusAll").onchange=filter;
      const customMode=()=>{
        const selected=!!$("campus").value;$("customDestination").hidden=selected;
        $("customDestination").querySelectorAll('input').forEach(input=>input.disabled=selected);
      };
      $("campus").onchange=customMode;customMode();
    }
    if($("areaChoices")){
      const areas=[...new Set(allRows.filter(r=>ListingRules.matchesSearch(r,p.searchId)).map(r=>String(r.Neighbourhood||'').trim()).filter(Boolean))].sort();
      $("areaChoices").innerHTML=areas.map(s=>`<option value="${esc(s)}"></option>`).join('');
      const describe=()=>{
        const names=CampusTools.areaNames($("preferredAreas").value+';'+$("avoidedAreas").value);
        const unmatched=names.filter(n=>!areas.some(s=>CampusTools.areaMatches(n,s).length));
        $("areaStatus").textContent=`${areas.length} neighbourhood labels in this inventory. `+(unmatched.length?`No current match: ${unmatched.join(', ')}. `:'')+'Matches neighbourhood names only, not street addresses. Use campus pins or My places for destinations.';
      };
      $("preferredAreas").oninput=describe;$("avoidedAreas").oninput=describe;describe();
    }
  }
  function collect(){
    const p=draft,a=p.answers;
    const read=(id,fn)=>{if($(id))fn($(id).value.trim());};
    const optionalNumber=s=>s===""?null:Number(s);
    read("ideal",s=>p.budgetIdeal=optionalNumber(s));read("budget",s=>p.budgetRent=optionalNumber(s));
    read("timing",s=>p.timing=s);read("latest",s=>p.timingLatest=s);read("lease",s=>p.leaseMonths=s);
    read("household",s=>p.household=s);read("roommates",s=>p.maxRoommates=optionalNumber(s));
    read("transport",s=>p.transport=s);read("commute",s=>p.maxCommute=Number(s)||25);
    read("scope",s=>{
      if(s!==p.searchId){const preset=SEARCH_PRESETS.find(x=>x.id===s);p.searchId=s;p.city=preset?.city||"";p.pois=preset?JSON.parse(JSON.stringify(preset.pois)):[];}
    });
    if($("campus")){
      const campus=CampusTools.find($("campus").value);
      if(campus)p.pois[0]=CampusTools.poi(campus);
      else{
        const name=$("destination").value.trim(),lat=optionalNumber($("destinationLat").value),lon=optionalNumber($("destinationLon").value);
        if(name&&Number.isFinite(lat)&&Number.isFinite(lon))p.pois[0]={name,lat,lon};
        else if(!name&&!p.pois.slice(1).length)p.pois=[];
      }
    }
    if($("placeName1")){
      const places=[];
      for(const i of [1,2]){
        const name=$("placeName"+i).value.trim(),lat=optionalNumber($("placeLat"+i).value),lon=optionalNumber($("placeLon"+i).value);
        if(name&&Number.isFinite(lat)&&Number.isFinite(lon))places.push({name,lat,lon});
      }
      p.pois=[...p.pois.slice(0,1),...places];
    }
    ["occupants","existingRoommates","bedroom","bathroom","parkingNeed","parkingSpaces","paidParking","furnishing","internetNeed","laundryNeed","bills","sharedLaundry","pets","access","atmosphere","areas","preferredAreas","avoidedAreas","otherPlaces","otherDealbreakers","viewings","temporary"].forEach(k=>read(k,s=>a[k]=s));
    if(document.querySelector('[name="housingTypes"]'))a.housingTypes=[...document.querySelectorAll('[name="housingTypes"]:checked')].map(e=>e.value);
    if(document.querySelector('[name="dealBreakers"]'))p.dealBreakers=[...document.querySelectorAll('[name="dealBreakers"]:checked')].map(e=>e.value);
    read("profileName",s=>p.name=s||p.name);
  }
  function setRequirements(){
    const p=draft,a=p.answers,set=new Set();
    [["parkingNeed","parking"],["internetNeed","internet"],["laundryNeed","laundry"],["bedroom","privateBedroom"],["bathroom","privateBath"]].forEach(([field,key])=>{if(a[field]==="yes")set.add(key);});
    if(a.pets==="yes")set.add("pets");if(a.furnishing==="furnished")set.add("furnished");
    p.mustHaves=[...set];
    if(a.bedroom==="yes" && !p.dealBreakers.includes("sharedBedroom"))p.dealBreakers.push("sharedBedroom");
    p.tuned=true;p.briefPending=false;
  }
  function show(){opener=document.activeElement;$("quiz").hidden=false;document.body.style.overflow="hidden";}
  function close(){$("quiz").hidden=true;document.body.style.overflow="";opener?.focus();}
  function open(newOne=false){
    draft=JSON.parse(JSON.stringify(activeProfile()));
    if(newOne){
      draft.id=newProfileId();draft.name="New profile";draft.budgetRent=null;draft.budgetIdeal=null;
      draft.answers={};draft.mustHaves=[];draft.dealBreakers=[];draft.maxRoommates=null;
      draft.priorities={...DEFAULT_PROFILE.priorities};draft.tuned=false;draft.briefPending=true;
      const requested=new URLSearchParams(location.search).get("search");
      const preset=SEARCH_PRESETS.find(p=>p.id===requested);
      if(preset){draft.searchId=preset.id;draft.city=preset.city;draft.pois=structuredClone(preset.pois);draft.timing=preset.timing;draft.transport=preset.transport;draft.maxCommute=preset.maxCommute;}
      draft.routeCampusId='';
    }
    step=0;show();paint();
  }
  async function finish(){
    collect();setRequirements();
    const saved=upsertProfile(draft);
    close();window.applyProfileChange({fitMap:true});
    await saveSharedProfile(saved);
  }
  async function saveSharedProfile(p,{retry=false,quiet=false}={}){
    const {fromSheet,...snapshot}=JSON.parse(JSON.stringify(p));
    if(!retry){pendingProfiles.set(p.id,{profile:snapshot,expectedUpdatedAt:revisions[p.id]||''});persistSync();}
    const pending=pendingProfiles.get(p.id);
    if(!pending||pending.conflict||inFlight.has(p.id))return false;
    if(!sharedWriteReady){
      if(!quiet)toast(`"${p.name}" is kept on this device. Sheet saving needs the Apps Script update; it will retry when you open Choose profile.`);
      return false;
    }
    inFlight.add(p.id);
    try{
      const res=await fetch(WRITE_URL,{method:"POST",body:JSON.stringify({action:"saveProfile",profile:pending.profile,expectedUpdatedAt:pending.expectedUpdatedAt,...(WRITE_TOKEN?{token:WRITE_TOKEN}:{})}),signal:AbortSignal.timeout(15000)});
      const data=await res.json();
      if(data.code==='PROFILE_CONFLICT'){pending.conflict=true;throw new Error(data.error);}
      if(!res.ok || data.ok!==true || data.action!=="saveProfile" || data.id!==p.id || !data.updatedAt)throw new Error(data.error||"The endpoint did not confirm a profile save");
      revisions[p.id]=data.updatedAt;
      sharedProfiles.set(p.id,normalizeProfile(pending.profile));
      if(pendingProfiles.get(p.id)===pending)pendingProfiles.delete(p.id);
      else pendingProfiles.get(p.id).expectedUpdatedAt=data.updatedAt;
      persistSync();
      if(!quiet)toast(`Saved "${p.name}" to the shared Sheet. Available on your other devices.`);
      return true;
    }catch(e){persistSync();if(!quiet)toast(`Sheet save failed: ${e.message} Your edits remain on this device.`);return false;}
    finally{inFlight.delete(p.id);if(pendingProfiles.has(p.id)&&pendingProfiles.get(p.id)!==pending)saveSharedProfile(pendingProfiles.get(p.id).profile,{retry:true,quiet:true});}
  }
  async function loadSharedProfiles(){
    try{
      const url=sharedReadReady?`${WRITE_URL}?action=listProfiles`:`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=197601017`;
      const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(10000)});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const list=sharedReadReady?(await res.json()).profiles:parseCsv(await res.text());
      if(!Array.isArray(list))throw new Error('Invalid profile response');
      sharedProfiles.clear();
      sharedReadError='';
      for(const row of list){
        if(!row.ProfileID || !row.ProfileJSON)continue;
        try{
          const p=JSON.parse(row.ProfileJSON);
          if(!p || typeof p.name!=="string" || p.id!==row.ProfileID)continue;
          if(isStarterProfile(p))continue;
          sharedProfiles.set(p.id,normalizeProfile(p));
          sheetRevisions.set(p.id,String(row.UpdatedAt||''));
          if(!pendingProfiles.has(p.id)){
            revisions[p.id]=String(row.UpdatedAt||'');
            const i=HF.list.findIndex(local=>local.id===p.id);
            if(i>=0)HF.list[i]=normalizeProfile(p);else HF.list.push(normalizeProfile(p));
          }
        }catch{}
      }
      saveProfiles();persistSync();renderProfileSwitch();
      if(!$("quiz").hidden&&chooser)window.applyProfileChange();
      return true;
    }catch(e){sharedReadError='Shared profiles could not load. Showing this device\'s saved copies.';return false;}
  }
  const sharedProfiles=new Map();
  async function checkSharedSaving(){
    try{const res=await fetch(WRITE_URL,{cache:'no-store',signal:AbortSignal.timeout(5000)});const data=await res.json();sharedWriteReady=data.ok===true && !data.headerError && data.capabilities?.includes("profileRevisions");sharedReadReady=data.ok===true&&data.capabilities?.includes('listProfiles');}catch{sharedWriteReady=false;sharedReadReady=false;}
  }
  async function choose(){
    show();chooser=true;$("qtitle").textContent="Choose your search";
    $("qsteps").innerHTML="";$("qback").hidden=true;$("qnext").hidden=true;
    $("qbody").innerHTML='<p>Loading saved profiles...</p>';
    await checkSharedSaving();
    const loaded=await loadSharedProfiles();
    if(loaded&&sharedWriteReady)for(const pending of [...pendingProfiles.values()])await saveSharedProfile(pending.profile,{retry:true,quiet:true});
    if($("quiz").hidden || !chooser)return;
    const byId=new Map(HF.list.map(p=>[p.id,{...p,fromSheet:false}]));
    for(const p of sharedProfiles.values())if(!pendingProfiles.has(p.id))byId.set(p.id,{...p,fromSheet:true});
    for(const [id,pending] of pendingProfiles)if(pending.conflict&&sharedProfiles.has(id))byId.set('sheet:'+id,{...sharedProfiles.get(id),fromSheet:true,conflictCopy:true});
    const profiles=[...byId.values()].sort((a,b)=>a.name.localeCompare(b.name));
    $("qbody").innerHTML=`<p class="qhint" id="profileSyncStatus" role="status">${esc(sharedReadError||(sharedWriteReady?'Shared Sheet connected.':"Shared saving needs the Apps Script update."))}${pendingProfiles.size?' '+pendingProfiles.size+' profile(s) waiting to sync.':''}</p><label class="quizfield" for="profileSearch"><span>Find a saved profile</span><input id="profileSearch" class="qinput" type="search" placeholder="Name or city" autocomplete="off"></label><p id="profileResultCount" class="qhint" aria-live="polite"></p><div class="profilechoices" id="profileChoices"></div><button class="linkbtn" id="moreProfiles" type="button" hidden>Show more profiles</button><button class="btn primary" id="startNewQuiz">Take the quiz for a new profile</button>`;
    let limit=40;
    function paintChoices(){
      const query=$("profileSearch").value.trim().toLocaleLowerCase();
      const matches=profiles.filter(p=>(p.name+" "+p.city).toLocaleLowerCase().includes(query));
      $("profileResultCount").textContent=matches.length?`${Math.min(limit,matches.length)} of ${matches.length} saved profiles`:"No matching profiles";
      $("profileChoices").innerHTML=matches.slice(0,limit).map(p=>`<button class="profilechoice" data-profile-choice="${esc(p.conflictCopy?'sheet:'+p.id:p.id)}"><b>${esc(p.name)}</b><span>${esc(p.city||"All locations")} · ${p.conflictCopy?'Sheet version (resolve conflict)':p.fromSheet?"Shared Sheet":pendingProfiles.has(p.id)?'This device - not synced':"This device"}</span></button>`).join("");
      $("moreProfiles").hidden=limit>=matches.length;
    }
    $("profileSearch").oninput=()=>{limit=40;paintChoices();};
    $("moreProfiles").onclick=()=>{limit+=40;paintChoices();};
    $("profileChoices").onclick=e=>{
      const btn=e.target.closest("[data-profile-choice]");if(!btn)return;
      const p=byId.get(btn.dataset.profileChoice);if(!p)return;
      if(p.conflictCopy){if(!confirm('Load the Sheet version and discard this device\'s pending edits to this profile?'))return;pendingProfiles.delete(p.id);revisions[p.id]=sheetRevisions.get(p.id)||'';persistSync();delete p.conflictCopy;}
      if(p.fromSheet)upsertProfile(p);else setActiveProfile(p.id);
      close();window.applyProfileChange({fitMap:true});
      if(!p.fromSheet&&p.tuned)saveSharedProfile(p);
      if(!activeProfile().tuned)open(false);
    };
    paintChoices();
    $("startNewQuiz").onclick=()=>open(true);
    $("profileSearch").focus();
  }
  $("qopen").onclick=()=>open(false);$("chooseProfile").onclick=choose;
  $("qclose").onclick=close;$("quizback").onclick=close;
  $("qback").onclick=()=>{collect();step=Math.max(0,step-1);paint();};
  $("qnext").onclick=()=>{
    const validatePoint=(name,lat,lon)=>{
      const n=$(name),a=$(lat),b=$(lon);if(!n||!a||!b)return true;
      n.setCustomValidity('');
      if((n.value.trim()||a.value||b.value)&&(!n.value.trim()||a.value===''||b.value==='')){n.setCustomValidity('Add a name and both coordinates, or choose a campus pin.');const details=n.closest('details');if(details)details.open=true;n.reportValidity();return false;}return true;
    };
    if($("campus")&&!$("campus").value&&!validatePoint('destination','destinationLat','destinationLon'))return;
    for(const i of [1,2])if(!validatePoint('placeName'+i,'placeLat'+i,'placeLon'+i))return;
    if(!$("qbody").querySelectorAll("input:invalid").length){collect();if(step===5)finish();else{step++;paint();}}
    else{const invalid=$("qbody").querySelector("input:invalid"),details=invalid.closest('details');if(details)details.open=true;invalid.reportValidity();}
  };
  document.addEventListener("keydown",e=>{
    if($("quiz").hidden)return;
    if(e.key==="Escape"){close();return;}
    if(e.key==="Tab"){
      const list=[...$("quiz").querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled && el.getClientRects().length);
      const first=list[0],last=list[list.length-1];
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
    }
  });
  window.openQuestionnaire=(newOne=false)=>open(newOne);
  window.saveSharedProfile=saveSharedProfile;
  choose();
})();

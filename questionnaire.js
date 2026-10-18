/* Eighteen-question brief, named profiles, and optional Sheet sharing. */
(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STEPS=["Budget & dates","Household","Commute","Home setup","Location & priorities","Viewings & save"];
  let draft=null,step=0,opener=null,chooser=false,sharedWriteReady=false;
  function input(id,label,value,type="text",attrs=""){
    return `<label class="quizfield" for="${id}"><span>${label}</span><input class="qinput" id="${id}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  }
  function select(id,label,value,options){
    return `<label class="quizfield" for="${id}"><span>${label}</span><select class="qinput" id="${id}">${options.map(([v,t])=>`<option value="${esc(v)}"${String(value)===v?" selected":""}>${t}</option>`).join("")}</select></label>`;
  }
  function checks(id,options,values){return `<div class="quizchecks">${options.map(([v,label])=>`<label><input type="checkbox" name="${id}" value="${v}"${(values||[]).includes(v)?" checked":""}> ${label}</label>`).join("")}</div>`;}
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
      question(7,"School and main destination",select("scope","Search area",p.searchId,[["","All listings"],...SEARCH_PRESETS.map(x=>[x.id,x.name])])+input("destination","Campus / building",p.pois[0]?.name || ""))+
      question(8,"Travel and commute",`<div class="qtwo">${select("transport","Travel mode",p.transport,[["car","Drive"],["transit","Transit"],["active","Walk / cycle"],["mixed","Mix / undecided"]])}${input("commute","Maximum one-way minutes",p.maxCommute,"number",'min="5" max="180"')}</div>`)+
      question(9,"Parking",`<div class="qtwo">${select("parkingNeed","Parking",a.parkingNeed,unknown)}${input("parkingSpaces","Number of spaces",a.parkingSpaces,"number",'min="0" max="10"')}</div>${select("paidParking","Paid parking",a.paidParking,[["","Not decided"],["yes","Acceptable within budget"],["no","Not acceptable"]])}`);
    if(step===3)html=
      question(10,"Furniture",select("furnishing","Preference",a.furnishing,[["","No preference"],["furnished","Furnished required"],["unfurnished","Unfurnished preferred"]]))+
      question(11,"Internet, bills and laundry",`<div class="qtwo">${select("internetNeed","Internet",a.internetNeed,unknown)}${select("laundryNeed","Laundry",a.laundryNeed,unknown)}</div>${select("bills","Utilities",a.bills,[["","Flexible / undecided"],["included","Must be included"],["extra","Extra okay within budget"]])}${select("sharedLaundry","Shared laundry",a.sharedLaundry,[["","Not decided"],["yes","Fine"],["no","Private laundry required"]])}`)+
      question(12,"Pets",select("pets","Pets moving with you",a.pets,[["","Not decided"],["no","No pets"],["yes","Yes, pet-friendly needed"]]));
    if(step===4)html=
      question(13,"Accessibility and stairs",input("access","Requirements (optional)",a.access))+
      question(14,"Household atmosphere",`<div class="qtwo">${select("atmosphere","Preference",a.atmosphere,[["","No preference"],["quiet","Quiet / study-focused"],["social","Social"],["owner","Owner-occupied okay"]])}${input("roommates","Maximum other roommates",p.maxRoommates,"number",'min="0" max="20"')}</div>`)+
      question(15,"Areas and other destinations",input("areas","Preferred neighbourhoods / areas to avoid",a.areas)+input("otherPlaces","Other important destinations",a.otherPlaces));
    if(step===5)html=
      question(16,"Priorities and dealbreakers",`<div class="qsliders">${Object.keys(BASE_WEIGHTS).map(key=>`<label class="quizpriority">${esc(SCORE_SHORT[key]||key)}<input aria-label="${key} priority" type="range" min="1" max="5" step="1" data-pri="${key}" value="${p.priorities[key]}"><output>${p.priorities[key]}/5</output></label>`).join("")}</div>${checks("dealBreakers",[["noParking","No parking"],["overBudget","Over maximum budget"],["longCommute","Beyond commute limit"],["sharedBedroom","Shared bedroom"]],p.dealBreakers)}${input("otherDealbreakers","Other dealbreakers",a.otherDealbreakers)}`)+
      question(17,"Viewings",select("viewings","How can you view?",a.viewings,[["","Not decided"],["inPerson","In person"],["video","Video required"],["either","Either"]]))+
      question(18,"Temporary options",select("temporary","Short-term place while searching",a.temporary,[["","Not decided"],["yes","Open to it"],["no","Long-term only"]]))+
      `<div class="quizsave">${input("profileName","Save profile as",p.name)}<label><input id="shareProfile" type="checkbox"${sharedWriteReady?"":" disabled"}> Save to the shared Sheet for friends / another device</label><p class="qhint">${sharedWriteReady?"Your profile is always saved on this device.":"Shared saving needs a one-time Sheet connection update. Saving on this device is ready."}</p></div>`;
    $("qbody").innerHTML=html;
    $("qbody").scrollTop=0;
    $("qbody").querySelectorAll("[data-pri]").forEach(el=>el.oninput=()=>{p.priorities[el.dataset.pri]=+el.value;el.nextElementSibling.textContent=el.value+"/5";});
    $("qbody").querySelector("input,select")?.focus();
    const scope=$("scope");
    if(scope)scope.onchange=()=>{const preset=SEARCH_PRESETS.find(x=>x.id===scope.value);if(preset)$("destination").value=preset.pois[0].name;};
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
    read("destination",s=>{if(p.pois[0] && s)p.pois[0].name=s;});
    ["occupants","existingRoommates","bedroom","bathroom","parkingNeed","parkingSpaces","paidParking","furnishing","internetNeed","laundryNeed","bills","sharedLaundry","pets","access","atmosphere","areas","otherPlaces","otherDealbreakers","viewings","temporary"].forEach(k=>read(k,s=>a[k]=s));
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
    }
    step=0;show();paint();
  }
  async function finish(){
    collect();setRequirements();
    const shared=$("shareProfile")?.checked;
    const saved=upsertProfile(draft);
    close();window.applyProfileChange({fitMap:true});
    toast(`Saved "${saved.name}" on this device.`);
    if(shared)await saveSharedProfile(saved);
  }
  async function saveSharedProfile(p){
    try{
      const res=await fetch(WRITE_URL,{method:"POST",body:JSON.stringify({action:"saveProfile",profile:p,...(WRITE_TOKEN?{token:WRITE_TOKEN}:{})}),signal:AbortSignal.timeout(15000)});
      const data=await res.json();
      if(!res.ok || data.ok!==true || data.action!=="saveProfile")throw new Error(data.error||"Shared profile saving is not enabled on the deployed script yet");
      toast(`Saved "${p.name}" to the shared Sheet.`);
    }catch(e){toast(`Profile saved on this device. Sheet save failed: ${e.message}`);}
  }
  async function loadSharedProfiles(){
    try{
      const res=await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&gid=197601017`,{cache:"no-store",signal:AbortSignal.timeout(5000)});
      if(!res.ok)return;
      const list=parseGviz(await res.text());
      for(const row of list){
        if(!row.ProfileID || !row.ProfileJSON)continue;
        try{
          const p=JSON.parse(row.ProfileJSON);
          if(!p || typeof p.name!=="string" || p.id!==row.ProfileID)continue;
          sharedProfiles.set(p.id,normalizeProfile(p));
        }catch{}
      }
    }catch{}
  }
  const sharedProfiles=new Map();
  async function checkSharedSaving(){
    try{const res=await fetch(WRITE_URL,{signal:AbortSignal.timeout(5000)});const data=await res.json();sharedWriteReady=data.ok===true && !data.headerError && data.capabilities?.includes("saveProfile");}catch{sharedWriteReady=false;}
  }
  async function choose(){
    show();chooser=true;$("qtitle").textContent="Choose your search";
    $("qsteps").innerHTML="";$("qback").hidden=true;$("qnext").hidden=true;
    $("qbody").innerHTML='<p>Loading saved profiles...</p>';
    await Promise.all([loadSharedProfiles(),checkSharedSaving()]);
    if($("quiz").hidden || !chooser)return;
    const profiles=HF.list.map(p=>({...p,fromSheet:false}));
    for(const p of sharedProfiles.values())profiles.push({...p,fromSheet:true});
    $("qbody").innerHTML=`<p>Continue a saved search, or create a profile for someone new.</p><div class="profilechoices">${profiles.map((p,i)=>`<button class="profilechoice" data-profile-choice="${i}"><b>${esc(p.name)}</b><span>${esc(p.city||"All locations")} · ${p.fromSheet?"Shared Sheet":"This device"}</span></button>`).join("")}</div><button class="btn primary" id="startNewQuiz">Take the quiz for a new profile</button>`;
    $("qbody").querySelectorAll("[data-profile-choice]").forEach(btn=>btn.onclick=()=>{
      const p=profiles[+btn.dataset.profileChoice];
      if(p.fromSheet)upsertProfile(p);else setActiveProfile(p.id);
      close();window.applyProfileChange({fitMap:true});
      if(!activeProfile().tuned)open(false);
    });
    $("startNewQuiz").onclick=()=>open(true);
    $("qbody").querySelector("button")?.focus();
  }
  $("qopen").onclick=()=>open(false);$("chooseProfile").onclick=choose;
  $("qclose").onclick=close;$("quizback").onclick=close;
  $("qback").onclick=()=>{collect();step=Math.max(0,step-1);paint();};
  $("qnext").onclick=()=>{
    if(!$("qbody").querySelectorAll("input:invalid").length){collect();if(step===5)finish();else{step++;paint();}}
    else $("qbody").querySelector("input:invalid").reportValidity();
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
  window.openQuestionnaire=()=>open(false);
  window.saveSharedProfile=saveSharedProfile;
  choose();
})();

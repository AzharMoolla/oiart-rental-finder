/* Pure evidence rules, shared by the board and regression checks. */
(function(root){
  const text = v => String(v == null ? "" : v).trim();
  const yes = v => /^(true|yes|y|1|confirmed)$/i.test(text(v));
  function stated(v){
    const s = text(v);
    return /^(unknown|not (entered|stated|provided|specified)|n\/?a|tbd|verify|ask|\?)\b/i.test(s) ? "" : s;
  }
  function parking(r){
    const t = stated(r.Parking).toLowerCase();
    if(/no parking|street[- ](?:parking[- ])?only|no spot|no on-?site|unavailable/.test(t)) return {state:"no",pts:0};
    if(/not stated|not confirmed|to verify|verify|upon request|subject to|may be/.test(t)) return {state:"unknown"};
    if(/extra|paid|\$|fee/.test(t)) return {state:"paid",pts:7};
    if(/not included/.test(t)) return {state:"no",pts:0};
    if(yes(r.ParkingConfirmed) || /\byes\b|included|available|spot|driveway|assigned|surface|garage|underground|outdoor/.test(t)) return {state:"yes",pts:10};
    return {state:"unknown"};
  }
  function internet(r){
    const t = stated(r["Internet / utilities"]).toLowerCase();
    const unknown = /(?:internet|wi-?fi).{0,30}(?:not stated|not confirmed|unknown|verify)|(?:confirm|verify).{0,25}(?:internet|wi-?fi)/.test(t);
    if(/\b(?:internet|wi-?fi)\s*[:=-]?\s*(?:is\s+)?(?:extra|not included|paid separately)|\bno (?:internet|wi-?fi)/.test(t)) return {state:"extra",pts:2,allIn:false};
    const explicitNet = /(?:wi-?fi|internet|gigabit|1gb).{0,25}(?:included|free)|(?:included|free).{0,25}(?:wi-?fi|internet)|^yes$/.test(t);
    const included = !unknown && (explicitNet || yes(r.InternetConfirmed));
    const partial = /hydro.{0,16}extra|(?:utilities|heat|water).{0,20}included|(?:shared|extra).{0,20}utilities|utilities.{0,20}(?:shared|extra)/.test(t);
    const allIn = included && !/extra|shared|additional|\$/.test(t) && /all[- ]inclusive|all utilities|utilities.{0,20}included|^yes$/.test(t);
    const extraBills=/hydro.{0,16}extra|(?:utilities|heat|water).{0,20}(?:shared|extra)|(?:shared|extra).{0,20}utilities/.test(t);
    if(included) return {state:extraBills ? "partial" : "included",pts:extraBills ? 3 : 5,allIn,includedNet:true};
    if(unknown) return {state:"unknown",allIn:false};
    if(/all[- ]inclusive|all utilities included/.test(t)) return {state:"included",pts:5,allIn:true,includedNet:true};
    if(partial) return {state:"partial",pts:3,allIn:false};
    return {state:"unknown",allIn:false};
  }
  function privacy(r){
    const t = stated(r.Type).toLowerCase();
    if(!t) return {state:"unknown"};
    if(/shared (bedroom|room)|sharing basis/.test(t)) return {state:"shared",pts:5};
    if(/ensuite|en-suite|own bath|private bath/.test(t)) return {state:"unit",pts:15};
    // "Room in an apartment/basement" is not a private apartment.
    if(/private (room|bedroom)|single room/.test(t)) return {state:"privateRoom",pts:12};
    if(/\broom\b/.test(t) && !/\b(one|1|two|2|three|3)[- ]bedroom (apartment|unit|house)/.test(t)) return {state:"room",pts:11};
    if(/basement|studio|bachelor|apartment|condo|townhouse|townhome|duplex|house|\bunit\b/.test(t)) return {state:"unit",pts:15};
    return {state:"vague",pts:8};
  }
  function timing(r, target){
    const t = stated(r.Availability).toLowerCase();
    if(!t || /^(?:confirm|verify|ask)\b/.test(t)) return {state:"unknown"};
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const month = s => { const m=s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/); const iso=s.match(/\b(20\d\d)-(0[1-9]|1[0-2])(?:-\d\d)?\b/); return m ? months.indexOf(m[1]) : iso ? +iso[2]-1 : -1; };
    const want=text(target).toLowerCase(), a=month(t), b=month(want);
    const ay=(t.match(/\b20\d\d\b/)||[])[0], by=(want.match(/\b20\d\d\b/)||[])[0];
    if(a>=0 && b>=0 && (a!==b || (ay && by && ay!==by))) return {state:"mismatch",pts:4};
    if(a>=0 && b>=0 && a===b && !(ay && by && ay!==by)) return {state:"match",pts:10};
    if(yes(r.TimingConfirmed) && b<0) return {state:"confirmed",pts:10};
    // Legacy July checkbox only describes July, never November or another target.
    if(yes(r.JulyConfirmed) && (b===6 || (b<0 && a===6))) return {state:"confirmed",pts:10};
    if(a>=0) return {state:"stated",pts:9};
    if(/now|immediate|flexible|negotiable|asap|vacant/.test(t)) return {state:"flexible",pts:7};
    return {state:"unknown"};
  }
  function searchId(r){
    const explicit=text(r.SearchID);
    if(explicit) return explicit;
    const id=text(r.ID);
    if(/^WAT-/i.test(id)) return "waterloo";
    if(/^(?:[ABCEFKR]\d+|D\d+|N\d+|AP\d+)$/.test(id)) return "london-oiart";
    return "";
  }
  function matchesSearch(r, id){ return !id || searchId(r).split(/\s*[,;]\s*/).includes(id); }
  function canonicalKey(url){
    try{
      const u = new URL(text(url));
      if(!/^https?:$/.test(u.protocol)) return "";
      const h=u.hostname.replace(/^www\./,"").toLowerCase();
      const fb=u.pathname.match(/\/marketplace\/item\/(\d+)/);
      if(h==="facebook.com" && fb) return "facebook:"+fb[1];
      const kj=u.pathname.match(/\/(\d+)\/?$/);
      if(h==="kijiji.ca" && /^\/v-/.test(u.pathname) && kj) return "kijiji:"+kj[1];
      const rm=u.pathname.match(/^\/rooms\/(\d+)\/?$/);
      if(h==="roomies.ca" && rm) return "roomies:"+rm[1];
      return h+u.pathname.replace(/\/$/,"");
    }catch{ return ""; }
  }
  function driveMinutes(value){
    const s=stated(value).replace(/\b(?:about|approx(?:imately)?|minutes?|mins?)\b/gi,"").trim();
    const m=s.match(/^~?\s*(\d+(?:\.\d+)?)\s*(?:[-\u2013\u2014]|to)?\s*(\d+(?:\.\d+)?)?\s*$/i);
    return m ? Math.max(Number(m[1]),Number(m[2] || m[1])) : NaN;
  }
  root.ListingRules = Object.freeze({stated,parking,internet,privacy,timing,searchId,matchesSearch,canonicalKey,driveMinutes});
})(globalThis);

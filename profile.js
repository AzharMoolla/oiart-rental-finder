/* ============================================================================
   profile.js — search profiles & preference weighting
   ----------------------------------------------------------------------------
   A "profile" is one saved search: its anchor places, budgets, must-haves,
   deal-breakers and priority weights. Keep several (e.g. "Waterloo" and
   "London / OIART") and switch between them — every distance, ring, route and
   score re-computes for the active one.

   Loaded BEFORE app.js so the scoring engine can read the active profile.
   Stored in localStorage only; nothing leaves the browser.
   ========================================================================== */

const MAX_POIS = 3;

/* Base component maxima (sum = 100). The questionnaire's 1–5 priority sliders
   scale these, then everything is re-normalized back to a 100-point scale so
   scores stay comparable across profiles. */
const BASE_WEIGHTS = { location:30, cost:20, parking:10, internet:5, privacy:15, lease:10, trust:10 };
const PRIORITY_FACTOR = {1:0.35, 2:0.65, 3:1, 4:1.45, 5:1.95};

/* Effective door-to-door speed (km/h) used to turn "max commute minutes" into
   an acceptable straight-line radius, so bands adapt to any city and mode. */
const TRANSPORT_SPEED = { car:34, transit:17, active:11, mixed:26 };

const DEFAULT_PROFILE = {
  id: "",
  name: "My search",
  market: "rent",                 // rent | sale | both
  household: "solo",              // solo | couple | roommates | family
  pois: [],                       // up to MAX_POIS {name, lat, lon}
  routePoi: 0,
  budgetRent: 1000,
  budgetSale: 500000,
  budgetFirm: true,               // hard ceiling vs "can stretch for the right place"
  transport: "car",
  maxCommute: 25,                 // minutes, one way
  commuteFreq: "daily",           // daily | weekly | occasional
  mustHaves: ["parking"],         // parking internet laundry privateBath separateEntrance pets furnished outdoor
  dealBreakers: ["noParking"],    // noParking overBudget longCommute sharedBedroom noAddress tenanted
  priorities: { location:3, cost:3, parking:3, internet:3, privacy:3, lease:3, trust:3 },
  verifiedOnly: false,            // true = wary of classifieds/FSBO -> trust matters more
  timing: "",                     // free text, e.g. "July 2026" / "flexible"
  tuned: false                    // has the questionnaire been completed?
};

let HF = loadProfiles();

function newProfileId(){ return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function normalizeProfile(p){
  const out = {...DEFAULT_PROFILE, ...(p || {})};
  out.id = out.id || newProfileId();
  out.pois = (Array.isArray(out.pois) ? out.pois : [])
    .filter(x => x && isFinite(Number(x.lat)) && isFinite(Number(x.lon)))
    .slice(0, MAX_POIS);
  out.priorities = {...DEFAULT_PROFILE.priorities, ...(out.priorities || {})};
  out.mustHaves = Array.isArray(out.mustHaves) ? out.mustHaves : [];
  out.dealBreakers = Array.isArray(out.dealBreakers) ? out.dealBreakers : [];
  out.routePoi = Math.min(Math.max(0, Number(out.routePoi) || 0), Math.max(out.pois.length - 1, 0));
  return out;
}

function loadProfiles(){
  // Current format
  try{
    const s = JSON.parse(localStorage.getItem("hf_profiles"));
    if(s && Array.isArray(s.list) && s.list.length){
      const list = s.list.map(normalizeProfile);
      const activeId = list.some(p => p.id === s.activeId) ? s.activeId : list[0].id;
      return { list, activeId };
    }
  }catch(e){}
  // Migrate the older single "hf_config" (places + budgets) into profile #1
  let seed = {};
  try{
    const c = JSON.parse(localStorage.getItem("hf_config"));
    if(c && typeof c === "object") seed = {pois:c.pois, budgetRent:c.budgetRent, budgetSale:c.budgetSale, routePoi:c.routePoi};
  }catch(e){}
  const first = normalizeProfile({...seed, name:"My search"});
  return { list:[first], activeId:first.id };
}

function saveProfiles(){ try{ localStorage.setItem("hf_profiles", JSON.stringify(HF)); }catch(e){} }

function activeProfile(){
  return HF.list.find(p => p.id === HF.activeId) || HF.list[0];
}
function setActiveProfile(id){
  if(HF.list.some(p => p.id === id)){ HF.activeId = id; saveProfiles(); return true; }
  return false;
}
function upsertProfile(p){
  const prof = normalizeProfile(p);
  const i = HF.list.findIndex(x => x.id === prof.id);
  if(i >= 0) HF.list[i] = prof; else HF.list.push(prof);
  HF.activeId = prof.id;
  saveProfiles();
  return prof;
}
function addProfile(name){
  const base = activeProfile();
  const p = normalizeProfile({...DEFAULT_PROFILE, name: name || "New search", id: newProfileId(),
    budgetRent: base.budgetRent, budgetSale: base.budgetSale});
  HF.list.push(p); HF.activeId = p.id; saveProfiles();
  return p;
}
function deleteProfile(id){
  if(HF.list.length <= 1) return false;
  HF.list = HF.list.filter(p => p.id !== id);
  if(!HF.list.some(p => p.id === HF.activeId)) HF.activeId = HF.list[0].id;
  saveProfiles();
  return true;
}

/* ---- derived values the scoring engine consumes ------------------------- */

// Priority-scaled component maxima, re-normalized to total 100.
// `prof` lets the questionnaire preview an unsaved draft; defaults to active.
function weightsFor(market, prof){
  const p = prof || activeProfile();
  const keys = Object.keys(BASE_WEIGHTS).filter(k => !(market === "sale" && k === "internet"));
  const raw = {};
  keys.forEach(k => {
    let w = BASE_WEIGHTS[k] * (PRIORITY_FACTOR[p.priorities[k]] != null ? PRIORITY_FACTOR[p.priorities[k]] : 1);
    // Mode-aware nudges: parking barely matters without a car; it matters more
    // for drivers who commute daily.
    if(k === "parking"){
      if(p.transport === "active") w *= 0.25;
      else if(p.transport === "transit") w *= 0.5;
      if(p.transport === "car" && p.commuteFreq === "daily") w *= 1.15;
    }
    // Rare trips make commute less decisive; daily trips make it more.
    if(k === "location"){
      if(p.commuteFreq === "occasional") w *= 0.7;
      else if(p.commuteFreq === "daily") w *= 1.1;
    }
    // Wary of scams/classifieds -> listing clarity carries more weight.
    if(k === "trust" && p.verifiedOnly) w *= 1.6;
    raw[k] = w;
  });
  const sum = keys.reduce((a, k) => a + raw[k], 0) || 1;
  const out = {};
  keys.forEach(k => { out[k] = Math.max(2, Math.round(raw[k] / sum * 100)); });
  return out;
}

// Must-haves become the "critical" criteria that cap a score when unknown.
function criticalKeysFor(market){
  const p = activeProfile();
  const keys = ["location", "cost"];               // always essential
  if(p.mustHaves.includes("parking") && market !== "sale") keys.push("parking");
  if(p.mustHaves.includes("internet") && market !== "sale") keys.push("internet");
  if(p.mustHaves.includes("privateBath") || p.mustHaves.includes("separateEntrance")) keys.push("privacy");
  return keys;
}

// Acceptable straight-line radius (km) implied by max commute + travel mode.
function maxRadiusKm(){
  const p = activeProfile();
  const spd = TRANSPORT_SPEED[p.transport] != null ? TRANSPORT_SPEED[p.transport] : TRANSPORT_SPEED.car;
  return Math.max(0.8, spd * (Math.max(5, Number(p.maxCommute) || 25) / 60));
}
function maxCommuteMin(){ return Math.max(5, Number(activeProfile().maxCommute) || 25); }

function poiListForScoring(){ return activeProfile().pois || []; }
function budgetForMarket(market){
  const p = activeProfile();
  return market === "sale" ? (Number(p.budgetSale) || 500000) : (Number(p.budgetRent) || 1000);
}
function budgetIsFirm(){ return !!activeProfile().budgetFirm; }
function hasDealBreaker(k){ return (activeProfile().dealBreakers || []).includes(k); }
function isTuned(){ return !!activeProfile().tuned; }

/* ============================================================================
   LIVE DATA — reads from a shared Google Sheet at runtime (no hard-coded rows).
   ----------------------------------------------------------------------------
   [NEEDS OWNER] Paste your Google Sheet ID between the quotes below.
   The Sheet ID is the long string in the Sheet URL between /d/ and /edit :
     https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
   The Sheet must be shared:  Share > General access > Anyone with the link > Viewer.
   The Sheet needs two tabs named:  Listings   and   Sites
   (seed them by importing oiart_listings.csv and oiart_sites.csv).
   ========================================================================== */
const SHEET_ID = "1ddciH2oqLcQxEePD-AEoO4GCqI8XztRcC1YTMJxZm9s";
const SHEET_TAB_CANDIDATES = {
  listings: ["Listings"],
  sites: ["Sites", "sites"]
};

/* Optional true write-back (see the big comment block at the bottom of this file).
   Leave "" for the default read-only mirror. Paste an Apps Script /exec URL to
   let workflow edits write straight into the Sheet. */
const WRITE_URL = "https://script.google.com/macros/s/AKfycbxOqmjH0VJ_K-sgKEWkoSP_PVeWVhkhW2O8ITX6UdLg3sbHvXzBj-pKumpLsdzFjuK7/exec";
const UPDATED_BY = "Home Finder site";
/* Optional shared secret to stop drive-by writes to the open Apps Script endpoint.
   Leave "" to keep the current behaviour. To turn it on: pick any random string,
   paste the SAME value here and into WRITE_TOKEN in apps-script/OIART_WRITEBACK.gs,
   then redeploy the web app. When both match, writes without the token are rejected. */
const WRITE_TOKEN = "";
const CSV_FALLBACKS = {
  listings: "oiart_listings.csv",
  sites: "oiart_sites.csv"
};

/* ============================================================================
   GENERIC APP CONFIG — your places, your budgets.
   The tool is destination-agnostic: the user sets up to MAX_POIS anchor places
   (work, school, family…) in the "My places" panel. Distances, map rings and
   route links are computed against those. Stored in this browser only.
   ========================================================================== */
const APP_NAME = "Home Finder";
/* Places, budgets and weightings all live in the ACTIVE PROFILE (profile.js),
   so you can keep separate saved searches — e.g. "Waterloo" and "London" —
   each with its own anchors, budget and priorities. `config` is a thin alias
   onto that profile so the rest of this file reads naturally. */
const config = new Proxy({}, {
  get: (_, k) => activeProfile()[k],
  set: (_, k, v) => { activeProfile()[k] = v; return true; }
});
function saveConfig(){ saveProfiles(); }
function getPois(){
  return poiListForScoring().filter(p => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)));
}
function activePoi(){
  const ps = getPois();
  if(!ps.length) return null;
  return ps[Math.min(num(activeProfile().routePoi, 0), ps.length - 1)];
}
function poiName(p, i){ return asText(p && p.name) || `Place ${i + 1}`; }
function budgetFor(market){ return budgetForMarket(market); }
function fmtMoney(n){ return !Number.isFinite(n) ? "Budget not set" : n >= 10000 ? "$" + Math.round(n / 1000) + "k" : "$" + Number(n).toLocaleString(); }
function haversineKm(aLat, aLon, bLat, bLon){
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(bLat - aLat), dLon = toR(bLon - aLon);
  const s = Math.sin(dLat/2)**2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const WORKFLOW_COLUMNS = [
  "Status","Contacted","LastContacted","Response","ViewingBooked","ViewingDate",
  "Decision","RemoveReason","FriendNotes","ParkingConfirmed","InternetConfirmed",
  "AddressConfirmed","JulyConfirmed","TimingConfirmed","ScamRisk","UpdatedAt","UpdatedBy",
  "CanonicalKey","DuplicateOf","OffMarketSince"
];
const IMAGE_COLUMNS = [
  "ImageURL","ImageAlt","ImageSource","ImageChecked"
];
const WRITABLE_FIELDS = [
  "Archived","Status","Contacted","LastContacted","Response","ViewingBooked",
  "ViewingDate","Decision","RemoveReason","FriendNotes","ParkingConfirmed",
  "InternetConfirmed","AddressConfirmed","JulyConfirmed","TimingConfirmed","ScamRisk",
  "UpdatedAt","UpdatedBy","ListingKind","DuplicateOf","CanonicalKey",
  "ImageURL","ImageAlt","ImageSource","ImageChecked","OffMarketSince"
];

/* Option B fallback (only if you ever hit a CORS edge case with gviz above):
   publish each tab as CSV (File > Share > Publish to web > tab > CSV), add
   the PapaParse CDN script tag to <head> (unpkg.com/papaparse@5/papaparse.min.js),
   paste the two pub?...output=csv URLs here, and call loadSheetCSV() instead.
   const LISTINGS_CSV_URL = "";
   const SITES_CSV_URL    = "";
*/

let rows = [];
let allRows = [];
let loadVersion = 0;
let writePending = 0;
const pendingIds = new Set();
let sites = [];
let neighbourhoods = [];
let sources = [];

function uniqSorted(arr){
  return [...new Set(arr.map(v => String(v ?? "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function asText(v){ return String(v ?? "").trim(); }
function truthy(v){ return /^(true|yes|y|1|confirmed|booked|done)$/i.test(asText(v)); }
function compact(parts){ return parts.map(asText).filter(Boolean).join(" "); }
function textOr(v, fallback="Not entered"){ return asText(v) || fallback; }
function parseNum(v){ const s = asText(v).replace(/[$,]/g, ""); return s ? Number(s) : NaN; }
function safeUrl(v){
  const s = asText(v);
  if(!s) return "";
  try{
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u.href : "";
  }catch(e){ return ""; }
}
function linkButton(url, label, cls="", missing="No link entered"){
  const href = safeUrl(url);
  return href
    ? `<a class="linkbtn ${cls}" href="${safe(href)}" target="_blank" rel="noopener">${safe(label)}</a>`
    : `<span class="linkbtn disabled" title="${safe(missing)}">${safe(missing)}</span>`;
}
function listingImageUrl(r){ return safeUrl(r.ImageURL || r["Image URL"] || r.Image); }
function rentLabel(r){return asText(r["Rent text"]) || (Number.isFinite(r.RentNum) ? fmtMoney(r.RentNum)+(r.MarketType==="sale"?"":" / month") : "Price not entered");}
function imageAlt(r){ return textOr(r.ImageAlt, textOr(r["Listing / lead"], "Rental listing image")); }
function imageThumb(r){
  const url = listingImageUrl(r);
  if(!url) return "";
  return `<div class="thumbwrap"><img src="${safe(url)}" alt="${safe(imageAlt(r))}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></div>`;
}
function popupImage(r){
  const url = listingImageUrl(r);
  if(!url) return "";
  return `<img class="popupthumb" src="${safe(url)}" alt="${safe(imageAlt(r))}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
}
function tableThumb(r){
  const url = listingImageUrl(r);
  if(!url) return "";
  return `<img class="tablethumb" src="${safe(url)}" alt="${safe(imageAlt(r))}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
}
function detailCell(label, value){
  const v = asText(value);
  if(!v) return "";
  return `<div class="ditem"><span class="dlabel">${safe(label)}</span><span class="dval">${safe(v)}</span></div>`;
}
// Clean 1..N display rank from the decimal Priority order (decimals are an
// insert-between convention kept for sorting; the UI shows tidy integers).
// Ranked separately for active vs archived so each view reads 1,2,3,…
function computeRanks(){
  const groups = { active: [], archived: [] };
  rows.forEach(r => (isArchived(r) ? groups.archived : groups.active).push(r));
  Object.values(groups).forEach(list => {
    list.sort((a, b) => b.ScoreNum-a.ScoreNum || num(a.PriorityNum, 1e9)-num(b.PriorityNum, 1e9));
    list.forEach((r, i) => { r.RankDisplay = i + 1; });
  });
}
function rankLabel(r){ return Number.isFinite(r.RankDisplay) ? r.RankDisplay : textOr(r.Priority, r.DisplayID); }
function rankTitle(r){ const p = asText(r.Priority); return p ? `Priority ${p}` : "No priority set"; }
// One compact main row + a hidden detail row (toggled by the ▸ button) so the
// table stays scannable and the heavy fields only appear on demand.
function tableRow(r){
  const id = safe(r.ID);
  const sel = String(selectedListingId) === String(r.ID) ? "selectedrow" : "";
  const lvl = scoreLevelClass(r);
  const driveTxt = Number.isFinite(r.DriveNum) ? `${safe(r["Est drive min"])} min` : (Number.isFinite(r.KmNearest) ? `${r.KmNearest.toFixed(1)} km` : "—");
  const kmTxt = Number.isFinite(r.KmNearest) && asText(r["Est drive min"]) ? `${r.KmNearest.toFixed(1)} km → ${safe(r.NearestPoiName)}` : (asText(r["Km straight-line"]) ? `${safe(r["Km straight-line"])} km` : "");
  const dup = asText(r.DuplicateOf) ? `<span class="pill warnpill" title="Duplicate of ${safe(r.DuplicateOf)}">dup ${safe(r.DuplicateOf)}</span>` : "";
  const scoreFlag = lvl ? `<span class="scoreflag ${lvl}" title="A must-have criterion is unconfirmed — expand for details">⚠</span>` : "";

  const detail = [
    detailCell("Parking", textOr(r.Parking, "not stated")),
    detailCell("Internet / utilities", textOr(r["Internet / utilities"], "not stated")),
    detailCell("Availability", textOr(r.Availability, "not stated")),
    r.PoiKmText ? detailCell("Distance to your places", r.PoiKmText) : "",
    detailCell("Contact", r.ContactedBool ? compact(["Contacted", r.LastContacted]) : compact(["Not contacted", r.Response])),
    detailCell("Decision", compact([r.Decision, r.ViewingDate ? ("viewing " + r.ViewingDate) : ""])),
    r.ScamRisk ? detailCell("Scam risk", r.ScamRisk) : "",
    r.FriendNotes ? detailCell("Notes", r.FriendNotes) : "",
    detailCell("Dates", compact([r["Date seen"] ? ("seen " + r["Date seen"]) : "", r["Last checked"] ? ("checked " + r["Last checked"]) : ""])),
    detailCell("Score breakdown", scoreBreakdown(r)),
    r["Why add / note"] ? detailCell("Why", r["Why add / note"]) : "",
    r["What to verify"] ? detailCell("Verify", r["What to verify"]) : ""
  ].join("");
  const flags = scoreFlags(r);
  const confirmRow = flags ? `<div class="ditem ditem-full"><span class="dlabel">Still to confirm</span><span>${flags}</span></div>` : "";
  const routesHtml = routeLinksHtml(r);
  const routesRow = routesHtml ? `<div class="ditem ditem-full"><span class="dlabel">Routes</span><span class="links" style="margin-top:2px">${routesHtml}</span></div>` : "";

  return `<tr data-row-id="${id}" class="mainrow ${r.IsNew?'rownew ':''}${sel}">
    <td class="colexpand"><button class="expandbtn" data-expand="${id}" aria-label="Show full details" title="Show full details">▸</button></td>
    <td><b class="rank" title="${safe(rankTitle(r))}">${safe(rankLabel(r))}</b>${r.NeedsId?'<br><span class="meta">Needs ID</span>':''}</td>
    <td><div class="listingcell">${tableThumb(r)}<div class="listinginfo"><b class="listingtitle">${safe(textOr(r["Listing / lead"], "Untitled listing"))}</b><div class="meta">${safe(textOr(r.Neighbourhood))}${asText(r.Type)?` · ${safe(r.Type)}`:""}</div><div class="kindline">${r.MarketType==="sale"?'<span class="pill salepill">For sale</span>':''}<span class="pill kindpill ${kindClass(r)}">${safe(r.ListingKind)}</span>${r.IsNew?'<span class="pill newpill">★ new</span>':''}${dup}</div></div></div></td>
    <td><span class="pill ${pillClass(r)}">${volLabel(r)}</span></td>
    <td><b>${safe(rentLabel(r))}</b>${asText(r["Rent text"]) && asText(r["Approx monthly share"])?`<br><span class="meta">share ${safe(r["Approx monthly share"])}</span>`:""}</td>
    <td>${driveTxt}${kmTxt?`<br><span class="meta">${kmTxt}</span>`:""}</td>
    <td><b class="scoreval ${lvl}">${safe(r.ScoreNum)}</b>${scoreFlag}</td>
    <td><span class="statustext">${safe(textOr(r.Status || r.Action, "—"))}</span></td>
    <td><div class="links tablelinks">${linkButton(r.URL, "Listing")} ${linkButton(routeLink(r), "Route", "route", "No route")}<button class="linkbtn copy" data-copy="${id}" type="button">Copy</button></div></td>
  </tr>
  <tr class="detailrow" data-detail-id="${id}" hidden><td class="colexpand"></td><td colspan="8"><div class="detailgrid">${detail}${routesRow}${confirmRow}</div></td></tr>`;
}
/* Routes: listing → one of the user's places. The Route buttons on cards and
   table rows follow the global "Route to" selector (activePoi). Popups and
   expanded rows offer a route per place. With no places configured, the
   sheet's own Maps link (if any) is the fallback. */
function routeLinkTo(r, poi){
  if(!poi) return safeUrl(r["Maps link"]);
  const hasLL = Number.isFinite(num(r.LatNum,NaN)) && Number.isFinite(num(r.LonNum,NaN));
  const origin = hasLL ? `${r.LatNum},${r.LonNum}` : compact([r["Address / locator"], r.Neighbourhood]);
  if(!origin) return "";
  const mode={car:"driving",transit:"transit",active:"walking",mixed:"driving"}[activeProfile().transport] || "driving";
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(poi.lat + "," + poi.lon)}&travelmode=${mode}`;
}
function routeLink(r){ return routeLinkTo(r, activePoi()); }
function routeLinksHtml(r){
  const ps = getPois();
  if(!ps.length){
    const fall = safeUrl(r["Maps link"]);
    return fall ? linkButton(fall, "Route", "route") : `<span class="linkbtn disabled" title="Set your places (📍 My places) to get routes">No route info</span>`;
  }
  return ps.map((p,i) => linkButton(routeLinkTo(r,p), "→ " + poiName(p,i), "route", "No route")).join(" ");
}
function csvEscape(v){
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function sheetUrl(tabName){
  const ids = {Listings:280478168, "OIART BASED LISTINGS":280478168, Sites:262262253};
  const selector = Object.hasOwn(ids, tabName) ? `gid=${ids[tabName]}` : `sheet=${encodeURIComponent(tabName)}`;
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&${selector}`;
}

function parseCsv(text){
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const ch = text[i], next = text[i + 1];
    if(inQuotes){
      if(ch === '"' && next === '"'){ field += '"'; i++; }
      else if(ch === '"') inQuotes = false;
      else field += ch;
    }else if(ch === '"') inQuotes = true;
    else if(ch === ","){ row.push(field); field = ""; }
    else if(ch === "\n"){
      row.push(field); rows.push(row); row = []; field = "";
    }else if(ch !== "\r") field += ch;
  }
  if(field || row.length){ row.push(field); rows.push(row); }
  const header = (rows.shift() || []).map(asText);
  return rows
    .filter(r => r.some(cell => asText(cell)))
    .map((r, index) => ({...Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])), _RowNumber: index + 2}));
}

// gviz wraps the JSON in google.visualization.Query.setResponse(...). Strip it,
// then key every cell by its column header label. Use the formatted value for
// date columns (so they read like the sheet) and the raw value for everything
// else (so numeric precision such as lat/long is preserved).
function parseGviz(text){
  const json = text.slice(text.indexOf("(") + 1, text.lastIndexOf(")"));
  const data = JSON.parse(json);
  if(data.status === "error" || !data.table) throw new Error(data.errors?.[0]?.detailed_message || "Invalid Sheet response");
  const cols = data.table.cols.map(c => ({ label: String(c.label || c.id || "").trim(), type: c.type }));
  return data.table.rows.map((tr, index) => {
    const o = {};
    (tr.c || []).forEach((cell, i) => {
      const col = cols[i];
      if(!col || !col.label) return;
      let val = "";
      if(cell){
        const isDate = col.type === "date" || col.type === "datetime" || col.type === "timeofday";
        if(isDate && cell.f != null)      val = cell.f;
        else if(cell.v != null)           val = cell.v;
        else if(cell.f != null)           val = cell.f;
      }
      o[col.label] = val;
    });
    o._RowNumber = index + 2;
    return o;
  });
}

async function loadCsv(path, kind){
  const res = await fetch(path, { cache: "no-store" });
  if(!res.ok) throw new Error("CSV HTTP " + res.status);
  const list = parseCsv(await res.text());
  return kind === "sites" ? list.map(deriveSite) : list.map(deriveListing);
}

/* ---- computed scoring (mirrors the memory-file rubric, §6) ----------------
   Total 100 = location/commute 30 + cost 20 + parking&internet 15 +
   privacy 15 + lease timing 10 + trust 10. Scores are derived in-app from the
   sheet fields so they stay live: edit rent/drive/parking and the score moves.
   A manual "ScoreOverride" column (if present and numeric) wins, so anything you
   hand-tune is preserved. The sheet's original "Score" is kept for comparison. */
/* Location scoring is fully generic: it uses the sheet's drive-time estimate
   when present, otherwise the live straight-line distance to the nearest of
   the user's configured places. No hardcoded neighbourhoods. */

/* Graduated, honest scoring. Each component returns either points it earned
   (rewarding what the listing actually states) OR na:true when the listing is
   silent on it. N/A components are EXCLUDED from the maths (so a missing field
   doesn't fake-penalise) and instead surfaced as an orange "confirm" flag.
   Stated negatives (no parking, September start, shared bedroom) score low and
   show a red flag. Total = earned / (sum of known maxes) * 100, so it's always
   "of what we actually know, here's the fit." */
const SCORE_SHORT = {
  location:"commute", cost:"price", parking:"parking", internet:"internet",
  privacy:"home type", lease:"timing", trust:"listing"
};
/* "Must-have" criteria: if any of these are N/A (never stated), the score is
   capped one §7 band per missing item and the score pill turns amber/red — a
   lead can't look like a 90 when a must-have is invisible. Edit this set to add
   a 4th (e.g. "privacy" or "lease") or relax it. Caps map to the score bands:
   0 missing = no cap, 1 = 79 (strong→add-if-gap), 2 = 69 (backup), 3+ = 59 (cut). */
const CRITICAL_KEYS = ["location", "cost", "parking"];
const CRITICAL_CAP = {0:100, 1:79, 2:69};

function computeScore(r){
  const market = r.MarketType || "rent";
  const W = weightsFor(market);          // priority-scaled maxima, total 100
  const comps = [];
  const hardCaps = [];                   // stated deal-breakers hit on this row
  const push = (key, label, res) => {
    const max = W[key] != null ? W[key] : BASE_WEIGHTS[key];
    // Component results are authored on their base scale, then rescaled to the
    // profile's weight so a 1–5 priority slider genuinely changes the ranking.
    const scale = max / (BASE_WEIGHTS[key] || max || 1);
    if(res.na) comps.push({key, label, max, earned:0, na:true, level:"na", note:res.note || (label + " not stated")});
    else comps.push({key, label, max, earned:Math.max(0, Math.min(max, Math.round(res.pts * scale))), na:false, level:res.level || "ok", note:res.note || ""});
  };

  // Location + commute — priority-weighted distance to the user's places
  // (Place 1 counts most), blended with the sheet's drive estimate when present.
  // Bands are RELATIVE to the profile's max commute + travel mode, so the same
  // engine works for a 10-minute walk-to-campus search and a 40-minute drive.
  push("location", "Location / commute", (function(){
    const d = r.DriveNum, km = r.KmWeighted;
    const maxMin = maxCommuteMin(), maxKm = maxRadiusKm();
    const band = ratio => ratio <= 0.4 ? 30 : ratio <= 0.7 ? 26 : ratio <= 1.0 ? 20 : ratio <= 1.35 ? 12 : 8;
    let pts = null, note = "";
    if(Number.isFinite(km)){
      pts = band(km / maxKm);
      note = `weighted ${km.toFixed(1)} km${r.PoiKmText ? " (" + r.PoiKmText + ")" : ""} vs ${maxKm.toFixed(0)} km target`;
      if(Number.isFinite(d)){ pts = Math.round((pts + band(d / maxMin)) / 2); note += ` · drive ~${d} min`; }
    } else if(Number.isFinite(d)){
      pts = band(d / maxMin);
      note = `drive ~${d} min vs ${maxMin} min limit`;
    }
    if(pts == null) return {na:true, note:"No distance known — set My places, or add coords / drive time"};
    const overLimit = (Number.isFinite(d) && d > maxMin) || (Number.isFinite(km) && km > maxKm);
    if(overLimit && hasDealBreaker("longCommute")) hardCaps.push("commute beyond your limit");
    return {pts, level: pts <= 12 ? "warn" : "ok", note};
  })());

  // Cost / value — graduated against the market budget, so $1,000 rentals and
  // $500k houses score on the same honest curve. A "hard ceiling" budget bites
  // harder (and can be a deal-breaker); "can stretch" keeps the gentler curve.
  push("cost", market === "sale" ? "Price vs budget" : "Cost / all-in value", (function(){
    const v = r.RentNum;
    if(!Number.isFinite(v)) return {na:true, note:"Price not stated"};
    const b = budgetFor(market), firm = budgetIsFirm();
    if(!Number.isFinite(b)) return {na:true, note:"Set a budget in your profile"};
    const allIn = market !== "sale" && ListingRules.internet(r).allIn;
    const ideal = market === "rent" ? parseNum(activeProfile().budgetIdeal) : NaN;
    const target = Number.isFinite(ideal) && ideal > 0 ? Math.min(ideal,b) : b;
    const ratio = v / target;
    let pts;
    if(ratio <= 0.9) pts = allIn ? 20 : 18;
    else if(ratio <= 1.0) pts = allIn ? 19 : 16;
    else if(ratio <= 1.15) pts = firm ? 10 : 14;
    else if(ratio <= 1.3) pts = firm ? 6 : 11;
    else if(ratio <= 1.5) pts = firm ? 4 : 8;
    else if(ratio <= 1.8) pts = firm ? 2 : 5;
    else pts = firm ? 1 : 3;
    if(v > b && hasDealBreaker("overBudget")) hardCaps.push("over your budget");
    return {pts, level: ratio > (firm ? 1.0 : 1.5) ? "warn" : "ok",
      note: `${Math.round(ratio * 100)}% of ${fmtMoney(target)} preferred / ${fmtMoney(b)} maximum${firm ? " (hard ceiling)" : ""}`};
  })());

  // Parking
  push("parking", "Parking", (function(){
    const evidence = ListingRules.parking(r);
    if(evidence.state === "no"){
      if(hasDealBreaker("noParking")) hardCaps.push("no parking");
      return {pts:0, level:"bad", note:"No parking"};
    }
    if(evidence.state === "paid") return {pts:7, level:"warn", note:"paid parking"};
    if(evidence.state === "yes") return {pts:10, note:"parking available"};
    return {na:true, note:"Parking not confirmed"};
  })());

  // Internet / utilities — RENTALS ONLY. Owners arrange their own service,
  // so for-sale rows skip this component entirely (the known-points
  // renormalization absorbs it; no fake "confirm internet" flags on houses).
  if(market !== "sale"){
    push("internet", "Internet / utilities", (function(){
      const evidence = ListingRules.internet(r);
      if(evidence.state !== "unknown") return {pts:evidence.pts, level:evidence.pts < 5 ? "warn" : "ok", note:evidence.state};
      return {na:true, note:"Internet / utilities not confirmed"};
    })());
  }

  // Privacy + housing type /15 — market-aware:
  // rent: private unit > private room > shared; sale: property fit
  // (detached > semi/town > condo, which carries fees and less land).
  push("privacy", market === "sale" ? "Property type / fit" : "Privacy / housing type", (function(){
    const t = compact([r.Type, r["Criteria fit"]]).toLowerCase();
    if(!t) return {na:true, note:"Home type not stated"};
    const p = activeProfile();
    const wantsWhole = p.household === "family" || p.household === "couple";
    if(market === "sale"){
      if(/detached|house(?!hold)|bungalow|two-?stor/.test(t) && !/semi|town|condo/.test(t)) return {pts:15, note:"detached house"};
      if(/semi|town(house|home)|duplex|link/.test(t)) return {pts:13, note:"semi / townhouse"};
      if(/condo|apartment|loft|strata/.test(t)) return {pts:11, note:"condo / apartment (check fees)"};
      return {pts:9, note:"type unclear"};
    }
    const evidence = ListingRules.privacy(r);
    if(evidence.state === "unknown") return {na:true, note:"Home type not stated"};
    if(evidence.state === "shared"){
      if(hasDealBreaker("sharedBedroom")) hardCaps.push("shared bedroom");
      return {pts:5, level:"bad", note:"Shared bedroom"};
    }
    if(evidence.state === "unit") return {pts:15, note:"private unit / own bath"};
    // A room in a shared house is a poor fit for couples and families.
    if(evidence.state === "privateRoom") return wantsWhole ? {pts:7, level:"warn", note:"room only — you wanted a whole place"} : {pts:12, note:"private room"};
    if(evidence.state === "room") return wantsWhole ? {pts:6, level:"warn", note:"room only — you wanted a whole place"} : {pts:11, note:"room in shared house"};
    return {pts:8, note:"type unclear"};
  })());

  // Timing /10 — market-aware, graduated on what's actually stated.
  // rent: move-in timing; sale: possession/closing (tenanted = real gotcha).
  push("lease", market === "sale" ? "Possession / closing" : "Move-in timing", (function(){
    const t = ListingRules.stated(r.Availability).toLowerCase();
    const want = asText(activeProfile().timing).toLowerCase();
    // If the profile names a target month and the listing states it, that's a
    // direct hit — the strongest timing signal we can get.
    if(market === "sale"){
      if(/vacant|immediate|quick clos|flexible/.test(t)) return {pts:10, note:"vacant / flexible possession"};
      if(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{2,4}[-/]\d{1,2}/.test(t)) return {pts:9, note:"possession date stated"};
      if(/tenant|leased|rented until/.test(t)){
        if(hasDealBreaker("tenanted")) hardCaps.push("tenanted");
        return {pts:5, level:"bad", note:"Tenanted — possession delayed"};
      }
      return {na:true, note:"Possession not stated — confirm"};
    }
    const evidence = ListingRules.timing(r, want);
    if(evidence.state === "mismatch") return {pts:4, level:"bad", note:"Different move-in month / year"};
    if(evidence.state !== "unknown") return {pts:evidence.pts, note:evidence.state};
    return {na:true, note:"Timing not stated — confirm"};
  })());

  // Trust / clarity / quality — always assessable
  push("trust", "Trust / clarity", (function(){
    let pts = 10; const notes = [];
    const kind = String(r.ListingKind || "").toLowerCase();
    const risk = asText(r.ScamRisk).toLowerCase();
    if(/high/.test(risk)){ pts -= 6; notes.push("high scam risk"); }
    else if(/med/.test(risk)){ pts -= 3; notes.push("medium scam risk"); }
    if(/search|needs/.test(kind)){ pts -= 3; notes.push("no direct listing URL"); }
    const addr = asText(r["Address / locator"]).toLowerCase();
    if(!addr || /area only|approx|unknown/.test(addr)){
      pts -= 2; notes.push("no exact address");
      if(hasDealBreaker("noAddress")) hardCaps.push("no exact address");
    }
    if(!listingImageUrl(r)) pts -= 1;
    if(pts < 0) pts = 0;
    return {pts, level: pts <= 4 ? "bad" : "ok", note:notes.join(", ")};
  })());

  const known = comps.filter(c => !c.na);
  const knownMax = known.reduce((a, c) => a + c.max, 0);
  const totalMax = comps.reduce((a, c) => a + c.max, 0);
  const earned = known.reduce((a, c) => a + c.earned, 0);
  const raw = knownMax ? Math.max(0, Math.min(100, Math.round(earned / knownMax * 100))) : 0;
  // Cap one band per missing must-have so an unknown essential can't inflate.
  // Which criteria are "must-have" comes from the questionnaire (profile.js).
  const critKeys = criticalKeysFor(market);
  const criticalUnknown = comps.filter(c => c.na && critKeys.includes(c.key)).map(c => c.key);
  let cap = criticalUnknown.length >= 3 ? 59 : CRITICAL_CAP[criticalUnknown.length];
  // A STATED deal-breaker is worse than an unknown: hard-cap into "cut" range.
  if(hardCaps.length) cap = Math.min(cap, 45);
  const total = Math.min(raw, cap);
  return {
    total, raw, cap, criticalUnknown, hardCaps,
    components: comps,
    unconfirmed: comps.filter(c => c.na).map(c => c.key),
    negatives: comps.filter(c => c.level === "bad").map(c => c.key),
    knownMax, totalMax
  };
}

// '' (essentials known), 'scorewarn' (1 must-have missing), 'scorecrit' (2+).
function scoreLevelClass(r){
  if((r.ScoreHardCaps || []).length) return "scorecrit";
  const n = (r.ScoreCritUnknown || []).length;
  return n >= 2 ? "scorecrit" : n === 1 ? "scorewarn" : "";
}

function scoreBreakdown(r){
  const comps = r.ScoreComponents || [];
  const body = comps.map(c => c.na ? `${c.label} N/A` : `${c.label} ${c.earned}/${c.max}`).join(" · ");
  const tmax = Number.isFinite(r.ScoreTotalMax) ? r.ScoreTotalMax : 100;
  let s = `Auto-score ${r.ScoreNum}/100 — ${body}`;
  if(Number.isFinite(r.ScoreKnownMax) && r.ScoreKnownMax < tmax) s += ` · scored on ${r.ScoreKnownMax}/${tmax} known pts`;
  if(r.ScoreComputed && (r.ScoreCritUnknown || []).length){
    const names = r.ScoreCritUnknown.map(k => SCORE_SHORT[k] || k).join(", ");
    s += ` · ⚠ capped at ${r.ScoreCap} — must-have unconfirmed: ${names}`;
  }
  if(r.ScoreComputed && Number.isFinite(r.ScoreSheet)) s += ` · (sheet had ${r.ScoreSheet})`;
  if(!r.ScoreComputed) s += ` · manual ScoreOverride in use`;
  return s;
}

// Orange "confirm" chips for N/A components, red chips for stated negatives.
function scoreFlags(r){
  const comps = r.ScoreComponents || [];
  const chips = [];
  (r.RequirementUnknown || []).forEach(key=>chips.push(`<span class="flagchip na">Confirm ${safe(key.replace(/([A-Z])/g," $1").toLowerCase())}</span>`));
  (r.RequirementFailures || []).forEach(key=>chips.push(`<span class="flagchip bad">Outside brief: ${safe(key.replace(/([A-Z])/g," $1").toLowerCase())}</span>`));
  (r.ScoreHardCaps || []).forEach(h => chips.push(`<span class="flagchip breaker" title="You marked this a deal-breaker — score hard-capped">✕ ${safe(h)}</span>`));
  comps.forEach(c => {
    if(c.na) chips.push(`<span class="flagchip na" title="Not stated in the listing yet — contact to confirm">Confirm ${safe(SCORE_SHORT[c.key] || c.label)}</span>`);
    else if(c.level === "bad") chips.push(`<span class="flagchip bad" title="${safe(c.note || c.label)}">${safe(c.note || c.label)}</span>`);
  });
  return chips.length ? `<div class="confirmflags">${chips.join("")}</div>` : "";
}

/* ---- styled score-breakdown popup on hover (replaces the weak native title) ---- */
function scoreTipHTML(r){
  const comps = r.ScoreComponents || [];
  const rowsHtml = comps.map(c => {
    const pct = c.na ? 0 : Math.round(c.earned / c.max * 100);
    const val = c.na ? `<span class="stna">N/A</span>` : `${c.earned}<span class="stmax">/${c.max}</span>`;
    const barCls = c.na ? "na" : c.level === "bad" ? "bad" : c.level === "warn" ? "warn" : "ok";
    return `<div class="strow"><span class="stlabel">${safe(c.label)}</span><span class="stbar"><i class="${barCls}" style="width:${pct}%"></i></span><span class="stval">${val}</span></div>`;
  }).join("");
  const notes = [];
  const tmax = Number.isFinite(r.ScoreTotalMax) ? r.ScoreTotalMax : 100;
  if((r.ScoreHardCaps || []).length) notes.push(`✕ deal-breaker: ${r.ScoreHardCaps.join(", ")} — capped at ${r.ScoreCap}`);
  if(Number.isFinite(r.ScoreKnownMax) && r.ScoreKnownMax < tmax) notes.push(`scored on ${r.ScoreKnownMax}/${tmax} known points`);
  if(r.ScoreComputed && (r.ScoreCritUnknown || []).length) notes.push(`⚠ capped at ${r.ScoreCap} — must-have unconfirmed: ${r.ScoreCritUnknown.map(k => SCORE_SHORT[k] || k).join(", ")}`);
  if(r.ScoreComputed && Number.isFinite(r.ScoreSheet)) notes.push(`sheet had ${r.ScoreSheet}`);
  if(!r.ScoreComputed) notes.push(`manual ScoreOverride in use`);
  const lvl = scoreLevelClass(r);
  return `<div class="sthead"><b class="${lvl}">${safe(r.ScoreNum)}</b><span>/100 · auto-score</span></div>
    <div class="stbody">${rowsHtml}</div>
    ${notes.length ? `<div class="stfoot">${safe(notes.join(" · "))}</div>` : ""}`;
}

let scoreTipEl = null;
function scoreTip(){ if(!scoreTipEl){ scoreTipEl = document.createElement("div"); scoreTipEl.className = "scoretip"; scoreTipEl.style.display = "none"; document.body.appendChild(scoreTipEl); } return scoreTipEl; }
function rowForScoreEl(elm){
  const host = elm.closest("[data-row-id]") || elm.closest("[data-id]") || elm.closest("[data-detail-id]");
  if(!host) return null;
  const id = host.dataset.rowId || host.dataset.id || host.dataset.detailId;
  return rows.find(x => String(x.ID) === String(id));
}
function placeScoreTip(target){
  const tip = scoreTipEl, pad = 10, gap = 8;
  const rect = target.getBoundingClientRect();
  let left = rect.left, top = rect.bottom + gap;
  if(left + tip.offsetWidth > window.innerWidth - pad) left = window.innerWidth - tip.offsetWidth - pad;
  if(top + tip.offsetHeight > window.innerHeight - pad) top = rect.top - tip.offsetHeight - gap;
  tip.style.left = Math.max(pad, left) + "px";
  tip.style.top = Math.max(pad, top) + "px";
}
document.addEventListener("mouseover", e => {
  const t = e.target.closest(".scoreval, .scorepill");
  if(!t) return;
  const r = rowForScoreEl(t);
  if(!r || !Array.isArray(r.ScoreComponents)) return;
  const tip = scoreTip();
  tip.innerHTML = scoreTipHTML(r);
  tip.style.display = "block";
  placeScoreTip(t);
});
document.addEventListener("mouseout", e => {
  if(scoreTipEl && e.target.closest(".scoreval, .scorepill")) scoreTipEl.style.display = "none";
});

// Recompute the helper fields the UI relies on (the CSV/Sheet does NOT contain them).
function deriveListing(o){
  const originalId = o.NeedsId ? "" : asText(o.ID);
  o.NeedsId = !originalId;
  o.ID = originalId || o.ID || `sheet-row-${o._RowNumber || Math.random().toString(36).slice(2)}`;
  o.DisplayID = originalId || `row ${o._RowNumber || "without ID"}`;
  const rent  = parseNum(o["Approx monthly share"]);
  const park  = String(o["Parking"] || "");
  const net   = String(o["Internet / utilities"] || "");
  [...WORKFLOW_COLUMNS, ...IMAGE_COLUMNS].forEach(k => { if(o[k] == null) o[k] = ""; });
  o.PriorityNum = parseNum(o["Priority"]);
  o.DriveNum    = ListingRules.driveMinutes(o["Est drive min"]);
  // Historical London drive estimates must not be applied to another campus.
  const driveTarget = asText(o.CommuteSearchID) || ListingRules.searchId(o);
  if(activeProfile().searchId && driveTarget && driveTarget !== activeProfile().searchId) o.DriveNum = NaN;
  if(activeProfile().transport !== "car" && getPois().length) o.DriveNum = NaN;
  o.RentNum     = parseNum(o["Approx monthly share"]);
  o.LatNum      = parseNum(o["Latitude"]);
  o.LonNum      = parseNum(o["Longitude"]);
  // Market: "rent" (default) or "sale" — set a Market column in the sheet, or
  // it's inferred from "for sale"/MLS wording in Type / Rent text.
  o.MarketType = /sale/i.test(asText(o.Market)) || /for sale|mls®?\s|listed for|asking price/i.test(compact([o.Type, o["Rent text"]])) ? "sale" : "rent";
  // Distances to the user's configured places (straight-line km, priority-weighted)
  const ps = getPois();
  const hasLL = Number.isFinite(parseNum(o["Latitude"])) && Number.isFinite(parseNum(o["Longitude"]));
  o.KmToPois = ps.map(p => hasLL ? haversineKm(o.LatNum, o.LonNum, Number(p.lat), Number(p.lon)) : NaN);
  const finitePairs = o.KmToPois.map((d, i) => [d, i]).filter(x => Number.isFinite(x[0]));
  if(finitePairs.length){
    const best = finitePairs.reduce((a, b) => b[0] < a[0] ? b : a);
    o.KmNearest = best[0];
    o.NearestPoiName = poiName(ps[best[1]], best[1]);
    const ws = finitePairs.length === 1 ? [1] : finitePairs.length === 2 ? [.65, .35] : [.55, .3, .15];
    let tot = 0, wsum = 0;
    finitePairs.forEach(([d], k) => { const w = ws[k] != null ? ws[k] : ws[ws.length - 1]; tot += d * w; wsum += w; });
    o.KmWeighted = tot / wsum;
    o.PoiKmText = finitePairs.map(([d, i]) => `${poiName(ps[i], i)} ${d.toFixed(1)}`).join(" · ") + " km";
  } else {
    o.KmNearest = NaN; o.KmWeighted = NaN; o.NearestPoiName = ""; o.PoiKmText = "";
  }
  o.UnderTarget = Number.isFinite(rent) && rent <= budgetFor(o.MarketType);
  o.EasyCommute = (Number.isFinite(o.DriveNum) && o.DriveNum <= maxCommuteMin()) || (Number.isFinite(o.KmWeighted) && o.KmWeighted <= maxRadiusKm());
  o.HasParking  = ["yes","paid"].includes(ListingRules.parking(o).state);
  o.HasInternet = ListingRules.internet(o).includedNet === true;
  o.CanonicalKey = asText(o.CanonicalKey) || ListingRules.canonicalKey(o.URL);
  o.ListingKind = listingKind(o);
  o.IsNew       = String(o["IsNew"]).trim().toUpperCase() === "TRUE";
  o.Archived    = String(o["Archived"]).trim().toUpperCase() === "TRUE";
  const status   = compact([o.Status, o.Action]);
  const response = asText(o.Response);
  const decision = compact([o.Decision, status]);
  // Tightened: key each "needs verify" flag off the specific topic in the
  // "What to verify"/address/availability text, not a blanket verify/confirm
  // match — otherwise nearly every row lit up permanently.
  const toVerify = asText(o["What to verify"]).toLowerCase();
  const addrText = asText(o["Address / locator"]).toLowerCase();
  const availText = asText(o.Availability).toLowerCase();
  o.ContactedBool = truthy(o.Contacted) || (!/not contacted|uncontacted/i.test(status) && /\bcontacted\b|messaged|emailed|called|\bsent\b/i.test(status));
  o.WaitingReply = /waiting|pending|sent|messaged|emailed|follow/i.test(compact([status, response])) && !/booked|declined|rejected|dead|remove/i.test(compact([status, response]));
  o.ViewingBookedBool = truthy(o.ViewingBooked) || !!asText(o.ViewingDate) || /viewing|tour|showing|booked/i.test(status);
  o.GoodOption = /good|strong|shortlist|keeper|yes|priority|message first|book viewing/i.test(decision) && !/no|bad|dead|remove|scam/i.test(decision);
  o.NeedsParking  = !truthy(o.ParkingConfirmed)  && (!o.HasParking  || /park/.test(toVerify));
  o.NeedsInternet = o.MarketType !== "sale" && !truthy(o.InternetConfirmed) && (!o.HasInternet || /internet|wifi|util|hydro/.test(toVerify));
  o.NeedsAddress  = !truthy(o.AddressConfirmed)  && (!addrText || /area only|approx|unknown/.test(addrText) || /address|intersection|exact location/.test(toVerify));
  o.NeedsJuly = ListingRules.timing(o, activeProfile().timing).state === "unknown";
  // Live computed score (manual ScoreOverride wins; sheet Score kept for compare)
  const auto = computeScore(o);
  const override = parseNum(o.ScoreOverride);
  o.ScoreSheet       = parseNum(o.Score);
  o.ScoreAuto        = auto.total;
  o.ScoreRaw         = auto.raw;
  o.ScoreCap         = auto.cap;
  o.ScoreCritUnknown = auto.criticalUnknown;
  o.ScoreHardCaps    = auto.hardCaps || [];
  o.ScoreComponents  = auto.components;
  o.ScoreUnconfirmed = auto.unconfirmed;
  o.ScoreNegatives   = auto.negatives;
  o.ScoreKnownMax    = auto.knownMax;
  o.ScoreTotalMax    = auto.totalMax;
  o.ScoreComputed    = !Number.isFinite(override);
  o.ScoreNum         = Number.isFinite(override) ? override : auto.total;
  const checks = profileRequirements(o);
  o.RequirementUnknown = checks.unknown;
  o.RequirementFailures = checks.failed;
  if(o.ScoreComputed){
    const missing=new Set([...auto.criticalUnknown,...checks.unknown]);
    o.ScoreCap=Math.min(o.ScoreCap,missing.size>=3?59:missing.size===2?69:missing.size===1?79:100);
    if(checks.failed.length)o.ScoreCap=Math.min(o.ScoreCap,45);
    o.ScoreNum=Math.min(o.ScoreNum,o.ScoreCap);
    o.ScoreAuto=o.ScoreNum;
  }
  o.ScoreCritUnknown = [...new Set([...auto.criticalUnknown,...checks.unknown])];
  o.ScoreHardCaps = [...new Set([...auto.hardCaps,...checks.failed])];
  o.FitCategory = checks.failed.length || auto.hardCaps.length || o.ScoreNum < 65 ? "outside" :
    isTuned() && !activeProfile().briefPending && o.ScoreNum >= 80 && !auto.criticalUnknown.length && !checks.unknown.length ? "core" : "stretch";
  return o;
}

function profileRequirements(r){
  const p = activeProfile(), unknown=[], failed=[];
  if(p.budgetFirm && Number.isFinite(r.RentNum) && Number.isFinite(budgetFor(r.MarketType)) && r.RentNum>budgetFor(r.MarketType))failed.push("maximum budget");
  const facts = compact([ListingRules.stated(r.Type), ListingRules.stated(r["Criteria fit"]),ListingRules.stated(r.Laundry),ListingRules.stated(r.PetsAllowed)]).toLowerCase();
  const knownBool=value=>truthy(value)?true:/^(false|no|not allowed)$/i.test(asText(value))?false:null;
  const evidence = {
    parking: ListingRules.parking(r).state === "no" ? false : r.HasParking ? true : null,
    internet: /no internet|no wi-?fi|internet unavailable/i.test(asText(r["Internet / utilities"])) ? false : ListingRules.internet(r).state === "unknown" ? null : truthy(r.InternetConfirmed) || r.HasInternet || /\bwi-?fi\b|\binternet\b/i.test(asText(r["Internet / utilities"])) ? true : null,
    privateBedroom: ListingRules.privacy(r).state === "shared" ? false : ["unit","privateRoom"].includes(ListingRules.privacy(r).state) ? true : null,
    privateBath: /shared (bath|washroom)/.test(facts) ? false : /ensuite|en-suite|own bath|private bath/.test(facts) ? true : null,
    separateEntrance: /separate entrance|private entrance/.test(facts) ? true : null,
    laundry: /no laundry|off[- ]site laundry/.test(facts) ? false : /laundry|washer/.test(facts) ? true : null,
    pets: knownBool(r.PetsAllowed) ?? (/no pets|not pet friendly/.test(facts) ? false : /pet[- ]friendly|pets allowed/.test(facts) ? true : null),
    furnished: /unfurnished/i.test(asText(r.Furnishing)) ? false : /^furnished|fully furnished/i.test(asText(r.Furnishing)) ? true : null,
    outdoor: /backyard|outdoor|garden|balcony|patio/.test(facts) ? true : null
  };
  (p.mustHaves || []).forEach(key => {
    if(evidence[key] === false) failed.push(key);
    else if(evidence[key] !== true) unknown.push(key);
  });
  if(p.answers.paidParking==="no" && ListingRules.parking(r).state==="paid")failed.push("paid parking");
  if(p.answers.bills==="included"){
    if(ListingRules.internet(r).allIn!==true){
      if(/extra|shared|additional/i.test(asText(r["Internet / utilities"])))failed.push("utilities extra");
      else unknown.push("included bills");
    }
  }
  if(p.timing && p.answers.temporary!=="yes"){
    const timing=ListingRules.timing(r,p.timing);
    if(timing.state==="mismatch")failed.push("move-in timing");
    else if(timing.state==="unknown")unknown.push("move-in timing");
  }
  const roommates=parseNum(r.Roommates);
  if(p.maxRoommates!=null){
    if(!Number.isFinite(roommates))unknown.push("roommate count");
    else if(roommates>p.maxRoommates)failed.push("too many roommates");
  }
  if(p.answers.parkingNeed==="yes" && Number(p.answers.parkingSpaces)>1){
    const spaces=parseNum(r.ParkingSpaces);
    if(!Number.isFinite(spaces))unknown.push("parking space count");
    else if(spaces<Number(p.answers.parkingSpaces))failed.push("not enough parking spaces");
  }
  if(p.answers.sharedLaundry==="no"){
    if(/shared|communal|in building|on.site/i.test(asText(r.Laundry)))failed.push("shared laundry");
    else if(!/in.unit|private/i.test(asText(r.Laundry)))unknown.push("private laundry");
  }
  if(p.answers.access){
    const accessible=knownBool(r.Accessible);
    if(accessible===false)failed.push("accessibility");else if(accessible!==true)unknown.push("accessibility");
  }
  if(p.answers.housingTypes?.length){
    const types=p.answers.housingTypes;
    const type=asText(r.Type).toLowerCase();
    const isRoom=/\broom\b/.test(type) && !/\b[1-3][- ]bedroom apartment/.test(type);
    const isSplit=/split|[2-9][- ]bed/.test(type);
    const match=(types.includes("room") && isRoom) || (types.includes("whole") && !isRoom && !!type) || (types.includes("split") && isSplit);
    if(type && !match) failed.push("housing type");
  }
  return {unknown,failed};
}

// The sites tab uses verbose headers; alias them onto the keys the panel expects.
function deriveSite(o){
  o.Filters = (o["Recommended filters / search terms"] ?? o.Filters ?? "");
  o.Avoid   = (o["Avoid / delete"] ?? o.Avoid ?? "");
  o.IsNew   = String(o["IsNew"]).trim().toUpperCase() === "TRUE";
  return o;
}

async function loadSheet(url, kind){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error("HTTP " + res.status);
  const list = parseGviz(await res.text());
  if(list.length && !(kind === "sites" ? ("Site" in list[0] || "Category" in list[0]) : "ID" in list[0] && "Listing / lead" in list[0])) throw new Error("Unexpected Sheet headers");
  return kind === "sites" ? list.map(deriveSite) : list.map(deriveListing);
}

async function loadSheetWithTabs(kind){
  // The active profile can name its own tab (e.g. "WATERLOO LISTINGS"), so one
  // workbook can hold several searches. Falls back to the generic candidates.
  const chosen = "";
  const tabs = chosen ? [chosen, ...(SHEET_TAB_CANDIDATES[kind] || [])] : (SHEET_TAB_CANDIDATES[kind] || [kind]);
  let lastErr;
  for(const tab of tabs){
    try{
      return await loadSheet(sheetUrl(tab), kind);
    }catch(e){
      lastErr = e;
    }
  }
  throw lastErr || new Error(`No ${kind} tab found`);
}

// A row counts as archived if the Sheet says so OR it was archived this session.
function isArchived(r){ return r.Archived === true || archived.has(r.ID); }

const el = id => document.getElementById(id);
function safe(s){return String(s ?? "").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function volClass(r){return r.FitCategory === "core" ? "vol1" : r.FitCategory === "stretch" ? "vol2" : "outsidevol";}
function pillClass(r){return r.FitCategory === "core" ? "core" : r.FitCategory === "stretch" ? "stretch" : "outsidepill";}
function volLabel(r){return r.FitCategory === "core" ? "Core fit" : r.FitCategory === "stretch" ? "Stretch / verify" : "Outside parameters";}
function listingKind(r){
  const manual = asText(r.ListingKind || r["Listing kind"] || r["Listing type"]);
  if(manual) return manual;
  const url = safeUrl(r.URL);
  const hay = compact([r.Status, r.Action, r.Decision, r.RemoveReason, r["What to verify"], r.Source, r.URL]).toLowerCase();
  if(/needs direct|verify url|direct listing url|needs url/.test(hay) || !url) return "Needs direct URL";
  let u;
  try{ u = new URL(url); }catch(e){ return "Needs direct URL"; }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  if(host.includes("kijiji.ca")) return path.includes("/v-") ? "Direct listing" : "Search/source lead";
  if(host.includes("roomies.ca")) return /\/rooms\/\d+/.test(path) ? "Direct listing" : "Search/source lead";
  if(host.includes("zumper.com")){
    if(path.includes("/apartment-buildings/")) return "Building page";
    if(path.includes("/address/")) return "Direct listing";
    return "Search/source lead"; // /apartments-for-rent/<city>/<area>/... are filtered searches, not units
  }
  if(host.includes("apartments.com")) return path.split("/").filter(Boolean).length >= 2 ? "Building page" : "Search/source lead";
  if(host.includes("padmapper.com")) return path.split("/").filter(Boolean).length >= 3 ? "Building page" : "Search/source lead";
  if(host.includes("realtor.ca") || host.includes("rentals.ca")) return path.includes("map") || u.search ? "Search/source lead" : "Direct listing";
  if(host.includes("oiart.org")) return "Official housing page";
  return /search|results|for-rent|room-rental|apartments/i.test(url) ? "Search/source lead" : "Direct listing";
}
function kindClass(r){
  const k = String(r.ListingKind || listingKind(r)).toLowerCase();
  if(k.includes("direct")) return "kind-direct";
  if(k.includes("building") || k.includes("official")) return "kind-building";
  if(k.includes("needs")) return "kind-needs";
  return "kind-source";
}
function searchText(r){return [r["Listing / lead"],r.Neighbourhood,r["Address / locator"],r.Type,r["Why add / note"],r["What to verify"],r.Source,r["Criteria fit"],r.Status,r.Response,r.Decision,r.FriendNotes,r.RemoveReason,r.ListingKind].join(" ").toLowerCase();}

const state={
  under1000:false,parking:false,internet:false,newonly:false,
  notContacted:false,waitingReply:false,viewingBooked:false,goodOption:false,
  needsParking:false,needsInternet:false,needsAddress:false,needsJuly:false,
  sortKey:"ScoreNum",sortDir:-1,view:"active",showUnmapped:false
};
let archived = new Set();
try{ if(!WRITE_URL){const saved=sessionStorage.getItem("hf_session_archived");if(saved)archived=new Set(JSON.parse(saved));} }catch(e){}
function persist(){try{if(!WRITE_URL)sessionStorage.setItem("hf_session_archived",JSON.stringify([...archived]));}catch(e){}}

// KPIs
function renderKPIs(){
  const visible=rows.filter(r=>!isArchived(r));
  const v1=visible.filter(r=>r.FitCategory === "core").length;
  const v2=visible.filter(r=>r.FitCategory === "stretch").length;
  const nw=rows.filter(r=>r.IsNew).length;
  const under=rows.filter(r=>r.UnderTarget).length;
  const easy=rows.filter(r=>r.EasyCommute).length;
  const outside=visible.filter(r=>r.FitCategory === "outside").length;
  const kpis=[["green",visible.length,"Active listings"],["green",v1,"Core fits"],["blue",v2,"Stretch / verify"],
    ["gold",outside,"Outside parameters"],["green",visible.filter(r=>r.UnderTarget).length,"Within budget"],["green",visible.filter(r=>r.EasyCommute).length,"Within commute"]];
  el("kpis").innerHTML=kpis.map(k=>`<div class="kpi ${k[0]}"><div class="num">${k[1]}</div><div class="label">${k[2]}</div></div>`).join("");
}

// Keep the appbar tag + footer counts in sync with the live data (no hard-coded 61).
function updateCounts(){
  const total=rows.length;
  const active=rows.filter(r=>!isArchived(r)).length;
  const tag=el("leadCountTag");
  if(tag) tag.textContent=`${active} active listing${active===1?"":"s"} · scored & mapped`;
  const fc=el("footerCount");
  if(fc) fc.textContent=String(total);
}

// Reset to just the "All" option, then repopulate from the live data.
function populateSelect(id,vals){const s=el(id),previous=s.value;s.length=1;vals.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;s.appendChild(o);});if(vals.includes(previous))s.value=previous;}
function populateFilters(){
  neighbourhoods=uniqSorted(rows.map(r=>r.Neighbourhood));
  sources=uniqSorted(rows.map(r=>r.Source));
  populateSelect("neighbourhood",neighbourhoods);
  populateSelect("source",sources);
}

const hasMap = (typeof L !== "undefined");
let map=null;
if(hasMap){
  map=L.map("map",{scrollWheelZoom:true}).setView([45,-85],4); // neutral start; fits to data + places on load
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
} else {
  const md=document.getElementById("map");
  if(md) md.innerHTML='<div style="padding:24px;font-family:Inter;color:#766b5e">Map library couldn\'t load (offline or blocked). The ranked list, table and filters below all still work. Open in a normal browser with internet to see the map.</div>';
}

function iconFor(r){
  const cls = r==="poi" ? "poi" : volClass(r)+(r.IsNew?" isnew":"");
  const label = r==="poi" ? "★" : safe(rankLabel(r));
  return L.divIcon({className:"",html:`<div class="marker-label ${cls}">${label}</div>`,iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-14]});
}
/* Markers + rings for the user's configured places. POI 1 is primary: it gets
   the 5 km / 10 km rings; every POI gets a star marker. Re-run on config save. */
let poiLayers=[];
function renderPois(){
  if(!hasMap) return;
  poiLayers.forEach(l=>map.removeLayer(l)); poiLayers=[];
  const ps=getPois();
  ps.forEach((p,i)=>{
    const m=L.marker([Number(p.lat),Number(p.lon)],{icon:iconFor("poi"),zIndexOffset:1000})
      .bindPopup(`<h3>${safe(poiName(p,i))}</h3><b>Your place ${i+1}${i===0?" · primary":""}</b><br>Distances and routes measure to here.${i===0?" 5 km and 10 km rings shown.":""}`)
      .addTo(map);
    poiLayers.push(m);
  });
  if(ps.length){
    const p0=ps[0];
    poiLayers.push(
      L.circle([Number(p0.lat),Number(p0.lon)],{radius:5000,color:"#2f6f57",weight:2,fillOpacity:.03}).addTo(map),
      L.circle([Number(p0.lat),Number(p0.lon)],{radius:10000,color:"#315f87",weight:2,fillOpacity:.02}).addTo(map)
    );
  }
}
if(hasMap){
  renderPois();
  // Panning fires moveend repeatedly; coalesce so the cards rebuild once.
  let panTimer=null;
  map.on("moveend zoomend",()=>{
    clearTimeout(panTimer);
    panTimer=setTimeout(()=>{ if(currentFilteredList.length) renderLeadPanel(); }, 140);
  });
}

let markers=[], markerById={}, currentFilteredList=[];
let lastLoadedTab = null;   // which Sheet tab the current rows came from
let selectedListingId = "";
let hasRenderedData = false;
function popup(r){
  return `<h3>${safe(rankLabel(r))}. ${safe(textOr(r["Listing / lead"], "Untitled listing"))}</h3>
  ${popupImage(r)}
  <span class="pill ${pillClass(r)}">${volLabel(r)}</span><span class="pill scorepill ${scoreLevelClass(r)}" title="${safe(scoreBreakdown(r))}">Score ${safe(r.ScoreNum)}</span><span class="pill kindpill ${kindClass(r)}">${safe(r.ListingKind)}</span>${r.IsNew?'<span class="pill newpill">★ new</span>':''}<br>
  <b>Area:</b> ${safe(textOr(r.Neighbourhood))}<br><b>Locator:</b> ${safe(textOr(r["Address / locator"]))}<br>
  <b>Type:</b> ${safe(textOr(r.Type))}<br><b>Rent:</b> ${safe(rentLabel(r))}<br>
  <b>Drive:</b> ${safe(textOr(r["Est drive min"]))}${asText(r["Est drive min"])?" min":""}${r.PoiKmText?` · <b>Distance:</b> ${safe(r.PoiKmText)}`:""} · <b>Parking:</b> ${safe(textOr(r.Parking))}<br>
  <b>Internet/util:</b> ${safe(textOr(r["Internet / utilities"]))}<br>
  <p style="margin:6px 0"><b>Why:</b> ${safe(textOr(r["Why add / note"]))}</p>
  <p style="margin:6px 0"><b>Verify:</b> ${safe(textOr(r["What to verify"]))}</p>
  <div class="links">${linkButton(r.URL, "Listing / search")} ${routeLinksHtml(r)}</div>`;
}
function card(r){
  const arch=isArchived(r);
  const selected = String(selectedListingId) === String(r.ID) ? " selectedcard" : "";
  const action = arch
    ? `<button class="restorebtn" data-restore="${safe(r.ID)}">↩ Restore</button>`
    : r.NeedsId || r.DuplicateID
      ? `<button class="trash disabled" disabled title="A unique ID is required before archiving">🗑</button>`
      : `<button class="trash" data-trash="${safe(r.ID)}" title="Archive to the Sheet (hide from Active)">🗑</button>`;
  const seen = r["Date seen"] ? `seen ${safe(r["Date seen"])}` : "";
  const chk = r["Last checked"] ? ` · checked ${safe(r["Last checked"])}` : "";
  const workflow = [
    ["Status", r.Status || r.Action],
    ["Contact", r.LastContacted || (r.ContactedBool ? "contacted" : "not contacted")],
    ["Response", r.Response],
    ["Viewing", r.ViewingDate || (r.ViewingBookedBool ? "booked" : "")]
  ].filter(x => asText(x[1]));
  const rent = rentLabel(r);
  const near = Number.isFinite(r.KmNearest) ? `${r.KmNearest.toFixed(1)} km → ${safe(r.NearestPoiName)}` : "";
  const drive = Number.isFinite(r.DriveNum) ? `~${safe(r["Est drive min"])} min${near ? ` · ${near}` : ""}` : (near || "distance unknown");
  return `<div class="card${selected}" data-id="${safe(r.ID)}">
  <div class="cardhead"><div class="pills">${r.MarketType==="sale"?'<span class="pill salepill">For sale</span>':''}<span class="pill ${pillClass(r)}">${volLabel(r)}</span><span class="pill scorepill ${scoreLevelClass(r)}" title="${safe(rankTitle(r))}">#${safe(rankLabel(r))} · ${safe(r.ScoreNum)}${r.ScoreComputed && Number.isFinite(r.ScoreSheet) && r.ScoreSheet!==r.ScoreNum?` <span class="sheetcmp">(was ${safe(r.ScoreSheet)})</span>`:""}</span><span class="pill kindpill ${kindClass(r)}">${safe(r.ListingKind)}</span>${r.IsNew?'<span class="pill newpill">★ new</span>':''}${asText(r.DuplicateOf)?`<span class="pill warnpill" title="Marked as duplicate of ${safe(r.DuplicateOf)}">dup of ${safe(r.DuplicateOf)}</span>`:''}${r.NeedsId?'<span class="pill warnpill">Needs ID</span>':''}</div>${action}</div>
  <h3>${safe(textOr(r["Listing / lead"], "Untitled listing"))}</h3>
  ${imageThumb(r)}
  <div class="meta">${safe(textOr(r.Neighbourhood))} · ${safe(textOr(r["Address / locator"]))}</div>
  <div class="rent">${safe(rent)} <span class="meta" style="font-weight:500">· ${drive}</span></div>
  <div class="meta">${safe(textOr(r["Why add / note"]))}</div>
  ${scoreFlags(r)}
  ${workflow.length ? `<div class="workmeta">${workflow.map(([k,v]) => `<span><b>${safe(k)}:</b> ${safe(v)}</span>`).join("")}</div>` : ""}
  ${workflowEditor(r)}
  <div class="meta" style="margin-top:4px;font-size:11.5px">${seen}${chk}</div>
  <div class="links">${linkButton(r.URL, "Listing")} ${linkButton(routeLink(r), "Route", "route", "No route info")}<button class="linkbtn copy" data-copy="${safe(r.ID)}" type="button">Copy inquiry message</button></div>
  </div>`;
}

function selected(value, option){ return asText(value) === option ? " selected" : ""; }
function checked(value){ return truthy(value) ? " checked" : ""; }
function workflowEditor(r){
  const disabled = r.NeedsId || r.DuplicateID ? " disabled" : "";
  const idWarning = r.NeedsId || r.DuplicateID ? `<div class="inlinewarn">${r.DuplicateID?"This ID is repeated. Give each listing a unique ID in the Sheet before saving.":"Add an ID in the Sheet before saving changes for this row."}</div>` : "";
  return `<details class="workflowedit" data-workflow-id="${safe(r.ID)}">
    <summary>Update status</summary>
    ${idWarning}
    <div class="workflowgrid workflowgrid-simple">
      <label>Status
        <select data-field="Status">
          <option value=""></option>
          ${["Message first","Contacted","Waiting reply","Viewing booked","Applied","Good option","Watch","Gone","Not a fit","Scam risk","Archived"].map(v=>`<option value="${safe(v)}"${selected(r.Status || r.Action, v)}>${safe(v)}</option>`).join("")}
        </select>
      </label>
      <label>Friend notes <textarea data-field="FriendNotes" placeholder="Quick shared note">${safe(r.FriendNotes)}</textarea></label>
    </div>
    <div class="links workflowactions">
      <button class="linkbtn copy" data-save-workflow="${safe(r.ID)}" type="button"${disabled}>Save to Sheet</button>
      <button class="linkbtn copy" data-status-quick="${safe(r.ID)}" data-status-value="Waiting reply" type="button"${disabled}>Waiting reply</button>
      <button class="linkbtn copy" data-status-quick="${safe(r.ID)}" data-status-value="Archived" type="button"${disabled}>Archive</button>
    </div>
    <details class="advancededit">
      <summary>Advanced fields</summary>
      <div class="workflowgrid">
      <label>Response
        <select data-field="Response">
          <option value=""></option>
          ${["Waiting","Interested","Viewing offered","No reply","Rejected","Gone","Duplicate","Scam"].map(v=>`<option value="${safe(v)}"${selected(r.Response, v)}>${safe(v)}</option>`).join("")}
        </select>
      </label>
      <label>Decision
        <select data-field="Decision">
          <option value=""></option>
          ${["Good option","Apply","Book viewing","Watch","Cut","Archived","Duplicate","Scam"].map(v=>`<option value="${safe(v)}"${selected(r.Decision, v)}>${safe(v)}</option>`).join("")}
        </select>
      </label>
      <label>Last contacted <input data-field="LastContacted" type="text" placeholder="YYYY-MM-DD" value="${safe(r.LastContacted)}"></label>
      <label>Viewing date <input data-field="ViewingDate" type="text" placeholder="YYYY-MM-DD / time" value="${safe(r.ViewingDate)}"></label>
      <label>Scam risk <input data-field="ScamRisk" type="text" placeholder="low / medium / high" value="${safe(r.ScamRisk)}"></label>
      <label>Duplicate of (ID) <input data-field="DuplicateOf" type="text" placeholder="e.g. A4" value="${safe(r.DuplicateOf)}"></label>
      </div>
      <div class="workflowchecks">
      ${["Contacted","ViewingBooked","ParkingConfirmed","InternetConfirmed","AddressConfirmed","TimingConfirmed"].map(f=>`<label><input data-field="${f}" type="checkbox"${checked(r[f])}> ${safe(f.replace(/([A-Z])/g," $1").trim())}</label>`).join("")}
      </div>
    </details>
  </details>`;
}

// Builds a warm, specific inquiry tailored to each listing: references the
// real address/area, adapts rent vs. for-sale and room vs. whole unit, and
// only asks about the things that are actually still unconfirmed for that row.
function landlordMessage(r){
  const addr = asText(r["Address / locator"]);
  const nb = asText(r.Neighbourhood);
  const goodAddr = addr && !/\barea\b|approx|unknown|\bmall\b/i.test(addr);
  const sale = r.MarketType === "sale";

  if(sale){
    const ref = goodAddr ? `the property at ${addr}` : nb ? `your listing in ${nb}` : "your listing";
    const qs = ["is it still available, and are there any offers registered or a set offer date?"];
    if(r.NeedsAddress || !goodAddr) qs.push("the exact address?");
    const t = asText(r.Availability).toLowerCase();
    if(!t || /tenant|leased/.test(t)) qs.push("what the possession / closing timeline looks like (and whether it's currently tenanted)?");
    qs.push("whether there are any condo/maintenance fees or known issues I should factor in?");
    return `Hi! I'm interested in ${ref}. Could you let me know:\n` + qs.map(q => "• " + q).join("\n") +
      `\n\nI'd love to book a showing at your earliest convenience — thank you!`;
  }

  const hay = compact([r.Type, r["Listing / lead"], r["Criteria fit"]]).toLowerCase();
  const isUnit = /apartment|studio|bachelor|1-?bed|one bed|condo|townhouse|duplex|house(?!hold)|\bunit\b/.test(hay) && !/room in|private room/.test(hay);
  const noun = isUnit ? "place" : "room";
  const ref = goodAddr ? `your listing at ${addr}` : nb ? `your ${nb} ${noun}` : "your rental listing";
  const avail = asText(r.Availability);
  const p=activeProfile();
  const timingKnown = !!ListingRules.stated(avail);
  const timing = p.timing ? `around ${p.timing}` : "in the coming weeks";
  const lease = /^\d+$/.test(p.leaseMonths) ? ` on a ${p.leaseMonths}-month lease` : "";
  const intro = `Hi! I'm interested in ${ref}. I'm looking for ${isUnit ? "a place" : "a private room"}${lease}, ideally moving in ${timing}.`;

  const qs = [];
  qs.push(timingKnown ? "is it still available?" : "is it still available, and what move-in dates work?");
  qs.push("the total monthly cost, including any utilities or fees?");
  if(r.NeedsInternet || !r.HasInternet) qs.push("whether internet is included (and roughly the speed)?");
  if(p.mustHaves.includes("parking") && (r.NeedsParking || !r.HasParking)) qs.push("whether a parking spot is available?");
  if(r.NeedsAddress || !goodAddr) qs.push("the exact address or nearest major intersection?");
  if(!asText(r.Furnishing)) qs.push(`whether the ${noun} is furnished or unfurnished?`);
  if(!isUnit) qs.push("who else lives there, and how many people share the kitchen and bathroom?");

  const body = "If it's still open, could you let me know:\n" + qs.map(q => "• " + q).join("\n");
  const close = "I'd also love to set up a viewing — in person or a quick video walkthrough works for me. Thanks so much!";
  return `${intro}\n\n${body}\n\n${close}`;
}

async function copyLandlordMessage(id){
  const r = rows.find(x => String(x.ID) === String(id));
  if(!r) return;
  const msg = landlordMessage(r);
  try{
    if(!navigator.clipboard) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(msg);
    toast(`Copied inquiry message for ${id}.`);
  }catch(e){
    const ta = document.createElement("textarea");
    ta.value = msg;
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let copied = false;
    try{ copied = document.execCommand("copy"); }catch(err){}
    ta.remove();
    if(copied) toast(`Copied inquiry message for ${id}.`);
    else showCopyFallback(id, msg);
  }
}

function showCopyFallback(id, msg){
  let box = el("copyFallback");
  if(!box){
    box = document.createElement("div");
    box.id = "copyFallback";
    box.className = "copyfallback";
    document.body.appendChild(box);
  }
  box.innerHTML = `<label for="copyFallbackText">Copy message for ${safe(id)}</label>
    <textarea id="copyFallbackText">${safe(msg)}</textarea>
    <div class="links"><button class="linkbtn copy" id="copyFallbackClose" type="button">Close</button></div>`;
  const text = el("copyFallbackText");
  text.focus();
  text.select();
  el("copyFallbackClose").onclick = () => box.remove();
}

function collectWorkflow(id){
  const box = document.querySelector(`[data-workflow-id="${CSS.escape(id)}"]`);
  if(!box) return {};
  const fields = {};
  box.querySelectorAll("[data-field]").forEach(input => {
    const field = input.dataset.field;
    fields[field] = input.type === "checkbox" ? (input.checked ? "TRUE" : "FALSE") : input.value.trim();
  });
  fields.UpdatedAt = new Date().toISOString();
  fields.UpdatedBy = UPDATED_BY;
  return fields;
}

function applyLocalFields(id, fields){
  const r = rows.find(x => String(x.ID) === String(id));
  if(!r) return;
  Object.assign(r, fields);
  deriveListing(r);
}

function updateSelection(id, focusMap=true){
  selectedListingId = String(id || "");
  document.querySelectorAll(".selectedcard").forEach(x=>x.classList.remove("selectedcard"));
  document.querySelectorAll(".selectedrow").forEach(x=>x.classList.remove("selectedrow"));
  if(!selectedListingId) return;
  document.querySelectorAll(`[data-id="${CSS.escape(selectedListingId)}"]`).forEach(x=>x.classList.add("selectedcard"));
  document.querySelectorAll(`tr[data-row-id="${CSS.escape(selectedListingId)}"]`).forEach(x=>x.classList.add("selectedrow"));
  if(focusMap && hasMap){
    const m=markerById[selectedListingId];
    if(m){map.setView(m.getLatLng(),14,{animate:true});m.openPopup();}
  }
}

async function saveWorkflow(id, fields){
  if(pendingIds.has(id)) return;
  const existing = rows.find(x => String(x.ID) === String(id));
  if(existing && (existing.NeedsId || existing.DuplicateID)){
    toast("Give this listing a unique ID in the Sheet before saving changes.");
    return;
  }
  const clean = {};
  Object.keys(fields).forEach(k => {
    if(WRITABLE_FIELDS.includes(k)) clean[k] = fields[k];
  });
  if(clean.Status === "Gone"){
    clean.Archived="TRUE";
    clean.OffMarketSince=asText(existing?.OffMarketSince) || new Date().toISOString().slice(0,10);
  }
  const before=existing ? {...existing} : null;
  const wasLocalArchive=archived.has(id);
  if(clean.Archived != null){
    if(truthy(clean.Archived))archived.add(id);else archived.delete(id);
    persist();
  }
  applyLocalFields(id, clean);
  if(clean.Status === "Archived" || clean.Decision === "Archived") {
    archived.add(id);
    clean.Archived = "TRUE";
    applyLocalFields(id, {Archived:"TRUE"});
    persist();
  }
  render();
  if(!WRITE_URL){
    toast(`Updated ${id} in this browser only. Paste the Apps Script /exec URL into WRITE_URL to save to the Sheet.`);
    return;
  }
  pendingIds.add(id);
  try{
    const saved=await writeFields(id,clean);
    if(!saved && before){
      Object.assign(existing,before);
      if(wasLocalArchive)archived.add(id);else archived.delete(id);
      persist();deriveListing(existing);render();
    }
  }finally{pendingIds.delete(id);}
}
function filtered(){
  const q=el("search").value.trim().toLowerCase();
  const vol=el("volume").value, neigh=el("neighbourhood").value, src=el("source").value;
  const mk=el("market")?el("market").value:"";
  const drive=el("drive").value?Number(el("drive").value):null;
  let list=rows.filter(r=>{
    const isArch=isArchived(r);
    if(state.view==="active" && isArch) return false;
    if(state.view==="archived" && !isArch) return false;
    if(q && !searchText(r).includes(q)) return false;
    if(vol && r.FitCategory !== vol) return false;
    if(mk && r.MarketType!==mk) return false;
    if(neigh && r.Neighbourhood!==neigh) return false;
    if(src && r.Source!==src) return false;
    if(activeProfile().transport==="car" && drive!==null && num(r.DriveNum,999)>drive) return false;
    if(state.under1000 && !r.UnderTarget) return false;
    if(state.parking && !r.HasParking) return false;
    if(state.internet && !r.HasInternet) return false;
    if(state.newonly && !r.IsNew) return false;
    if(state.notContacted && r.ContactedBool) return false;
    if(state.waitingReply && !r.WaitingReply) return false;
    if(state.viewingBooked && !r.ViewingBookedBool) return false;
    if(state.goodOption && !r.GoodOption) return false;
    if(state.needsParking && !r.NeedsParking) return false;
    if(state.needsInternet && !r.NeedsInternet) return false;
    if(state.needsAddress && !r.NeedsAddress) return false;
    if(state.needsJuly && !r.NeedsJuly) return false;
    return true;
  });
  const k=state.sortKey, dir=state.sortDir;
  list.sort((a,b)=>{
    let av=a[k], bv=b[k];
    if(typeof av==="number"||k.endsWith("Num")){av=num(av,1e9);bv=num(bv,1e9);return (av-bv)*dir;}
    return String(av).localeCompare(String(bv))*dir;
  });
  return list;
}

function hasCoords(r){
  return Number.isFinite(num(r.LatNum,NaN)) && Number.isFinite(num(r.LonNum,NaN));
}

function mapVisibleList(){
  if(!hasMap || !map) return currentFilteredList;
  const bounds = map.getBounds();
  return currentFilteredList.filter(r => {
    const lat=num(r.LatNum,NaN), lon=num(r.LonNum,NaN);
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) return state.showUnmapped;
    return bounds.contains([lat,lon]);
  });
}

function bindLeadPanelActions(){
  document.querySelectorAll(".card").forEach(c=>c.addEventListener("click",(ev)=>{
    if(ev.target.closest(".trash")||ev.target.closest(".restorebtn")||ev.target.closest("a")||ev.target.closest("[data-copy]")||ev.target.closest(".workflowedit")) return;
    updateSelection(c.dataset.id, true);
  }));
  document.querySelectorAll("[data-save-workflow]").forEach(b=>b.addEventListener("click",()=>saveWorkflow(b.dataset.saveWorkflow, collectWorkflow(b.dataset.saveWorkflow))));
  document.querySelectorAll("[data-status-quick]").forEach(b=>b.addEventListener("click",()=>saveWorkflow(b.dataset.statusQuick, {
    Status: b.dataset.statusValue,
    Decision: b.dataset.statusValue === "Archived" ? "Archived" : "",
    UpdatedAt: new Date().toISOString(),
    UpdatedBy: UPDATED_BY
  })));
  document.querySelectorAll("[data-trash]").forEach(b=>b.addEventListener("click",()=>{
    const id=b.dataset.trash;
    saveWorkflow(id,{Archived:"TRUE",Status:"Archived",UpdatedAt:new Date().toISOString(),UpdatedBy:UPDATED_BY});
  }));
  document.querySelectorAll("[data-restore]").forEach(b=>b.addEventListener("click",()=>{
    const rid=b.dataset.restore;
    saveWorkflow(rid,{Archived:"FALSE",Status:"",UpdatedAt:new Date().toISOString(),UpdatedBy:UPDATED_BY});
  }));
  document.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",()=>copyLandlordMessage(b.dataset.copy)));
}

function renderLeadPanel(){
  const list = mapVisibleList();
  const total = currentFilteredList.length;
  const unmapped = currentFilteredList.filter(r => !hasCoords(r)).length;
  el("count").textContent = hasMap
    ? `(${list.length} on map · ${total} filtered${unmapped ? ` · ${unmapped} unmapped` : ""})`
    : `(${total} shown)`;
  if(hasMap){
    el("sideSub").textContent = "In the current map area";
  }
  el("cards").innerHTML = list.length
    ? list.map(card).join("")
    : `<div class="emptycard">No mapped leads in this view. Pan or zoom the map, or use the full filtered table below.</div>`;
  bindLeadPanelActions();
}

function render(options={}){
  renderKPIs();
  computeRanks();
  const list=filtered();
  currentFilteredList=list;
  if(selectedListingId && !list.some(r => String(r.ID) === String(selectedListingId))) selectedListingId = "";
  if(hasMap){
    markers.forEach(m=>map.removeLayer(m)); markers=[]; markerById={};
    const bounds=[];
    list.forEach(r=>{
      const lat=num(r.LatNum,NaN), lon=num(r.LonNum,NaN);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)) return;
      const m=L.marker([lat,lon],{icon:iconFor(r)}).bindPopup(popup(r)).addTo(map);
      markers.push(m); markerById[r.ID]=m; bounds.push([lat,lon]);
    });
    if(options.fitMap){getPois().forEach(p=>bounds.push([Number(p.lat),Number(p.lon)]));if(bounds.length)map.fitBounds(bounds,{padding:[40,40],maxZoom:13});}
  }
  renderLeadPanel();
  const ab=el("archivebar");
  if(state.view==="archived"){ const nArch=rows.filter(isArchived).length; ab.classList.add("show"); ab.textContent = WRITE_URL ? `${nArch} archived listing(s). Archive and restore are saved to the shared Sheet; a failed save is undone.` : `${nArch} archived listing(s). Changes are limited to this browser session.`; }
  else ab.classList.remove("show");
  el("tbody").innerHTML=list.map(tableRow).join("");
  document.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",()=>copyLandlordMessage(b.dataset.copy)));
  document.querySelectorAll("[data-expand]").forEach(b=>b.addEventListener("click",(ev)=>{
    ev.stopPropagation();
    const dr=document.querySelector(`tr[data-detail-id="${CSS.escape(b.dataset.expand)}"]`);
    if(!dr) return;
    if(dr.hasAttribute("hidden")){ dr.removeAttribute("hidden"); b.textContent="▾"; b.classList.add("open"); }
    else { dr.setAttribute("hidden",""); b.textContent="▸"; b.classList.remove("open"); }
  }));
  document.querySelectorAll("tr.mainrow[data-row-id]").forEach(tr=>tr.addEventListener("click",(ev)=>{
    if(ev.target.closest("a")||ev.target.closest("button")) return;
    updateSelection(tr.dataset.rowId, true);
  }));
  updateCounts();
}
// sites grouped by category
function renderSites(){
  const order=["For sale — MLS & brokers","For sale — aggregators","Rentals — aggregators","Rentals — rooms & roommates","Social & classifieds","Research & tools",
    "Aggregator","MLS","Roommate","Student","Student/Local","Local landlord","Social","Niche"]; // old categories kept so existing Sheets still group sanely
  const groups={};
  sites.forEach(s=>{(groups[s.Category]=groups[s.Category]||[]).push(s);});
  const cats=Object.keys(groups).sort((a,b)=>{const ia=order.indexOf(a),ib=order.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
  let html="";
  cats.forEach(cat=>{
    html+=`<div class="sitegroup"><h3>${safe(cat)} · ${groups[cat].length}</h3><div class="sitegrid">`;
    html+=groups[cat].map(s=>`<div class="sitecard ${s.IsNew?'new':''}">
      <h3>${safe(textOr(s.Source, "Unnamed source"))}${s.IsNew?' <span class="pill newpill">new</span>':''}</h3>
      <div class="role">${safe(textOr(s["Use for"]))}</div>
      <div class="f"><b>Filters:</b> ${safe(textOr(s.Filters))}</div>
      <div class="f"><b>Keep:</b> ${safe(textOr(s.Keep))}</div>
      <div class="f"><b>Avoid:</b> ${safe(textOr(s.Avoid))}</div>
    </div>`).join("");
    html+=`</div></div>`;
  });
  el("sites").innerHTML=html;
}

/* Typing in Search re-rendered the whole table + map on EVERY keystroke.
   Debounce the free-text/number fields; selects still apply instantly. */
let filterTimer=null;
function renderDebounced(){ clearTimeout(filterTimer); filterTimer=setTimeout(()=>render(), 180); }
["search","drive"].forEach(id=>{const e=el(id);if(e)e.addEventListener("input",renderDebounced);});
["volume","market","neighbourhood","source"].forEach(id=>{const e=el(id);if(e)e.addEventListener("change",render);});
function toggle(id,key){el(id).onclick=()=>{state[key]=!state[key];el(id).classList.toggle("active",state[key]);render();};}
toggle("under1000","under1000");toggle("parking","parking");toggle("internet","internet");toggle("newonly","newonly");
document.querySelectorAll("[data-filter]").forEach(btn => {
  const key = btn.dataset.filter;
  btn.addEventListener("click", () => {
    state[key] = !state[key];
    btn.classList.toggle("active", state[key]);
    render();
  });
});
el("tabActive").onclick=()=>{state.view="active";el("tabActive").classList.add("active");el("tabArchived").classList.remove("active");render();};
el("tabArchived").onclick=()=>{state.view="archived";el("tabArchived").classList.add("active");el("tabActive").classList.remove("active");render();};
const showUnmappedBtn=el("showUnmapped");
if(showUnmappedBtn) showUnmappedBtn.onclick=()=>{state.showUnmapped=!state.showUnmapped;showUnmappedBtn.classList.toggle("active",state.showUnmapped);renderLeadPanel();};
el("reset").onclick=()=>{state.under1000=state.parking=state.internet=state.newonly=false;
  ["notContacted","waitingReply","viewingBooked","goodOption","needsParking","needsInternet","needsAddress","needsJuly"].forEach(k=>state[k]=false);
  ["under1000","parking","internet","newonly"].forEach(id=>el(id).classList.remove("active"));
  document.querySelectorAll("[data-filter]").forEach(btn=>btn.classList.remove("active"));
  ["search","volume","neighbourhood","source","drive"].forEach(id=>el(id).value="");
  state.sortKey="ScoreNum";state.sortDir=-1;render({fitMap:true});};
document.querySelectorAll("th[data-k]").forEach(th=>th.addEventListener("click",()=>{
  const k=th.dataset.k;
  if(state.sortKey===k) state.sortDir*=-1; else {state.sortKey=k;state.sortDir=1;}
  document.querySelectorAll("th .arr").forEach(a=>a.remove());
  const arr=document.createElement("span");arr.className="arr";arr.textContent=state.sortDir>0?" ▼":" ▲";th.appendChild(arr);
  render();
}));

function csvForRows(list){
  const baseCols = [
    "ID","SearchID","FitCategory","Volume","Action","Priority","Listing / lead","Source","ListingKind","Neighbourhood","Address / locator",
    "Type","Rent text","Approx monthly share","Est drive min","Parking","Internet / utilities",
    "Availability","What to verify","URL","Maps link","Score","ScoreAuto","ScoreOverride","Archived","IsNew"
  ];
  const cols = [...baseCols, ...WORKFLOW_COLUMNS, ...IMAGE_COLUMNS];
  return [cols.join(","), ...list.map(r => cols.map(c => csvEscape(c === "ScoreAuto" ? r.ScoreAuto : r[c])).join(","))].join("\n");
}

function downloadCsv(csv, name){
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportFilteredCsv(){
  downloadCsv(csvForRows(filtered()), `homefinder_filtered_${new Date().toISOString().slice(0,10)}.csv`);
  toast("Exported the currently filtered rows.");
}

function exportMasterCsv(){
  downloadCsv(csvForRows(rows), `homefinder_master_${new Date().toISOString().slice(0,10)}.csv`);
  toast(`Exported all ${rows.length} listings (master CSV). Sheet 'Score' is preserved; 'ScoreAuto' holds the computed value.`);
}

const exportBtn=el("exportCsv");
if(exportBtn) exportBtn.onclick=exportFilteredCsv;
const masterBtn=el("downloadMaster");
if(masterBtn) masterBtn.onclick=exportMasterCsv;

/* ===================== My places (POIs) + route selector ================== */
function reDeriveAll(){
  allRows.forEach(deriveListing);
  rows=allRows.filter(r=>ListingRules.matchesSearch(r,activeProfile().searchId));
}

/* Single entry point for anything that changes the active profile (the
   questionnaire, the profile switcher, the places panel): re-score every row
   against the new preferences and repaint the whole board. */
window.applyProfileChange = function(opts){
  // Switching to a profile that reads a different Sheet tab needs a refetch,
  // not just a re-score. Only refetch when the tab actually changed.
  reDeriveAll();
  populateFilters();
  renderSearchHeader();
  renderKPIs();
  renderPois();
  renderRouteSelect();
  renderProfileSwitch();
  if(typeof renderDataTab === "function") renderDataTab();
  render({fitMap: !!(opts && opts.fitMap)});
};

// Global "Route to" selector — all card/table Route buttons follow this.
function renderRouteSelect(){
  const wrap=el("routewrap"), sel=el("routePoi");
  if(!wrap||!sel) return;
  const ps=getPois();
  if(ps.length<1){ wrap.hidden=true; return; }
  wrap.hidden=false;
  sel.innerHTML=ps.map((p,i)=>`<option value="${i}"${i===num(config.routePoi,0)?" selected":""}>${safe(poiName(p,i))}</option>`).join("");
}
const routeSel=el("routePoi");
if(routeSel) routeSel.addEventListener("change",e=>{
  config.routePoi=num(e.target.value,0); saveConfig(); render();
});

function fillPoiPanel(){
  for(let i=0;i<MAX_POIS;i++){
    const row=document.querySelector(`.poirow[data-poi="${i}"]`);
    if(!row) continue;
    const p=(config.pois||[])[i]||{};
    row.querySelector('[data-f="name"]').value = asText(p.name);
    row.querySelector('[data-f="lat"]').value  = p.lat!=null&&p.lat!=="" ? p.lat : "";
    row.querySelector('[data-f="lon"]').value  = p.lon!=null&&p.lon!=="" ? p.lon : "";
  }
  const br=el("budgetRent"), bs=el("budgetSale"), st=el("sheetTab");
  if(br) br.value=config.budgetRent ?? "";
  if(bs) bs.value=num(config.budgetSale,500000);
  if(st) st.value=asText(activeProfile().sheetTab);
}

function savePoiPanel(){
  const pois=[];
  for(let i=0;i<MAX_POIS;i++){
    const row=document.querySelector(`.poirow[data-poi="${i}"]`);
    if(!row) continue;
    const name=row.querySelector('[data-f="name"]').value.trim();
    const lat=parseFloat(row.querySelector('[data-f="lat"]').value);
    const lon=parseFloat(row.querySelector('[data-f="lon"]').value);
    if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180) pois.push({name:name||`Place ${pois.length+1}`,lat,lon});
    else if(name) toast(`"${name}" needs coordinates — use Set on map, or right-click in Google Maps and copy them.`);
  }
  config.pois=pois.slice(0,MAX_POIS);
  config.routePoi=Math.min(num(config.routePoi,0),Math.max(pois.length-1,0));
  const br=el("budgetRent"), bs=el("budgetSale"), st=el("sheetTab");
  if(br)config.budgetRent=br.value.trim()===""?null:parseFloat(br.value)>0?parseFloat(br.value):config.budgetRent;
  if(bs&&parseFloat(bs.value)>0) config.budgetSale=parseFloat(bs.value);
  const tabChanged = st && asText(st.value) !== asText(activeProfile().sheetTab);
  if(st) activeProfile().sheetTab = asText(st.value);
  saveConfig();
  renderPois(); renderRouteSelect();
  if(tabChanged){
    toast(`Loading "${asText(st.value) || "default tab"}" from the Sheet…`);
    init();   // different tab -> refetch rather than just re-score
    return;
  }
  window.applyProfileChange({fitMap:true});
  toast(pois.length?`Saved ${pois.length} place${pois.length===1?"":"s"} — distances, scores and routes updated.`:"Saved. Add at least one place to unlock distances and routes.");
}

let pendingPoiSet=-1; // index of the place awaiting a map click
const poiPanel=el("poiPanel");
const poiBtn=el("poiBtn");
if(poiBtn&&poiPanel){
  poiBtn.addEventListener("click",()=>{
    const opening=poiPanel.hidden;
    poiPanel.hidden=!opening?true:false;
    if(opening) fillPoiPanel();
  });
}
const poiClose=el("poiClose");
if(poiClose) poiClose.addEventListener("click",()=>{poiPanel.hidden=true;pendingPoiSet=-1;});
const poiSave=el("poiSave");
if(poiSave) poiSave.addEventListener("click",()=>{savePoiPanel();});
document.querySelectorAll("[data-setpoi]").forEach(b=>b.addEventListener("click",()=>{
  if(!hasMap){ toast("Map unavailable — paste coordinates manually (right-click in Google Maps → copy)."); return; }
  pendingPoiSet=num(b.dataset.setpoi,0);
  document.getElementById("map").scrollIntoView({behavior:"smooth",block:"center"});
  toast(`Click the map to drop Place ${pendingPoiSet+1} there.`);
}));
if(hasMap){
  map.on("click",e=>{
    if(pendingPoiSet<0) return;
    const row=document.querySelector(`.poirow[data-poi="${pendingPoiSet}"]`);
    if(row){
      row.querySelector('[data-f="lat"]').value=e.latlng.lat.toFixed(5);
      row.querySelector('[data-f="lon"]').value=e.latlng.lng.toFixed(5);
      toast(`Coordinates captured for Place ${pendingPoiSet+1} — name it and hit Save.`);
    }
    pendingPoiSet=-1;
  });
}

/* The workbook now runs off ONE listings tab, so the tab picker was removed.
   profile.sheetTab still exists in the data model (a fork can point separate
   searches at separate tabs) but nothing in this UI sets it. */
function renderDataTab(){ /* no-op: single-tab workbook */ }

function renderSearchHeader(){
  const p=activeProfile(), preset=SEARCH_PRESETS.find(x=>x.id===p.searchId);
  if(el("drive"))el("drive").parentElement.hidden=p.transport!=="car";
  if(el("commuteHeading"))el("commuteHeading").dataset.k=p.transport==="car"?"DriveNum":"KmNearest";
  if(el("searchHeading")) el("searchHeading").textContent=p.name;
  if(el("searchSummary")) el("searchSummary").textContent=[p.city || preset?.city, Number.isFinite(budgetFor("rent")) ? `${fmtMoney(budgetFor("rent"))}/month` : "Budget pending", p.timing || "Timing pending"].filter(Boolean).join(" · ");
  if(el("briefStatus")){
    el("briefStatus").hidden=!!p.tuned && !p.briefPending;
    el("briefStatus").textContent="Complete the search quiz to set your preferences and fit categories.";
  }
  if(el("sourceShortcuts")){
    const city=p.city || preset?.city;
    el("sourceShortcuts").innerHTML=city ? [
      ["Facebook",`https://www.facebook.com/marketplace/search/?query=${encodeURIComponent("room apartment rent "+city)}`],
      ["Kijiji",`https://www.kijiji.ca/b-canada/${encodeURIComponent("rent "+city)}/k0l0`],
      ["Roomies",`https://www.roomies.ca/rooms/${city.toLowerCase().replace(/,? ontario/,"-on").replace(/[^a-z0-9-]/g,"-")}`]
    ].map(([name,url])=>linkButton(url,name)).join("") : "";
  }
}
window.renderSearchHeader=renderSearchHeader;
const shareBtn=el("shareSearch");
if(shareBtn) shareBtn.onclick=async()=>{
  const u=new URL(location.href);u.search="";u.hash="";
  if(activeProfile().searchId)u.searchParams.set("search",activeProfile().searchId);
  try{await navigator.clipboard.writeText(u.href);toast("Search link copied. Saved Sheet profiles are available from Choose profile.");}
  catch{prompt("Search link",u.href);}
};

/* ---- profile switcher (scoring presets, e.g. "Waterloo" vs "London") ---- */
function renderProfileSwitch(){
  const sel = el("profileSwitch");
  if(!sel) return;
  sel.innerHTML = HF.list.map(p => `<option value="${safe(p.id)}"${p.id===HF.activeId?" selected":""}>${safe(p.name)}</option>`).join("")
    + `<option value="__new">+ New search…</option>`;
}
const profSel = el("profileSwitch");
if(profSel) profSel.addEventListener("change", e => {
  const v = e.target.value;
  if(v === "__new"){
    renderProfileSwitch();
    if(window.openQuestionnaire) window.openQuestionnaire(true);
    return;
  }
  setActiveProfile(v);
  window.applyProfileChange({fitMap:true});
  toast(`Switched to "${activeProfile().name}" — everything re-scored.`);
});
renderProfileSwitch();
renderRouteSelect();
renderSearchHeader();
const printBtn=el("printView");
if(printBtn) printBtn.onclick=()=>window.print();

/* ============================ live data orchestration ====================== */
function setStatus(msg, kind){
  const s=el("dataStatus"); if(!s) return;
  if(!msg){ s.style.display="none"; return; }
  const palette={ok:["#e2efe8","#2f6f57"],warn:["#fbf0dc","#8c551b"],err:["#fbe4de","#9d3e2f"],"":["#e0eaf4","#315f87"]};
  const c=palette[kind||""]||palette[""];
  s.style.cssText=`display:block;margin:0 0 16px;padding:11px 15px;border-radius:12px;font:500 13px Inter,sans-serif;background:${c[0]};color:${c[1]};border:1px solid rgba(0,0,0,.06);`;
  s.textContent=msg;
}

function setSourceBadge(label, kind, ts){
  const b=el("sourceBadge"); if(!b) return;
  b.classList.remove("warn","err");
  if(kind==="warn") b.classList.add("warn");
  if(kind==="err") b.classList.add("err");
  const stamp = ts ? new Date(ts).toLocaleString() : new Date().toLocaleString();
  b.textContent = `${label} · refreshed ${stamp}`;
}

let toastTimer=null;
function toast(msg){
  let t=el("toast");
  if(!t){ t=document.createElement("div"); t.id="toast";
    t.style.cssText="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:90vw;background:#2b2620;color:#fff;padding:12px 18px;border-radius:12px;font:500 13.5px Inter,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:3000;opacity:0;transition:opacity .2s;";
    document.body.appendChild(t);
  }
  t.textContent=msg; t.style.opacity="1";
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>{t.style.opacity="0";},6500);
}

async function writeCell(id, field, value){
  return writeFields(id, {[field]: value});
}

async function writeFields(id, fields){
  if(!WRITE_URL) return;
  writePending++;
  loadVersion++;
  try{
    const payload = WRITE_TOKEN ? {id,fields,token:WRITE_TOKEN} : {id,fields};
    const res = await fetch(WRITE_URL,{method:"POST",body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    const text = await res.text();
    let data = {};
    try{ data = JSON.parse(text); }catch(e){}
    if(!res.ok || data.ok !== true || !data.written) throw new Error(data.error || "The endpoint did not confirm a save");
    const missed=Object.keys(fields).filter(k=>!Object.hasOwn(data.written,k));
    if(missed.length) throw new Error(`Fields not saved: ${missed.join(", ")}`);
    if(fields.Archived != null){archived.delete(id);persist();}
    const row=allRows.find(r=>String(r.ID)===String(id));
    if(row){Object.assign(row,data.written);deriveListing(row);}
    toast(`Saved ${id} to the Sheet.`);
    setTimeout(()=>init(), 900);
    return true;
  }catch(e){
    toast(`Couldn't save ${id} (${e.message}). The change was undone so this view stays aligned with the Sheet.`);
    return false;
  }finally{writePending--;}
}

function applyData(d){
  const incoming=(d && d.rows) || [],ids=new Map();
  incoming.forEach(r=>{const id=asText(r.ID);if(id)ids.set(id,(ids.get(id)||0)+1);});
  allRows = incoming.map(r=>deriveListing({...r,DuplicateID:ids.get(asText(r.ID))>1}));
  reDeriveAll();
  sites = (d && d.sites) || [];
  const shouldFitMap = !hasRenderedData;
  renderSearchHeader();
  renderKPIs(); populateFilters(); renderSites();
  if(typeof renderDataTab === "function") renderDataTab();
  render({fitMap: shouldFitMap});
  hasRenderedData = true;
}
function cacheSave(){ try{ localStorage.setItem(`hf_cache_${SHEET_ID}`, JSON.stringify({rows:allRows,sites,ts:Date.now()})); }catch(e){} }
function cacheLoad(){ try{ const c=JSON.parse(localStorage.getItem(`hf_cache_${SHEET_ID}`)); if(c && Array.isArray(c.rows)) return c; }catch(e){} return null; }
async function loadRepoCsvFallback(){
  const [r,s]=await Promise.all([
    loadCsv(CSV_FALLBACKS.listings,"listings"),
    loadCsv(CSV_FALLBACKS.sites,"sites")
  ]);
  return {rows:r,sites:s};
}

async function init(){
  const version=++loadVersion;
  if(SHEET_ID==="PASTE_SHEET_ID_HERE"){
    const cached=cacheLoad();
    if(cached){ applyData(cached); setSourceBadge("Cached data","warn",cached.ts); setStatus(`No Sheet ID set yet — showing a cached copy from ${new Date(cached.ts).toLocaleString()}. Paste your SHEET_ID in index.html to go live.`,"warn"); }
    else {
      try{
        const csv=await loadRepoCsvFallback();
        applyData(csv); setSourceBadge("Seed CSV fallback","warn");
        setStatus("No Sheet ID configured yet — showing the repo CSV seed data.","warn");
      }catch(e){
        applyData({rows:[],sites:[]}); setSourceBadge("No data","err"); setStatus("No Sheet ID configured yet and CSV fallback could not load. Open index.html through a local/static server, not directly as a file.","err");
      }
    }
    return;
  }
  setStatus("Loading the latest data from the Google Sheet…","");
  setSourceBadge("Loading Sheet","warn");
  try{
    const [r,s]=await Promise.all([loadSheetWithTabs("listings"), loadSheetWithTabs("sites")]);
    if(version!==loadVersion || writePending) return;
    lastLoadedTab = (typeof profileSheetTab === "function") ? profileSheetTab("listings") : "";
    applyData({rows:r,sites:s}); cacheSave();
    setSourceBadge("Live Sheet","ok");
    setStatus(`Live — ${r.length} listings loaded from ${lastLoadedTab ? `"${lastLoadedTab}"` : "the Sheet"} at ${new Date().toLocaleTimeString()}.`,"ok");
    setTimeout(()=>setStatus("",""),4000);
  }catch(e){
    if(version!==loadVersion || writePending) return;
    const cached=cacheLoad();
    if(cached){applyData(cached);setSourceBadge("Cached Sheet","warn",cached.ts);setStatus(`Sheet unavailable. Showing your last loaded data from ${new Date(cached.ts).toLocaleString()}.`,"warn");return;}
    try{
      const csv=await loadRepoCsvFallback();
      applyData(csv); setSourceBadge("Seed CSV fallback","warn");
      setStatus(`Couldn't reach the Sheet (${e.message}). Showing the repo CSV fallback included with the site.`,"warn");
    }catch(csvError){
      const cached=cacheLoad();
      if(cached){ applyData(cached); setSourceBadge("Cached data","warn",cached.ts); setStatus(`Couldn't reach the Sheet (${e.message}) or repo CSV (${csvError.message}). Showing the last cached copy from ${new Date(cached.ts).toLocaleString()}.`,"warn"); }
      else { applyData({rows:[],sites:[]}); setSourceBadge("No data","err"); setStatus(`Couldn't load the Sheet (${e.message}), repo CSV (${csvError.message}), or a cached copy. Check Sheet sharing and that the CSV files are in the repo root.`,"err"); }
    }
  }
}

const refreshBtn=el("refresh");
if(refreshBtn) refreshBtn.onclick=()=>init();
init();
// Auto-refresh, but never mid-edit: an open status editor, an active form field,
// or the copy-fallback box would otherwise get wiped by a re-render every 60s.
function isEditing(){
  if(writePending) return true;
  if(document.querySelector(".workflowedit[open]")) return true;
  if(el("copyFallback")) return true;
  if(document.getElementById("quiz") && !document.getElementById("quiz").hidden) return true;
  const a=document.activeElement;
  return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}
// Also skip the poll while the tab is in the background: a hidden tab that
// keeps refetching and re-rendering is the main way this page bogs a machine
// down over a long session.
setInterval(()=>{ if(!isEditing() && !document.hidden) init(); }, 60000);

/* ============================================================================
   OPTIONAL TRUE WRITE-BACK MODULE
   ----------------------------------------------------------------------------
   This static GitHub Pages app reads from the Sheet directly. To let card edits
   write back to the Sheet too, deploy apps-script/OIART_WRITEBACK.gs as a bound
   Apps Script web app, then paste its /exec URL into WRITE_URL above.

   The script only accepts allowlisted workflow fields, adds UpdatedAt/UpdatedBy,
   and includes setupOiartRentalSheet() to add missing columns + friendly sheet
   formatting (frozen header, filters, readable widths).
   ========================================================================== */

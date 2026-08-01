/* ============================================================================
   questionnaire.js — "Tune my search" modal
   ----------------------------------------------------------------------------
   These are the questions a good agent would ask before recommending anything.
   Each answer feeds the active profile (profile.js), which re-weights the
   scoring engine — so the ranking genuinely changes when you re-tune.
   Loaded after app.js; talks to it only through window.applyProfileChange().
   ========================================================================== */
(function(){
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let draft = null, step = 0;
  const STEPS = ["Search", "Budget", "Commute", "Must-haves", "Priorities", "Timing"];

  const MUST_HAVES = [
    ["parking", "Parking spot", "🅿️"],
    ["internet", "Internet / utilities included", "📶"],
    ["laundry", "Laundry", "🧺"],
    ["privateBath", "Private bathroom", "🛁"],
    ["separateEntrance", "Separate entrance", "🚪"],
    ["pets", "Pet-friendly", "🐾"],
    ["furnished", "Furnished", "🛋️"],
    ["outdoor", "Outdoor space", "🌳"]
  ];
  const DEAL_BREAKERS = [
    ["noParking", "No parking at all"],
    ["overBudget", "Over my budget"],
    ["longCommute", "Beyond my commute limit"],
    ["sharedBedroom", "Shared bedroom"],
    ["noAddress", "Won't give an exact address"],
    ["tenanted", "Currently tenanted (for sale)"]
  ];
  const PRIORITIES = [
    ["location", "Commute & location", "How close it sits to your places"],
    ["cost", "Price", "Rent or purchase price vs your budget"],
    ["privacy", "Space & privacy", "Whole place vs a room; property type"],
    ["parking", "Parking", "Having somewhere to put a car"],
    ["internet", "Internet & utilities", "Included vs billed on top"],
    ["lease", "Timing", "Move-in date / possession lining up"],
    ["trust", "Listing trust", "Real address, photos, no scam signals"]
  ];
  const SCALE = ["", "Don't care", "Minor", "Normal", "Important", "Critical"];

  function radios(field, opts){
    return `<div class="qopts">` + opts.map(([v, label, sub]) => `
      <label class="qopt${draft[field] === v ? " on" : ""}">
        <input type="radio" name="${field}" value="${esc(v)}"${draft[field] === v ? " checked" : ""}>
        <span class="qoptmain">${esc(label)}</span>${sub ? `<span class="qoptsub">${esc(sub)}</span>` : ""}
      </label>`).join("") + `</div>`;
  }
  function checks(field, opts){
    return `<div class="qopts qgrid">` + opts.map(o => {
      const [v, label, icon] = o;
      const on = (draft[field] || []).includes(v);
      return `<label class="qopt${on ? " on" : ""}">
        <input type="checkbox" name="${field}" value="${esc(v)}"${on ? " checked" : ""}>
        <span class="qoptmain">${icon ? esc(icon) + " " : ""}${esc(label)}</span>
      </label>`;
    }).join("") + `</div>`;
  }

  function stepHtml(){
    const p = draft;
    if(step === 0) return `
      <h4>What are you looking for?</h4>
      <label class="qlabel" for="qname">Name this search</label>
      <input id="qname" class="qinput" value="${esc(p.name)}" placeholder="e.g. Waterloo · co-op term">
      <p class="qhint">Keep separate searches (one per city or scenario) and switch between them from the header — each keeps its own places, budget and weightings.</p>
      <h4>Renting or buying?</h4>
      ${radios("market", [["rent","Renting","Leases, rooms, apartments"],["sale","Buying","Homes for sale / MLS"],["both","Both","Show everything"]])}
      <h4>Who's moving in?</h4>
      ${radios("household", [["solo","Just me"],["couple","Me + partner"],["roommates","With roommates"],["family","Family"]])}
      <p class="qhint">Couples and families get scored down on room-only listings; solo and roommate searches don't.</p>`;

    if(step === 1) return `
      <h4>What's your budget?</h4>
      <div class="qtwo">
        <div><label class="qlabel" for="qbr">Rent per month</label><input id="qbr" class="qinput" type="number" min="1" value="${esc(p.budgetRent)}"></div>
        <div><label class="qlabel" for="qbs">Purchase price</label><input id="qbs" class="qinput" type="number" min="1" value="${esc(p.budgetSale)}"></div>
      </div>
      <p class="qhint">Everything is scored as a % of this, so the same engine handles a $900 room and a $700k house.</p>
      <h4>How firm is that number?</h4>
      ${radios("budgetFirm", [[true,"Hard ceiling","Over-budget listings drop sharply"],[false,"I could stretch","Gentler curve for the right place"]])}`;

    if(step === 2) return `
      <h4>How will you get around?</h4>
      ${radios("transport", [["car","Car","Parking matters"],["transit","Transit","Nearer is better"],["active","Walk / bike","Must be close"],["mixed","Mix"]])}
      <h4>Longest one-way commute you'd accept?</h4>
      <div class="qrangewrap"><input id="qmax" class="qrange" type="range" min="5" max="75" step="5" value="${esc(p.maxCommute)}"><output id="qmaxout">${esc(p.maxCommute)} min</output></div>
      <p class="qhint">Distance bands scale to this, so "close" means the right thing in a small town or a big city.</p>
      <h4>How often do you make that trip?</h4>
      ${radios("commuteFreq", [["daily","Most days","Commute weighted up"],["weekly","A few times a week"],["occasional","Occasionally","Commute weighted down"]])}
      <p class="qhint">Set the actual places you're measuring to with <b>📍 My places</b> in the header — up to three.</p>`;

    if(step === 3) return `
      <h4>Which of these do you actually need?</h4>
      ${checks("mustHaves", MUST_HAVES)}
      <p class="qhint">Must-haves become "essential" criteria: when a listing never mentions one, its score is capped and flagged rather than quietly inflated.</p>
      <h4>What would make you walk away instantly?</h4>
      ${checks("dealBreakers", DEAL_BREAKERS)}
      <p class="qhint">A stated deal-breaker hard-caps a listing at 45 and shows a red ✕ chip — it can never rank near the top.</p>`;

    if(step === 4) return `
      <h4>How much does each of these matter?</h4>
      <p class="qhint">This is the ranking dial. Weights re-normalize to 100 points, so pushing one up genuinely pulls the others down.</p>
      <div class="qsliders">${PRIORITIES.map(([k, label, sub]) => `
        <div class="qslider">
          <div class="qsltop"><b>${esc(label)}</b><span class="qslval" data-for="${k}">${SCALE[p.priorities[k]] || "Normal"}</span></div>
          <input class="qrange" type="range" min="1" max="5" step="1" data-pri="${k}" value="${esc(p.priorities[k])}">
          <span class="qoptsub">${esc(sub)}</span>
        </div>`).join("")}</div>`;

    return `
      <h4>When do you need to move?</h4>
      <input id="qtiming" class="qinput" value="${esc(p.timing)}" placeholder="e.g. July 2026, or 'flexible'">
      <p class="qhint">Name a month and listings stating it score full timing points.</p>
      <h4>How cautious are you about listings?</h4>
      ${radios("verifiedOnly", [[false,"Open to private landlords & classifieds","Marketplace, Kijiji, FSBO"],[true,"Prefer verified / agented listings","Listing trust weighted much higher"]])}
      <div class="qsummary" id="qsummary"></div>`;
  }

  function summaryHtml(){
    const w = weightsFor(draft.market === "sale" ? "sale" : "rent", draft);
    const top = Object.entries(w).sort((a,b) => b[1]-a[1]);
    return `<b>Your scoring mix</b>
      <div class="qbars">${top.map(([k, v]) => {
        const label = (PRIORITIES.find(x => x[0] === k) || [k, k])[1];
        return `<div class="qbar"><span>${esc(label)}</span><i style="width:${v}%"></i><em>${v}</em></div>`;
      }).join("")}</div>
      <p class="qhint">Must-haves: ${draft.mustHaves.length ? draft.mustHaves.map(m => esc((MUST_HAVES.find(x=>x[0]===m)||[m,m])[1])).join(", ") : "none"} ·
      Deal-breakers: ${draft.dealBreakers.length ? draft.dealBreakers.map(d => esc((DEAL_BREAKERS.find(x=>x[0]===d)||[d,d])[1])).join(", ") : "none"}</p>`;
  }

  function paint(){
    $("qsteps").innerHTML = STEPS.map((s, i) =>
      `<span class="qstep${i === step ? " on" : ""}${i < step ? " done" : ""}">${esc(s)}</span>`).join("");
    $("qbody").innerHTML = stepHtml();
    $("qback").disabled = step === 0;
    $("qnext").textContent = step === STEPS.length - 1 ? "Save & re-score" : "Next";
    if(step === STEPS.length - 1 && $("qsummary")) $("qsummary").innerHTML = summaryHtml();
    bindStep();
  }

  function bindStep(){
    const body = $("qbody");
    body.querySelectorAll('input[type="radio"]').forEach(inp => inp.addEventListener("change", () => {
      let v = inp.value;
      if(v === "true") v = true; else if(v === "false") v = false;
      draft[inp.name] = v;
      body.querySelectorAll(`input[name="${inp.name}"]`).forEach(o => o.closest(".qopt").classList.toggle("on", o.checked));
    }));
    body.querySelectorAll('input[type="checkbox"]').forEach(inp => inp.addEventListener("change", () => {
      const set = new Set(draft[inp.name] || []);
      inp.checked ? set.add(inp.value) : set.delete(inp.value);
      draft[inp.name] = [...set];
      inp.closest(".qopt").classList.toggle("on", inp.checked);
    }));
    const mx = $("qmax");
    if(mx) mx.addEventListener("input", () => { draft.maxCommute = +mx.value; $("qmaxout").textContent = mx.value + " min"; });
    body.querySelectorAll("[data-pri]").forEach(sl => sl.addEventListener("input", () => {
      draft.priorities[sl.dataset.pri] = +sl.value;
      const out = body.querySelector(`.qslval[data-for="${sl.dataset.pri}"]`);
      if(out) out.textContent = SCALE[+sl.value];
    }));
  }

  function collectStep(){
    if($("qname")) draft.name = $("qname").value.trim() || draft.name;
    if($("qbr")) draft.budgetRent = Math.max(1, +$("qbr").value || draft.budgetRent);
    if($("qbs")) draft.budgetSale = Math.max(1, +$("qbs").value || draft.budgetSale);
    if($("qtiming")) draft.timing = $("qtiming").value.trim();
  }

  function open(){
    draft = JSON.parse(JSON.stringify(activeProfile()));
    step = 0;
    $("quiz").hidden = false;
    document.body.style.overflow = "hidden";
    paint();
  }
  function close(){
    $("quiz").hidden = true;
    document.body.style.overflow = "";
  }
  function finish(){
    collectStep();
    draft.tuned = true;
    upsertProfile(draft);
    close();
    if(window.applyProfileChange) window.applyProfileChange({});
    if(window.toast) toast(`"${draft.name}" tuned — all listings re-scored to your priorities.`);
  }

  document.addEventListener("DOMContentLoaded", init);
  if(document.readyState !== "loading") init();
  let inited = false;
  function init(){
    if(inited || !$("quiz")) return;
    inited = true;
    $("qopen").addEventListener("click", open);
    $("qclose").addEventListener("click", close);
    $("quizback").addEventListener("click", close);
    $("qback").addEventListener("click", () => { collectStep(); step = Math.max(0, step - 1); paint(); });
    $("qnext").addEventListener("click", () => {
      collectStep();
      if(step === STEPS.length - 1) return finish();
      step++; paint();
    });
    document.addEventListener("keydown", e => { if(e.key === "Escape" && !$("quiz").hidden) close(); });
    // First-time nudge: pulse the button until the search has been tuned once.
    if(!isTuned()) $("qopen").classList.add("nudge");
    window.openQuestionnaire = open;
  }
})();

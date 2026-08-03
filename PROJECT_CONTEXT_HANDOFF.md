# Home Finder — Project Context & Handoff

*Paste this whole file into a new chat to bring an assistant fully up to speed. Last updated: 2026-08-03.*

---

## 1. What this project is

A free, no-server web app that turns a Google Sheet into a **scored, mapped, filterable housing search board**. Originally built for one student's rental search near a school in London ON, then generalized so anyone can point it at their own places, budget and priorities.

| Thing | Value |
|---|---|
| Live site | `https://azharmoolla.github.io/oiart-rental-finder/` |
| Repo | `https://github.com/AzharMoolla/oiart-rental-finder` (branch `main`, deploys via GitHub Pages from root) |
| Google Sheet ("Rental Search") | ID `1ddciH2oqLcQxEePD-AEoO4GCqI8XztRcC1YTMJxZm9s` |
| Sheet tabs | **`OIART BASED LISTINGS`** (the one and only listings tab) and **`Sites`** |
| Owner | Azhar (GitHub `AzharMoolla`) |

**Architecture — three moving parts, nothing to host:**

```
GOOGLE SHEET  ──reads live via gviz──►  STATIC PAGE (GitHub Pages)
(the database)                          scores • maps • filters • tracks
      ▲                                        │
      └──── optional write-back ───────────────┘
            (Apps Script /exec)
                                   CSV files in the repo = offline fallback
```

---

## 2. Files in the repo

| File | Role |
|---|---|
| `index.html` | Page structure: appbar, hero, toolbar/filters, map + leads panel, sortable table, sites panel, footer, **questionnaire modal**, **My places panel** |
| `app.js` | ~1500 lines. Sheet loading, scoring engine, rendering, map, filters, write-back, CSV export, places/POI logic |
| `profile.js` | **Loads BEFORE app.js.** Saved search profiles: places, budgets, must-haves, deal-breakers, priority weights. localStorage only |
| `questionnaire.js` | Loads after app.js. The 6-step "Tune my search" modal |
| `enhance.js` | Motion layer (scroll reveals, KPI count-ups). Pure progressive enhancement — safe to fail |
| `styles.css` | Pantone palette + Apple-style liquid glass design system |
| `oiart_listings.csv` | Offline fallback for listings |
| `oiart_sites.csv` | Offline fallback for the Sites playbook (generic rental + for-sale sources) |
| `apps-script/OIART_WRITEBACK.gs` | Apps Script web app for write-back |
| `waterloo_listings_2026-08-02.csv` | The 19 Waterloo leads (with header) |
| `waterloo_append_norows_header.csv` | Same, headerless — used for `IMPORTDATA` into the Sheet |
| `SCORING_METHODOLOGY.md` | Shareable v2 scoring doc (slightly behind the code — see §4) |
| `Build_Your_Own_Search_Tracker_Guide.md` + `.pdf` | Guide for replicating the tool for any search |

Load order in `index.html` matters: **`profile.js` → `app.js` → `questionnaire.js` → `enhance.js`**.

---

## 3. The Sheet

- **One listings tab now.** A separate `WATERLOO LISTINGS` tab existed briefly and was **merged into the main tab and deleted** (2026-08-03) at the user's request. Everything lives in `OIART BASED LISTINGS`.
- **123 rows**: 104 original London/OIART rows (2–105) + **19 Waterloo rows** (106–124, IDs `WAT-L-01xx`).
- **52 columns**, exact order:
  `ID, Volume, Action, Priority, Listing / lead, Source, ListingKind, Neighbourhood, Address / locator, Type, Rent text, Approx monthly share, Est drive min, Km straight-line, Parking, Internet / utilities, Availability, Furnishing, Criteria fit, Why add / note, What to verify, Date seen, Last checked, URL, Maps link, Score, Latitude, Longitude, Archived, IsNew, Status, Contacted, LastContacted, Response, ViewingBooked, ViewingDate, Decision, RemoveReason, FriendNotes, ParkingConfirmed, InternetConfirmed, AddressConfirmed, JulyConfirmed, ScamRisk, UpdatedAt, UpdatedBy, CanonicalKey, DuplicateOf, ImageURL, ImageAlt, ImageSource, ImageChecked`
- Sharing is **Anyone with the link → Viewer**, which is what lets the public page read it.
- External-data access is **enabled** on this spreadsheet (needed for `IMPORTDATA`).

**Data policy the user cares about:** never convert unknown → false. Leave blanks blank. A guessed "Yes" fakes a high score; a blank becomes an honest flag.

---

## 4. The scoring engine (this is the heart of it)

Lives in `computeScore()` in `app.js`. **Four principles:**

1. **Reward what's actually stated** — graduated points, not all-or-nothing.
2. **Never fake-penalize a blank** — an unstated field is **N/A and excluded from the maths**, then surfaced as an orange "Confirm ___" chip. Score = `earned ÷ max-of-KNOWN-components × 100`.
3. **Missing must-haves cap the score** — 1 missing → 79, 2 → 69, 3+ → 59. A stated deal-breaker **hard-caps at 45** with a red ✕ chip.
4. **Traffic-light it** — green = essentials known, amber = 1 must-have unknown, red = 2+ or a deal-breaker.

**Components** (base maxima, rescaled by the user's 1–5 priority sliders then re-normalized to 100):
`location 30 · cost 20 · parking 10 · internet 5 · privacy 15 · lease 10 · trust 10`

**Market-aware:** rows are `rent` or `sale` (from a `Market` column or inferred from wording). For-sale rows **drop the internet component entirely** (scored out of 95), swap privacy → property-type fit (detached > semi/town > condo), and swap lease → possession/closing (tenanted = stated negative).

**Location scoring is generic and adaptive:**
- Distance is a **priority-weighted blend** across the user's places (weights 0.55/0.30/0.15, Place 1 counts most), blended with the sheet's drive estimate when both exist.
- Bands are **relative to the profile's max-commute and travel mode** (car 34 / transit 17 / walk-bike 11 / mixed 26 km/h), so "close" adapts to any city.
- N/A only when neither distance nor drive time is known.

⚠️ `SCORING_METHODOLOGY.md` documents **v2** and predates the multi-place weighting and sale-market rules. Refresh it if you touch scoring.

---

## 5. Profiles + questionnaire

`profile.js` stores **named search profiles** in localStorage (`hf_profiles`), each with:
`pois[] (≤3 places), budgetRent, budgetSale, budgetFirm, transport, maxCommute, commuteFreq, mustHaves[], dealBreakers[], priorities{}, verifiedOnly, timing, market, household, sheetTab`

- Switcher lives in the appbar. Profiles are for **scoring presets** (e.g. a car-free Waterloo weighting vs a car-based London one).
- **"✨ Tune my search"** opens a 6-step modal (Search / Budget / Commute / Must-haves / Priorities / Timing) with a live preview of the resulting weight mix. Answers feed the weights directly.
- **"📍 My places"** sets up to 3 anchors (name + lat/lon, or click-on-map). Place 1 is primary and gets the 5 km / 10 km rings. A global "Route to" selector drives every Route button.
- `profile.sheetTab` still exists in the data model but **no UI sets it** now that the workbook is single-tab. `normalizeProfile()` auto-clears any stored pointer at the retired `WATERLOO LISTINGS` tab.

---

## 6. Write-back (Apps Script)

`apps-script/OIART_WRITEBACK.gs`, deployed as a web app; `/exec` URL is in `app.js` as `WRITE_URL`.

- **v2 is header-driven**: any column in the header is writable **except** a protected core set (ID, listing facts, Score, lat/long, URL…). New workflow columns work with **no redeploy**.
- `doGet` returns a **version stamp** (`2026-06-01-v2`) plus live writable/protected column lists — use it to verify what's actually deployed.
- Optional `WRITE_TOKEN` (currently `""` = open). The user decided an open endpoint is acceptable for a small trusted team.
- ⚠️ It only writes to a tab named `Listings`/`listings` (`LISTINGS_SHEET_NAME`). **The real tab is `OIART BASED LISTINGS`** — so write-back likely needs that constant updated to work now. *Untested since the consolidation.*
- **It cannot append rows** — it updates existing rows matched by `ID`.

---

## 7. Hard-won gotchas (these cost real time — don't relearn them)

**Google Sheets / gviz**
- `gviz` **silently returns the FIRST sheet** when the requested `sheet=` name doesn't exist. It won't error — you'll just get the wrong data.
- The grid must already have rows allocated. Appending at row N+1 when the sheet is exactly N rows fails with *"The range you specified exceeds the sheet size."* Fix: select N rows → **Insert → Rows → Insert N rows below**.
- To bulk-load data: put `=IMPORTDATA("<raw GitHub CSV URL>")` in the first empty cell, let it spill, then **select the exact range → Ctrl+C → Ctrl+Shift+V** to freeze to values.
- **Never use `Ctrl+Shift+End`** to select before paste-values — it grabs a huge range, freezes the renderer, and collapsed 12 rows into 1. Use the Name Box with an explicit range (`A106:AZ124`).
- Google's file-picker `<input type=file>` is in a **cross-origin iframe** — browser-automation file upload can't reach it. Use `IMPORTDATA` instead.
- Screenshot coordinates drift between captures (the Sheets UI re-renders at different zooms). **Always re-screenshot immediately before clicking**, or use keyboard/Name Box navigation.

**Apps Script**
- `curl -L` **drops the POST body** on the 302 redirect → `411 Length Required`. Use `fetch` (browsers handle it).
- A deployed web app runs a **frozen snapshot**. Editing the script changes nothing until you **Deploy → Manage deployments → Edit → New version**.

**CSS / app**
- A class rule that sets `display` **outranks the browser's `[hidden]` rule**. `.quiz{display:flex}` made the modal render on every load, empty. Fixed with `.quiz[hidden]{display:none!important}` — same trap applies to `.routewrap`/`.poipanel`.
- **`backdrop-filter` is the #1 perf killer here.** It must only go on a few large, stable surfaces. Putting it on repeating elements (~100 cards, 47 site cards, every button, sticky `th`) made the page crawl. Blurred elements now: **15**. Full render: **4–13 ms**.
- Debounces exist and matter: Search input (180 ms), Leaflet `moveend` (140 ms), and the 60 s auto-refresh skips when the tab is hidden or the questionnaire is open.

**Sources**
- **Kijiji**: a removed ad **redirects** to a `/b-` browse URL (often with `adRemoved=`). Don't trust text matching — live listing pages contain phrases like "no longer available" in boilerplate. This produced ~13 false positives once. Check the **redirect + page title** instead.
- **Facebook** can't be reached from the in-app browser; the user's login also failed there. Would need the Claude-in-Chrome extension against their real Chrome.
- Northdale/Waterloo student condos mostly **aren't on aggregators** — they surface on the building sites, Kijiji and Facebook.

---

## 8. Where the Waterloo search stands

Target: **September 2026**, University of Waterloo grad student (MEDI, anchor building **EV3**), car-free, **~$1,150–1,400/person**, private bathroom strongly preferred, ≤2 roommates, 8-month lease ideal / 12 acceptable. Full research lives in the user's `waterloo_housing_research_project.md` (32 researched buildings + scoring model).

**19 leads in the Sheet.** Top of the board:

| Score | ID | Lead |
|---|---|---|
| **96** | `WAT-L-0117` | **The Block, 275 Larch St Bldg E** — private **ensuite**, 2bed/2bath, **one** roommate, $1,250 *negotiable* + ~$25 hydro, WiFi incl, furnished, Sept 1. Existing leaseholder (PhD researcher going abroad). **Best match found.** Caveats: it's a **1-year sublet** (get written landlord consent / ask about assignment) and the ad doesn't mention a gym despite the research claiming one |
| 93 | `WAT-L-0101` | Sage VI 2-bed **B1A — the only 2-bed left** for Sept |
| 88 | `WAT-L-0102` | Sage II 2-bed — last unit |
| 86 | `WAT-L-0112` | ICON — ensuite confirmed, leasing Sept, pricing gated behind a form. Contact (844) 321-2200 / iconfrontdesk@craftpropertygroup.com |
| 84 | `WAT-L-0113` | Society145 — **only two layouts exist, both 2-occupant** (Berkley 546 sqft / Carlisle 605 sqft). No 3-bed/ensuite product, so the research's "premium ensuite room" assumption is wrong. Same operator as ICON |

**Key market finding:** Sage's Sept 2026 **2-bedroom inventory is nearly gone** — Sage V, Sage X, Sage Platinum II and all six Ivy Towns I 2-beds are **sold out**; only Sage VI B1A and Sage II remain. Ivy Towns III is the only property with no sold-out flags.

**Corrections made to the research file:** gyms **confirmed** at Sage VI/II/X/Platinum I+II; **no gym** at Ivy Towns I/II/III or Sage III. Utilities portfolio-wide = gas + water + unlimited fibre included, **hydro separate**. The Carrick's assumed 2-bed/2-bath at $2,695 is **not currently listed** (only 1-beds at $2,495 + a townhouse).

**Still unscanned:** 88 Hickory, ONE28, K2, U Plus, Keatsway, MyRez, Vogue, Barrel Yards, Circa 1877, and **Rez-One (Hespeler/Blair/Elora)** — the strongest ensuite plays, but `rezone.ca` is an unrelated company and the real leasing site was never found.

---

## 9. Open items / suggested next steps

1. **Fix write-back for the renamed tab** — set `LISTINGS_SHEET_NAME = "OIART BASED LISTINGS"` in the Apps Script and redeploy a new version. Untested since consolidation.
2. **Archive the 104 London/OIART rows** if that search is done, so the board shows only the active hunt. They're all still `Archived = FALSE`.
3. **Set up the Waterloo profile** in the browser: 📍 My places → EV3 `43.4685, -80.5390`, budget **1400**, walk/bike, 20 min. Then `WAT-L-0117` ranks #1.
4. **Refresh `SCORING_METHODOLOGY.md`** to v3 (multi-place weighting + sale-market rules).
5. **Finish the Waterloo scan** (buildings listed in §8) and re-run the Kijiji sweep — it's the highest-yield source for existing-roommate rooms.
6. **A Toronto short-stay search was started and cancelled** (elderly relative, 2-month furnished stay, mosque/halal proximity, pet-free, ≤3 roommates, <$1,400/mo). He found accommodation — **no work needed**, but the brief is a good example if a similar one comes up.

---

## 10. Working preferences observed

- Wants **honest data over optimistic data** — unknowns stay unknown and get flagged.
- Wants **direct listing URLs**, not search pages. Search/source pages belong in the `Sites` tab.
- **Archive, don't delete** — keep the record and the reasoning.
- Likes the tool staying **generic/shareable** (the guide PDF is aimed at other people reusing it).
- Prefers work to be **verified in-browser before being called done**, and mistakes stated plainly rather than smoothed over.

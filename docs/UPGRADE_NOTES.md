# Friends' Rental Finder: October 2026 Update

This remains a static, free-hosted tool for friends. No framework, paid service,
hosted database, analytics, or scheduled scraping was added.

## Searches and Profiles

- `SearchID` partitions the common inventory: `london-oiart`, `waterloo`, and
  `trent-peterborough`. Add it to a new row so the correct search can see it.
- A named profile defines preferences within that inventory. Several friends can
  rank the same listings differently without overwriting one another's scores.
- The entry chooser offers saved profiles or the 18-question brief. Profiles
  persist on the device. The `Search Profiles` tab supports sharing across devices
  after deploying the updated Apps Script.
- The Trent preset has a real Symons Campus map anchor, but no assumed budget.
  November 2026 is provisional. The friend's actual brief is still required.
- Dates are compared by month/year, not by exact day. Free-text accessibility,
  destinations, neighbourhood preferences, and other dealbreakers remain a human
  brief. They are not magically geocoded or interpreted. Adjust actual map anchors
  in My places, and use the optional factual Sheet columns when verified.

## Google Sheet Changes

The connector now works: native edits and read-back succeeded in the existing
workbook. The main tab is now `Listings`, with its unchanged gid `280478168`.
Renaming it from `OIART BASED LISTINGS` restored the already-deployed workflow
endpoint, which expected the original tab name. The site uses the gid, not a
fragile display-name lookup.

- Added `SearchID`, `OffMarketSince`, `TimingConfirmed`, `Roommates`,
  `ParkingSpaces`, `Laundry`, `PetsAllowed`, `Accessible`, and `LeaseMonths`.
  Blank facts mean unknown, not false. Header notes explain these fields.
- Added `Search Profiles`, gid `197601017`. Its initial provisional Trent entry
  was subsequently removed at the user's request. OIART is the only automatic
  profile; the other cities remain inventory/quiz templates, not saved people.
  Untouched old starter profiles are pruned on load; real saved/edited profiles
  are preserved. The chooser searches by name/city, deduplicates IDs, and renders
  40 results at a time. Storage failures are reported rather than called saved.
- Backed up all original 123 listing rows and native cell data locally before
  deletion: `.local-tools/backups/rental-sheet-before-cleanup-2026-10-17.json`.
  This backup is ignored by Git and is not deployed.
- Deleted only eight rows with dated, explicit off-market evidence older than
  30 days: A3, A4, A7, E8, E3, E4, B6, WAT-L-0110.
- Newly archived eight dead links, retaining their data: A8, C2, K1, K3, K4,
  K5, WAT-L-0117, WAT-L-0118. `OffMarketSince` starts on discovery, not a guessed
  historical date. Final inventory: 115 rows. Reachable does not mean available;
  blocked/login-only pages were not declared dead.
- Refreshed CSV snapshots from the cleaned Sheet. Future cleanup snapshots:
  `node scripts/snapshot-sheet.mjs`.

## One Required Deployment Step

The live Apps Script still reports `2026-06-01-v2`. Workflow access has been
restored and verified: a live POST updated only A1's audit attribution/timestamp,
and the connector read back that exact value. No rental facts were changed by
this connectivity test. Local v3 source adds shared profile saving, duplicate-ID
protection, and fixes ImageChecked date handling. GitHub Pages deployment does
not deploy Google Apps Script.

1. Open the Sheet, then **Extensions > Apps Script**.
2. Replace all of **Code.gs** with `apps-script/OIART_WRITEBACK.gs`. Save.
3. Choose **Deploy > Manage deployments**.
4. Edit the existing web-app deployment with its pencil button.
5. Under **Version**, choose **New version**, then **Deploy**.
6. Keep the existing `/exec` URL. Opening it should show version
   `2026-10-17-v3`, capabilities `workflow` and `saveProfile`, and no `headerError`.
7. Refresh the site. Try a status change and verify that exact row in the Sheet;
   then save a test profile to the Sheet and choose it from another device.

Until this is done, reading the Sheet, ordinary workflow saves, and saving
profiles locally work. Failed listing edits are rolled back, not silently
presented as synced. The shared-save
checkbox stays disabled when the endpoint does not advertise the capability.

## Marketplace Tools

Reviewed and installed locally, not bundled into the public website:

- Original candidate (now superseded): https://github.com/maxaiassistant77/facebook-marketplace-mcp
  at commit `8808be39731d8f24472f541aecf0317d4304dfcf`, MIT. Windows-compatible
  Node stdio server, three read tools, no Facebook password/cookie requirement.
  Its original dependency audit had eight findings; updated dependencies in the
  ignored checkout, rebuilt, and verified zero production audit findings.
- `includeImages: true` and listing details expose photo URLs when the source
  supplies them. The actual Peterborough test returned **zero listings**. The
  server is installed and speaks MCP, but usable Canadian coverage is not proven.
  Do not invent listings, prices, images, or claims that a listing was verified.
- Follow-up diagnostic: six broad searches (Toronto sofa/bicycle, New York car,
  Phoenix go kart, London apartment, Peterborough room) all returned no data.
  Toronto geocoding was correct, but Facebook returned zero raw feed edges;
  a 24-result New York phone query and its next page were also empty. Two
  existing direct item IDs returned URL-only details with no photos. Treat
  this adapter as **not operational for data retrieval**, not as evidence that
  inventory is empty. It has no login support; use the authenticated browser
  fallback rather than adding cookies or paying for a proxy to guess around it.
- Official Microsoft Playwright MCP is installed as `housing-browser`, using
  Edge and its own ignored browser profile. Its tools and local-site navigation
  were tested. Login to Facebook in that browser when needed; it does not inherit
  the old in-app browser session. Never commit cookies or browser-profile files.
- Both servers were registered with `codex mcp add` and confirmed enabled. A new
  Codex session may be needed to expose their tools. Files live in `.local-tools/`;
  moving/removing this checkout will require updating their configured paths.
- Smoke checks: `node scripts/check-marketplace.mjs` and
  `node scripts/check-browser-mcp.mjs`.
- Capture direct item URLs, `SearchID`, factual fields, and available `ImageURL`,
  `ImageSource`, `ImageChecked`. Deduplicate by source item ID / canonical URL,
  not title alone. An expired image falls back without hiding the listing.
  Never treat an image or a search-result thumbnail as proof of availability.

## Checks and Remaining Limits

| Check | State | Evidence |
|---|---|---|
| Pure evidence rules | PASS | `node --test tests/*.test.cjs` |
| Quiz, saved local profile, scoped inventory, categories | PASS | `node tests/browser.mjs`, isolated test data |
| Selected row, preserved map zoom, narrow mobile layout | PASS | Browser assertions and desktop/mobile screenshots |
| Failed-write rollback and successful-write acknowledgement | PASS | Browser tests with mocked endpoint responses |
| Native Sheet mutation and cleanup backup | PASS | Connector read-back and ignored backup |
| Local Marketplace/browser MCP protocol | PASS | Tool discovery and actual smoke queries |
| Fresh Canadian Marketplace results/images | PASS | Replacement Secondhand MCP returned Peterborough rooms, descriptions, and photo URLs; availability still unverified |
| Live endpoint write and connector read-back | PASS | Browser-origin A1 audit-only POST succeeded; native read confirmed it |
| Live shared profile saves and v3 protections | BLOCKED | Old deployed version; owner redeployment required |
| Full manual accessibility / screen-reader review | NOT RUN | Keyboard focus and mobile checks do not replace it |

Preview: `http://127.0.0.1:4186/?search=trent-peterborough` while the local server
is running. Browser QA writes screenshots only to ignored `.local-tools/qa/`.

## User-Authorized Three-Month Cleanup

On October 18, 2026 the user explicitly expanded cleanup to listings added over
three calendar months ago, regardless of whether removal from the market could
be independently confirmed. The cutoff for this pass was July 18, 2026.

- Deleted 97 May/June entries; retained 18 August 2 entries. No listing facts
  were changed into guessed availability claims.
- Eleven Date seen cells had been overwritten with verification notes. Their
  original added dates were recovered from the initial CSV commit
  `475cbf213d05f79c59281390aa65c4effb800d8a`, matching ID, title, and source before
  using the date. Last checked was not substituted for an added date.
- A complete pre-deletion native/value backup, date evidence, and deletion plan
  are in ignored `.local-tools/backups/rental-sheet-before-age-cleanup-2026-10-18.json`.
- The Sheet was reread immediately before the single deletion batch, the 18
  remaining IDs were verified, and CSV fallbacks were regenerated afterward.
- This was an executed cleanup pass, not an unattended scheduled deletion job.

## Working Marketplace Replacement

- Installed https://github.com/jlsookiki/secondhand-mcp, version 0.7.1, commit
  `d7385b59d7e3691ab8609425330134b956314661`, MIT. Read its complete README (the
  only tracked Markdown documentation), license, configuration, requirements,
  limitations, and relevant search/transport/detail source before running it.
- Its public HTML fallback handles the empty GraphQL feed that broke the first
  adapter. No login was needed for the tested public searches or listing pages.
  This does not guarantee that every Facebook page is accessible without login.
- Registered as `secondhand-facebook` with `MARKETPLACES=facebook`; removed the
  nonworking old server registration. The old source remains ignored for reference.
  `housing-browser` remains the logged-in browser fallback.
- Installed with dependency scripts disabled. Updated SDK, Puppeteer, Undici,
  and vulnerable transitive dependencies in the ignored checkout. Production
  dependency audit: zero findings. The updated build and all 674 upstream tests
  passed. No paid cloud service, login-cookie extraction, or browser profile
  import was needed.
- Real MCP smoke tests returned Toronto sofas, New York bicycles, and three
  Peterborough room leads, all with image URLs. Detail calls returned actual
  descriptions and full-size photo URLs for all three Peterborough leads.
- Examples: item `4563452213800605` describes a furnished private room near
  Jackson Park/PRHC; `2368598113885134` is called private in the result title but
  its description says shared. This is why titles alone must never establish
  private-bedroom fit. These diagnostic leads were NOT inserted into the Sheet
  as verified matches; the friend's brief and actual availability remain pending.
- Retest: `node scripts/check-secondhand.mjs --broad`. Full diagnostic results
  stay ignored in `.local-tools/secondhand-check-results.json` and
  `.local-tools/peterborough-mcp-details.json`. New Codex sessions may be needed
  to load the registered tools.

## Peterborough Inventory Sweep - October 18, 2026

- Added 159 reviewed leads to `Listings!A20:BI178`: Facebook 46, Roomies 35,
  Kijiji 34, Zumper 25 and Babcock & Robinson 19. Preserved all 18 existing rows.
- Captured 158 photo URLs. Browser-loaded a representative image from each
  source with nonzero image dimensions. Facebook/CDN URLs can expire.
- Removed five clear cross-posts and one housing-wanted post from the import;
  two uncertain duplicate pairs remain explicitly flagged rather than deleted.
- Individual room/unit offers and 25 building pages have distinct ListingKind
  values. Building advertised ranges remain in Rent text, with no fabricated
  exact-unit monthly price. Whole-unit rents are not divided by guessed roommates.
- Placeholder/conflicting prices, semi-private/shared bedrooms, weekly billing,
  stale dates, unverified map pins and nonmatching photos are flagged. No
  availability was landlord-confirmed; no messages or applications were sent.
- Rentals.ca browser access showed a challenge; did not bypass it. Other sites
  provided direct pages. This is a broad initial sweep, not an exhaustive feed.
- Read-only collectors: `scripts/collect-peterborough-facebook.mjs` (Secondhand
  adapter) and `scripts/collect-peterborough-web.mjs` (ordinary Edge pages).
  Raw evidence and manual review facts stay in ignored `.local-tools/`.
  `scripts/prepare-peterborough-import.mjs` builds a review file only and requires
  those local evidence/review files; it never writes the live Sheet itself.

## Permanent Shared Profiles - October 18, 2026

- Quiz Save profile now targets Search Profiles automatically. Local storage is
  a backup, not the only intended database. Existing device-only profiles migrate
  when selected; My places and route preference saves use the same path.
- Choose profile reloads shared answers on entry. Sheet copies supersede stale
  local copies unless this device has pending edits. The active selection stays
  device-local. Search, pagination and large-profile support are preserved.
- Pending saves survive reloads and retry on Choose profile. No success toast is
  shown without the endpoint's matching ID and revision acknowledgement.
- Apps Script v4 lists profiles, upserts stable IDs under the document lock,
  grows the tab as needed and rejects conflicting revisions. Identical retries
  are idempotent. Conflicts keep local edits and offer an explicit Sheet-version
  reload, never an automatic overwrite.
- PASS: 22 unit tests, existing browser regressions and a three-isolated-device
  integration test for create, update, conflict recovery and offline retries.
  All QA profile writes are intercepted; no fake profiles enter the real Sheet.
- BLOCKED for live writes until owner redeployment: live /exec still reported
  `2026-06-01-v2` during this release. Prepared source is `2026-10-18-v4`.
  Deploy > Manage deployments > Edit > New version > Deploy retains the URL.
  Publishing GitHub Pages alone cannot activate this backend change.

## Additional Sources and Filters - October 18, 2026

- Added Listing site options grouped by canonical platform with inventory counts,
  plus an independent Home type filter. Raw source attribution is unchanged;
  rooms are classified from the listing type, not guessed from the platform.
- Added 67 reviewed leads at `Listings!A179:BI245`: Kijiji 31,
  Places4Students 20, Visture 7, Bick Properties 4, Zumper 2, Valiant 2,
  Meant4Rent 1. Peterborough now has 226 leads across 10 sources.
  Captured 62 additional photo URLs. Existing 177 Sheet rows were compared
  before/after and remain unchanged, including human workflow states.
- Eight clear cross-posts and six contradictory/future-intake ads were excluded.
  One possible same-household Kijiji pair remains flagged. Building ranges,
  ambiguous price bases, occupancy conflicts, 55+ ads, and group-only whole
  homes are labelled rather than assigned optimistic per-person costs.
- Public Places4Students property/sublet details worked without login. Roomies
  page 3 had no more rooms. Rentals.ca, REALTOR.ca and RentCafe presented
  access blocks/challenges; no bypass was attempted. Crestview Burnham Place
  showed waitlists, and an apparent current Meant4Rent entry contained a 2016
  occupancy date, so neither was imported as a fresh vacancy. Source coverage
  is a broad sweep, not an exhaustive or landlord-confirmed availability feed.
- Fixed a live-reader data-integrity issue: gviz inferred LeaseMonths as numeric
  after new rows and silently omitted 22 older text terms. Known tabs and the
  snapshot script now use Google's native CSV export, preserving mixed cell
  types. The source Sheet was not rewritten. Exported numeric display precision
  may round map coordinates at sub-centimetre scale; source values remain intact.
- Shared `csv-data.js` handles quoted/multiline fields, escaped quotes, blanks,
  BOMs and truncated-response rejection. The offline CSV was regenerated from
  the Sheet, not from an inferred query table.
- Checks: 21 unit tests; browser workflow/profile regression; campus/area/image
  checks; per-site and per-home-type filtering, map/selection persistence,
  desktop/mobile layouts and forced offline fallback in `tests/source-browser.mjs`.
  Representative images from each photo-bearing source loaded successfully.
- Read-only evidence and reviewed proposal stay ignored in `.local-tools/`;
  `scripts/prepare-peterborough-extra.mjs` builds a proposal only, never writes.

## Campus Pins and Area Preferences

- Offline catalogue: 179 official Ontario campus points, 57 marked main, plus
  OIART. The official locator is the source, not hand-estimated school coordinates:
  https://www.ontario.ca/my-career-journey/find-postsecondary-institutions/
- `node scripts/refresh-campuses.mjs` refreshes the public dataset. Only public
  campus fields are retained; the locator's public read token is not shipped.
- Quiz / My places campus selection writes actual coordinates into the profile.
  Primary place controls distance scoring and 5/10 km rings. Route destination
  selection is independent and does not silently move the scoring anchor.
- Custom destinations need both coordinates, or a map-picked pin in My places.
  Renaming a place is not address geocoding. No typed address is transmitted to
  a new geocoding provider.
- Preferred and avoided neighbourhoods are separate comma-separated fields.
  Suggestions come from the selected inventory's Neighbourhood values. Matching
  is accent-insensitive, word-bounded and limited to those labels, not geographic
  polygons, aliases or guessed addresses. Missing/custom names show no-match
  feedback. Legacy free-form area notes remain notes, not guessed preferences.
- A preferred match adds up to 3 base location points within the existing cap.
  Avoided matches fail the brief and land outside parameters. City-only labels
  cannot prove a neighbourhood is acceptable; an avoidance request marks those
  rows unconfirmed until the neighbourhood is known.
- Visible toggle borders/selection states and aria-pressed, fixed-size quiz
  checkboxes, manual-coordinate validation and narrow-screen layout checked.
- Tests: `node --test tests/*.test.cjs`, `node tests/browser.mjs`,
  `node tests/campus-browser.mjs`. The last test also checks the live inventory
  counts, campus routing, anchor preservation, areas and representative images.
- Shared profile saving remains dependent on owner redeployment of Apps Script
  v3. This release does not claim that a GitHub push updates Apps Script.

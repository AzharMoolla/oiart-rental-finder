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

- Candidate chosen: https://github.com/maxaiassistant77/facebook-marketplace-mcp
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
| Fresh Canadian Marketplace results/images | BLOCKED | Live query returned no results; login/browser search needed |
| Live endpoint write and connector read-back | PASS | Browser-origin A1 audit-only POST succeeded; native read confirmed it |
| Live shared profile saves and v3 protections | BLOCKED | Old deployed version; owner redeployment required |
| Full manual accessibility / screen-reader review | NOT RUN | Keyboard focus and mobile checks do not replace it |

Preview: `http://127.0.0.1:4186/?search=trent-peterborough` while the local server
is running. Browser QA writes screenshots only to ignored `.local-tools/qa/`.

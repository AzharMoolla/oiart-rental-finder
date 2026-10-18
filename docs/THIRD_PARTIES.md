# Data and External Services

| Data / service | Purpose and location |
|---|---|
| Google Sheets | Shared listing facts, workflow states and named preference profiles (quiz answers, budgets, campus pins and weights). Profile saves target the Search Profiles tab after the v4 Apps Script deployment; browser storage retains a backup and unsent changes. Known listing tabs use native CSV export; custom named tabs retain the legacy query reader. |
| Apps Script | Receives explicit workflow/profile saves; no automatic outbound contact |
| GitHub Pages | Static site and CSV fallback snapshots; no custom backend |
| Browser localStorage | Saved profiles, last successful Sheet cache, local UI state |
| OpenStreetMap tiles | Map requests reveal the viewed map area to the tile provider |
| Leaflet / existing font and icon CDNs | Existing client libraries, icons and fonts |
| Listing image hosts | Browser loads only available image URLs; hosts receive normal image requests |
| Secondhand MCP | Local read-only Facebook public search and listing details; Facebook only enabled, no credentials or paid proxy configured by this project; not part of the hosted app |
| Playwright MCP | Local browser automation with a separate ignored login profile |
| Ontario official postsecondary locator | Public campus names, addresses and pins, downloaded into a static catalogue at build time. No runtime geocoder, location tracking, Mapbox account or token is added to the site. |

This is a friends' tool, but an unlisted GitHub Pages URL is not authentication.
Keep passwords, personal documents, private contact details, and sensitive notes
out of published Sheet tabs, CSV snapshots, and shared profiles. No analytics,
ads, payment services, or new cloud account was introduced. Local backups and
browser sessions are ignored, not uploaded. No new automatic retention policy or
periodic scraper was enabled.

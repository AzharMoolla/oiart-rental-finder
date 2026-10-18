# Project Notes

This is a small friends' rental search, not a commercial product. Preserve the
plain static architecture, Google Sheet ownership, and optional Apps Script
write-back. Do not introduce a framework or new hosted service without need.

Apply the user's Agent Project Playbook guidance in proportion to this scope.
The supplied original is at
`C:/Users/azhar/OneDrive/Desktop/AI Day Trade Bot/AGENT_PROJECT_PLAYBOOK.md`.
Release evidence and unresolved live deployment checks are in
`docs/UPGRADE_NOTES.md`; data flows are in `docs/THIRD_PARTIES.md`.

- Never mix inventory across SearchID groups or overwrite human-entered facts
  with a preference score. Derive scores in the browser.
- Blanks mean unknown. Do not invent availability, costs, images, or confirmations.
- Do not delete a listing just because its link blocks automation. Require dated
  off-market evidence older than 30 days and take a backup before removal.
- Do not commit `.local-tools/`, browser sessions, credentials, or test captures.
- GitHub pushes do not redeploy Apps Script. Confirm the live endpoint version
  before claiming Sheet edits or shared-profile saves work.
- Regression checks: `node --test tests/*.test.cjs` and `node tests/browser.mjs`.
  The browser test requires the ignored local Playwright installation and preview
  server at port 4186. Test data must not be written into the real Sheet.

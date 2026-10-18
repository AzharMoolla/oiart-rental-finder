# Rental Fit Scoring (v3: Profile-Based)

Updated October 18, 2026. This replaces the fixed OIART v2 thresholds. The original
rubric remains in `docs/SCORING_V2_ARCHIVE.md` for historical reference.

## Inventory Is Not Preference

`SearchID` chooses a city's inventory. A named profile chooses how to rank that
inventory. Original `Volume`, `Priority`, and Sheet `Score` remain intact for
reference, but do not decide the live fit category. The browser recalculates fit.

## Weights

Base maxima: commute 30, cost 20, parking 10, internet 5, privacy 15, timing 10,
trust 10. Each 1-5 priority multiplies its base by 0.35, 0.65, 1, 1.45, or 1.95.
Parking/internet/privacy must-haves multiply their relevant weights by 1.35;
couple/family privacy by 1.25. Parking is discounted for transit (0.5) or active
travel (0.25), and multiplied by 1.15 for a daily driver. Daily commute weight
gets 1.1; occasional commute 0.7. Existing verified-only preference multiplies
trust by 1.6. Largest-remainder rounding makes the final weights total exactly
100. Sale rows omit internet before normalization.

## Evidence and Relative Fit

- **Commute:** use the profile's destinations and travel mode. Distance bands
  relative to the target radius are <=0.4: 30, <=0.7: 26, <=1: 20, <=1.35: 12,
  otherwise 8. Radius is minutes/60 times a rough speed (car 34, transit 17,
  active 11, mixed 26 km/h), minimum 0.8 km. Multiple destinations use the existing
  priority-weighted distance. A relevant Sheet drive estimate can be blended
  with distance only for a driving profile. This is a **straight-line heuristic,
  not verified transit/walking/driving routing**. Route links open actual maps.
- **Cost:** compare the per-person monthly price with the preferred budget, or
  maximum if no preference is entered. Fractions <=0.9, 1, 1.15, 1.3, 1.5, 1.8,
  and above use the graduated 20/18, 19/16, 14, 11, 8, 5, 3 point ladder. The
  paired first two values mean all-in / not proven all-in. A firm budget uses
  10, 6, 4, 2, 1 above target. Over-budget dealbreakers compare with the actual
  **maximum**, not the preferred number. No profile budget means unknown cost fit.
  A firm maximum also gates the category: a known over-budget price is outside
  the brief even when the other components score very well.
- **Parking:** explicit no/street-only 0; extra-fee 7; stated/confirmed available
  10; silence unknown. Negative wording beats an optimistic confirmation checkbox.
- **Internet:** included 5, partial utilities 3, internet extra 2. Unknown stays
  unknown. Utility inclusion alone must not manufacture a Wi-Fi confirmation.
- **Privacy:** shared bedroom 5; vague type 8; room 11; private bedroom 12;
  private unit/own bath 15. A room in a shared apartment is not a private apartment.
  Room-only fit is reduced for couples/families. Explicit housing-type and
  private-bedroom/bathroom requirements also gate the category.
- **Timing:** match the profile month/year, not a hard-coded July search. Match
  10, stated other month 4, flexible/immediate 7, other stated date 9, unknown N/A.
  JulyConfirmed cannot confirm November. An explicit mismatch with the requested
  month/year is outside the brief unless temporary options were accepted. Exact
  days, latest-date windows, and lease-length tradeoffs still require human review.
- **Trust:** start at 10; high risk -6 / medium -3; search/unverified source -3;
  no exact address -2; no usable photo URL -1. Floor at zero. A photo is not proof
  of authenticity, availability, or permission to reuse it.

Each component is scaled to its profile weight. Unknown components are removed
from numerator and denominator, not scored zero:

`raw = round(100 * sum(known earned points) / sum(known maxima))`

## Guardrails and Categories

Location and cost are always essential. Selected must-haves make additional
facts essential. Unknown essential details cap fit at 79 (one), 69 (two), 59
(three or more), with amber/red indicators. Explicit failed requirements or a
selected dealbreaker cap computed fit at 45. Negatives are not unknowns.

- **Core fit:** completed profile, score >=80, no unknown essential, no failed
  requirement, and no dealbreaker.
- **Stretch / verify:** score >=65 without a failed requirement; can include a
  promising lead missing an essential detail, or an unfinished profile.
- **Outside parameters:** score <65, or an explicit failed requirement/dealbreaker.
  Retained for comparison, not recommended. This category does not archive it.

The optional factual columns (Roommates, ParkingSpaces, Laundry, PetsAllowed,
Accessible) let required details affect fit without guessing from a title.
Move-in facts belong in Availability even when TimingConfirmed is checked.
Manual ScoreOverride still wins the number; it does not erase failed brief
checks or turn an incomplete profile into Core. Ranking defaults to descending
profile score; original manual priority is a tie-breaker.

The quiz saves all 18 answers. Free-text areas, lifestyle, unusual dealbreakers,
exact dates, accessibility specifics, and lease preferences remain a human brief,
not automatic natural-language rules. Add factual details and review them.

## Workflow Is Separate

Status, contact, viewings, notes, and Archived are shared Sheet workflow fields;
none should change the physical facts of a property. Trash means archive, not
permanent deletion. Missing/broken links or images do not prove a place is dead.
Delete only with dated off-market evidence older than 30 days and a backup.

## Regression Checks

`node --test tests/*.test.cjs`

`node tests/browser.mjs`

Live calculation is in app.js, evidence parsing in listing-rules.js, and profile
weighting in profile.js. A real deployment must also pass the live Sheet save
checks in docs/UPGRADE_NOTES.md; mocked tests do not establish live sync.

---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/components/landing/Landing.tsx","src/components/landing/Logbook.tsx","src/lib/un/landing/copy.ts"]
---

# Landing page (/)

Scope: the public landing page, `src/app/page.tsx` with `src/components/landing/Landing.tsx`, `Logbook.tsx` and the words in `src/lib/un/landing/copy.ts` (English and Arabic). Mode: Persuade. World: Prism's established Field Ledger (Spectral, Geist, JetBrains Mono, pine, dot grid); it is not replaced.

Audience and job: three kinds of visitor reach one page. Visitors and judges want to see it work with no account. People in a government entity want to sign in. Regulators and reviewers want the evidence. Action: pick the right entry within seconds. Proof: the tamper-with-the-logbook demo and the measured results (every figure checked by tests/un-landing.test.ts). Constraints: keep the brand look, the interactive logbook, every fact and number, Arabic and right-to-left; phone first.

Chosen structure: "Choose your door" (picked by the user on the decision page).

Unresolved: none. Per-visitor analytics events keep their names; a `cta_signin` event is added.

## Direction contract

THESIS: A visitor should never have to guess which button is theirs. The page opens on three labelled doors, not one button with a footer link, and refuses the one-hero-button-plus-hidden-sign-in arrangement.

OWN-WORLD: Prism's paper dot grid and ruled hairlines. The demo door is a pine (lit-deep) field with paper-coloured text; the other doors are card-tone panels with a full hairline border. Spectral for headlines and door titles, Geist for body, JetBrains Mono only for hashes and counts. Six chained seal dots, linked by a rule, mark the logbook. No icons, no eyebrow labels, no gradients.

STORY: The visitor learns what Prism does in the headline, sees three entries phrased as who they are for, and takes theirs: try the demo, sign in, or read the evidence. Further down, the logbook proves the claim by letting them break it, then the measured evidence and plain rules back it up.

FIRST VIEWPORT: Desktop 1440x900: header (brand left, Sign in and theme and language right), a four-line headline at about 4.25rem and one promise line, then three doors in a row (demo door widest, pine; sign in; see the evidence), then a strip of six sealed dots linking down to the logbook. Phone 390x844: headline, then the demo door first, sign in, evidence stacked, the strip below. The primary action is the pine demo door's button.

FORM: Choose your door, structure 3 of the dealt hand in the user's pick round (roll lead). seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

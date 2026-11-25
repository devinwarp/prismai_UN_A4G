---
name: Prism
description: A governed ledger for government AI, kept on warm paper in pine and ember.
colors:
  paper: "#f6f4ec"
  paper-deep: "#eceade"
  card: "#fffdf6"
  ink: "#1c211c"
  ink-soft: "#5e685c"
  line: "#dcd8c6"
  pine: "#2f6242"
  pine-soft: "#dce7da"
  pine-deep: "#27513a"
  moss: "#3f4a3a"
  ember: "#a6552e"
  slate: "#4d5e6b"
  sand: "#a89f8a"
  ochre: "#8a6d2f"
typography:
  display:
    fontFamily: "Spectral, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Spectral, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  figure:
    fontFamily: "Spectral, Georgia, serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0em"
    fontFeature: "tnum"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.2em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
  headline-band:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "14px 20px"
  chip-entity:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  badge-verdict:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: Prism

## Overview

**Creative North Star: "The Field Ledger"**

Prism looks like a governed record kept on paper. The ground is warm cream, headings are set in a bookish serif, labels and identifiers in mono, and every figure sits in a ruled panel where it can be traced. Nothing is decorative: depth comes from tonal layers and one-pixel hairlines, colour carries a small number of fixed meanings, and a symbol and a word always travel with it.

The system serves two readers, a federal governance officer scanning for the gap between what is deployed and what is compliant, and an entity owner working on one register. Density is high on the one-screen desktop and relaxed on a phone, but the vocabulary is identical: same panels, same badges, same type. Familiar controls beat invented ones.

Typography, the background texture and the palette are a binding commitment from the product owner: new work changes layout, hierarchy and components around them, never these three.

**Key Characteristics:**
- Warm paper ground with a faint dot grid; cards are a half-step lighter than the page.
- One accent (pine) for action and "lit"; ember only for gaps and failures; slate only for "compliant".
- Serif for headings and large figures, sans for reading, mono for labels, IDs and measurements.
- Flat at rest: hairline borders, no resting shadows.
- Two themes from one token set: Paper and Pine (default) and Ink and lit glow (dark).
- Every state is glyph plus word plus colour, never colour alone.

## Colors

A restrained earth palette: cream paper, deep pine, burnt ember, with a slate-blue and two muted golds held back for verdict meaning.

### Primary
- **Deep Pine** (#2f6242, `--color-lit`): the single accent. Primary progress fill ("deployed"), selected and focus outlines, the node glyph, links of record. Hover and text-on-tint variant is Pressed Pine (#27513a). Tint is Pine Mist (#dce7da), used for the org chip and selection.

### Secondary
- **Burnt Ember** (#a6552e, `--color-ember`): gaps, unsaved changes, failed gates, "NO GO". Never decorative.
- **Slate Blue** (#4d5e6b, `--color-v-sup`): reserved for "compliant" and the GO_SUPERVISED verdict, so the second bar beside "deployed" is always this colour.

### Tertiary
- **Field Ochre** (#8a6d2f): ESCALATE and "fix declared" states.
- **Dry Sand** (#a89f8a): ASSISTANT_ONLY and the "other" chart series.

### Neutral
- **Warm Paper** (#f6f4ec, `--color-paper`): page ground and form-field fill.
- **Paper Shade** (#eceade, `--color-paper-deep`): empty bars, hover rows, selected chips, code.
- **Card Cream** (#fffdf6, `--color-card`): panels, tables, the drawer's active tab.
- **Field Ink** (#1c211c, `--color-ink`): body text, primary buttons, the headline band's border.
- **Soft Ink** (#5e685c, `--color-ink-soft`): secondary text, labels, captions.
- **Ruled Line** (#dcd8c6, `--color-line`): every hairline border and divider.
- **Moss** (#3f4a3a, `--color-pine`): a dark green-grey defined in the token set for deep tonal needs; it remaps to sage (#9fb68a) in the Ink theme.

In the **Ink** theme (`html[data-theme="ink"]`) the same names remap: paper #151311, card #211d18, ink #efeae0, accent becomes amber #e59b3f, ember #e08a67, slate #8fa3b0. Components never branch on theme; they only use tokens.

### Named Rules
**The One Lit Accent Rule.** Pine is the only accent. If a second colour is needed to say something, it is ember (a gap) or slate (compliant), and nothing else.
**The Never Alone Rule.** A colour never carries a meaning alone. Verdicts, gate status and table states always pair it with a glyph (● ◐ ○ ✕ ▲ ✓) and a word.
**The Beside, Never Merged Rule.** Deployed and compliant are drawn side by side in their own colours. No blended or averaged figure exists.

## Typography

**Display Font:** Spectral (with Georgia, serif), weights 400 / 500 / 600
**Body Font:** Geist (with ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace)
Arabic is set in Noto Sans Arabic, loaded only on the federal screens; it replaces all three faces when the language is Arabic.

**Character:** A serif voice for what the page is saying and the numbers that matter, a plain sans for working text, and mono for anything a person might copy, cite or audit.

### Hierarchy
- **Figure** (Spectral 600, 3rem desktop / 6rem phone, line-height 1, tabular numerals): the deployed % and compliant % only.
- **Display** (Spectral 500, 2.25rem, -0.025em): the page title on a phone and tablet; 1.5rem on the one-screen desktop.
- **Headline** (Spectral 500, 1.5rem, -0.025em): panel and drawer titles; 1.125rem inside dense panels.
- **Title** (Geist 500, 1rem): chart questions, link titles, card headings.
- **Body** (Geist 400, 0.875rem, 1.625): descriptions, ledes, table cells (0.8125rem on the dense desktop). Prose max-width 68ch.
- **Label** (JetBrains Mono, 0.625–0.6875rem, 0.2em tracking, uppercase): table headers, KPI captions, IDs, badges.

### Named Rules
**The Mono Is For Records Rule.** Mono marks identifiers, counts, status words and column heads. It never decorates a heading.
**The Fixed Scale Rule.** Sizes are fixed rem steps (ratio about 1.2), not fluid. Density changes by stepping down one named size at the `desk` breakpoint, never by scaling.

## Layout

Two layouts from one component set. **Phone, tablet and short windows:** a single column in reading order (title and actions, headline band, start steps and links, portfolio, register) inside a 6xl (72rem) container with 16/24px gutters; the register scrolls sideways inside its own panel. **One-screen desktop** (`desk`: at least 80rem wide and 37.5rem tall): the page is exactly the window tall and never scrolls. A 120rem-max grid holds a toolbar row, the full-width headline band (percentages | story and progress | four figures), then a 22rem portfolio panel beside the register, which takes the remaining height and scrolls inside itself. A `short` step (window under 46rem tall) tightens spacing by one notch.

Spacing runs on a 4px base (4, 8, 12, 16, 24); gaps are 12px on the desktop grid and 8px when short, 40px between sections on a phone. Overlays that must escape a scrolling panel use top-layer popovers or a modal dialog, never absolutely positioned boxes inside `overflow: auto`. Layouts mirror under right-to-left using logical properties (`ms-`, `pe-`, `start-`, `end-`).

## Elevation & Depth

Flat by default. Depth is conveyed by tonal layers (paper, then card cream, then paper shade for wells) and one-pixel Ruled Line borders. There are no resting shadows.

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 12px 32px -12px color-mix(in srgb, #1c211c 45%, transparent)`): the "Where to go" menu and verdict key; a 1px ink border always accompanies it.
- **Floating table** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): the "View as table" alternative opening over a chart.
- **Drawer scrim** (`rgba(28, 33, 28, 0.4)` backdrop plus a 2px ink inline-start border): the Configure drawer.

### Named Rules
**The Flat At Rest Rule.** A surface has a shadow only when it has left the page (a popover, a floating table, a drawer). Cards never do.

## Shapes

Softly rounded and consistent: panels and the headline band 16px, buttons and the primary action 12px, form fields and entity chips 8px, small tags 6px, and every badge, pill, filter segment and progress track fully round. Borders are 1px Ruled Line; the headline band alone takes a 2px Field Ink border, the one deliberate heavy edge on the screen. Progress tracks mark the target with a 2px ink tick that overshoots the bar by 6px.

## Components

### Buttons
- **Shape:** gently rounded (12px).
- **Primary:** Field Ink fill, Warm Paper text, 8px 16px, 14px medium; hover drops to 90% opacity; disabled 50% and `not-allowed`.
- **Ghost / toolbar:** Warm Paper fill, 1px Ruled Line border, Field Ink text; hover darkens the border to Soft Ink.
- **Focus:** a 2px Deep Pine outline offset 2px, everywhere (`:focus-visible`).

### Chips and Badges
- **Verdict badge:** fully round, 1px border and 13% fill tinted from the verdict colour (55% border), mono 11px, glyph in the colour then the word in ink.
- **Entity chip:** 8px radius, Warm Paper fill, hairline; selected is a Field Ink border on Paper Shade. A two-bar mini meter (deployed pine, compliant slate) sits inside.
- **Filter pill (counting verdicts):** full round; ticked is an ink border on Paper Shade with a ✓.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Card Cream on the paper ground.
- **Shadow Strategy:** none; see Elevation.
- **Border:** 1px Ruled Line. Never nested: a card holds sections separated by hairlines, not more cards.
- **Internal Padding:** 20–24px on a phone, 14px on the dense desktop.

### Inputs / Fields
- **Style:** Warm Paper fill, 1px Ruled Line stroke, 8px radius, 14px text (12px on the dense desktop), Soft Ink placeholder.
- **Focus:** border becomes Deep Pine plus the global 2px outline.
- **Error:** Burnt Ember text with a ✕ and the recovery in words, `role="alert"`; the control carries `aria-invalid`.
- **Disabled:** 50% opacity.

### Navigation
- **Admin bar:** a Warm Paper bar at 80% with a hairline below; mono uppercase wordmark, an org chip in Pine Mist, then the active page in ink and the rest in Soft Ink. The country switch, re-run, people and theme controls sit at the end.
- **Mobile:** the same bar wraps; the wordmark and org chip hide below 640px. Section jump pills (full-round, hairline) replace the desktop's single screen.

### Headline Band (signature)
One 2px-ink band answering "how far are we". Left, two serif percentages (deployed, compliant) with their counts; centre, the story sentence in Spectral and two progress tracks sharing one target tick; right, four labelled figures in a 2x2 grid of hairline-separated tiles. It stacks on a phone with the percentages at 6rem.

### Register Table (signature)
A sticky-headed table inside a Card Cream panel: mono uppercase column heads, 1px row rules, hover on Paper Shade at half strength, the stage as an editable pill (a native select laid invisibly over it), the verdict badge, nine journey glyphs in verdict colours, and a ✓ or – for compliance.

### Popover and Drawer
Popovers are top-layer, 12px radius, 1px ink border, Card Cream, placed against their button and closed by Esc or an outside click. The Configure drawer is a modal dialog from the inline-end edge, 46rem wide, with ARIA tabs and every panel kept mounted so unsaved edits survive closing.

## Do's and Don'ts

### Do:
- **Do** take every colour from the token set; the Ink theme must work with no component changes.
- **Do** show deployed beside compliant, in pine and slate, wherever a rate appears.
- **Do** pair every colour state with a glyph and a word, and keep contrast at 4.5:1 for text.
- **Do** keep numbers in tabular figures and wrap identifiers in `bdi dir="ltr"` so they survive right-to-left.
- **Do** keep depth to hairlines and tonal layers; use a shadow only for a popover, a floating table, or the drawer.
- **Do** step density down at the `desk` and `short` breakpoints by changing a named size, not by scaling.
- **Do** label simulated or fictitious data (the "Synthetic data · simulated Sijil" badge stays on every federal screen).

### Don't:
- **Don't** change the typefaces, the dot-grid background or the palette: they are a binding product commitment.
- **Don't** use ember or slate for decoration; ember means a gap or failure, slate means compliant.
- **Don't** put a card inside a card, add an eyebrow label above a heading, or use gradient text.
- **Don't** let the one-screen desktop page scroll; let the register (and, in a very short window, the portfolio panel) scroll inside their own panels.
- **Don't** use the paper grain (`.paper-bg`) on product screens; it is for landing, auth and legal pages only. Product screens carry the plain dot grid.
- **Don't** open a modal for what an inline control or a popover can do; the drawer exists only for the forms that change data.

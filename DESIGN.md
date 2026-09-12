---
name: Align
description: Calm, precise career infrastructure for building a trustworthy Career Profile.
colors:
  ink: "#111827"
  paper: "#fbfcfd"
  workspace: "#e9edf2"
  white: "#ffffff"
  violet-action: "#6757d9"
  violet-action-hover: "#5948cf"
  violet-wash: "#f7f6ff"
  cyan-detail: "#67e8f9"
  slate-950: "#020617"
  slate-600: "#475569"
  slate-400: "#94a3b8"
  slate-300: "#cbd5e1"
  slate-200: "#e2e8f0"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.8rem, 4vw, 2.65rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(2rem, 3vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.16em"
rounded:
  focus: "4px"
  compact: "8px"
  control: "12px"
  surface: "16px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.violet-action}"
    textColor: "{colors.white}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.violet-action-hover}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.slate-600}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.slate-950}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  choice-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.slate-950}"
    rounded: "{rounded.surface}"
    padding: "16px 20px"
---

# Design System: Align

## Overview

**Creative North Star: "The Career Workbench."**

Align feels like calm, precise, grown-up career infrastructure. The interface gives serious decisions room to breathe, keeps practical context close at hand, and uses emphasis sparingly so users can build and approve a Career Profile without ceremony or visual noise.

The workbench metaphor is functional: paper-like surfaces hold the task, ink establishes authority, and small violet and cyan signals mark action and progress. The visual system is confident but never theatrical, and it supports concise, respectful guidance rather than the personality of a playful AI assistant.

**Key Characteristics:**

- Paper-white task surfaces inside a cool, quiet workspace.
- Ink-dark context with restrained cyan progress detail.
- Violet reserved for selection, focus, and primary action.
- Compact controls, generous task spacing, and softly structured surfaces.
- Clear focus, readable states, and reduced-motion parity.

## Colors

The palette combines sober ink and slate neutrals with a single violet action voice and a small cyan progress signal.

### Primary

- **Workbench Violet:** The decisive action color for primary buttons, selected choices, focus treatments, and progress on light surfaces.
- **Pressed Violet:** The darker hover state that confirms an available primary action without changing its meaning.

### Secondary

- **Signal Cyan:** A supporting detail on the ink context layer, used for completed progress, small icons, and quiet atmospheric light rather than competing calls to action.

### Neutral

- **Infrastructure Ink:** The darkest contextual surface and the source of visual authority.
- **Working Paper:** The main task surface and sticky action-footer base.
- **Cool Workspace:** The page-level ground behind the focused task surface.
- **Clear White:** Controls, unselected choices, and high-contrast content on dark surfaces.
- **Slate Text:** Secondary explanations and supporting copy.
- **Slate Quiet:** Inactive progress, icons, and subdued metadata.
- **Slate Structure:** Control borders and separators.
- **Slate Layer:** Soft rules and low-emphasis fills.
- **Violet Wash:** The selected-card surface that carries emphasis without becoming a solid block.

### Named Rules

**The One Action Voice Rule.** Violet marks decisions and interaction; cyan communicates progress or contextual detail and does not become a competing primary action.

**The Paper-and-Ink Rule.** Build hierarchy first with paper, workspace, ink, and slate; introduce accent only where state or priority requires it.

## Typography

**Display Font:** Inter (with system-ui, -apple-system, and sans-serif fallbacks)  
**Body Font:** Inter (with system-ui, -apple-system, and sans-serif fallbacks)

**Character:** One disciplined sans-serif family keeps career information direct and contemporary. Tight headline tracking supplies confidence; open body leading keeps guidance calm and readable.

### Hierarchy

- **Display:** Semibold, fluid, tightly tracked, and compact; used for the task question, normally held to a short line length.
- **Headline:** Semibold and more expansive; used for high-level context on the dark onboarding rail.
- **Title:** Semibold and compact; used for cards, buttons, and local information hierarchy.
- **Body:** Regular with open leading; used for explanations and guidance, generally constrained to a readable measure.
- **Label:** Semibold, uppercase, and widely tracked; used sparingly for progress and contextual eyebrows.

### Named Rules

**The Short Question Rule.** Keep primary task headings concise enough to retain their compact, confident silhouette; move explanation into supporting body copy.

## Layout

Use a 4px-based spacing rhythm, with 12–20px gaps inside controls and cards and 28–36px separation between task chapters. Onboarding content is constrained to a readable 760px work area, with headings and descriptions held to shorter measures than form content.

Controls and choice groups are one column by default and become two columns when width allows. Actions stack at narrow widths, then align horizontally; primary and secondary controls retain a 44px minimum touch height. Sticky action areas use a subtle divider and translucent paper background so progression stays available without obscuring content.

The implemented onboarding surface uses a dark contextual rail beside a paper task area on large screens and a compact progress header on small screens. That split composition is specific to onboarding, not a universal Align page template; other surfaces should inherit its rhythm, color roles, and hierarchy without copying its frame.

## Elevation & Depth

Depth is quiet and structural. The main work surface uses a broad ambient shadow against the cool workspace, while interactive cards and primary actions receive smaller violet-tinted shadows. Tonal layering and hairline borders do most of the separation; shadows clarify focus and selection rather than decorating every container.

### Shadow Vocabulary

- **Workspace Lift** (`0 24px 90px rgba(31,41,55,0.13)`): separates the focused onboarding work surface from the page ground.
- **Action Lift** (`0 8px 24px rgba(103,87,217,0.20)`): supports an available primary action; it strengthens slightly on hover.
- **Selected Surface** (`0 10px 30px rgba(74,63,159,0.09)`): gives a checked choice low, violet-tinted presence.
- **Featured Surface** (`0 12px 34px rgba(74,63,159,0.09)`): distinguishes the recommended source path without turning it into a promotional card.

### Named Rules

**The Quiet Depth Rule.** Use borders and tonal contrast at rest; reserve visible lift for the work surface, selected decisions, and primary actions.

## Shapes

The form language is softly structured: 12px corners for controls and icon tiles, 16px corners for choice cards and information panels, and full circles for progress markers. The 8px radius appears only on compact disclosure controls, while the 4px focus-outline rounding prevents focus treatment from changing component silhouettes. Borders stay fine and cool; selected surfaces combine a violet border, a pale wash, and a restrained inset ring.

## Components

### Buttons

- **Shape:** Compact, softly rounded controls with a 44px minimum height and 12px corners.
- **Primary:** Workbench Violet with white semibold text, 20px horizontal padding, and a low violet action shadow.
- **Hover / Focus:** Hover deepens to Pressed Violet and strengthens the shadow; focus uses a violet ring with offset; active presses down by 1px. Disabled controls lose shadow, reduce opacity, and use a not-allowed cursor.
- **Secondary:** White with a slate border and slate text; hover strengthens border and text while adding only a faint slate fill.

### Cards / Containers

- **Corner Style:** 16px for selectable and informational surfaces.
- **Background:** White at rest; Violet Wash for selected or featured decisions; a soft slate layer for trust notes.
- **Shadow Strategy:** Flat by default, with Selected Surface or Featured Surface lift only when state or hierarchy warrants it.
- **Border:** Cool slate at rest; violet for selected or featured states.
- **Internal Padding:** 16–20px, with clear separation between icon, title, description, and state indicator.

### Inputs / Fields

- **Style:** White or low-contrast neutral fields, 12px corners, 14px text, and a fine neutral border.
- **Focus:** Violet border plus a translucent violet ring; never rely on color alone where a visible outline or ring is available.
- **Error / Disabled:** Errors use a pale rose status surface with readable dark rose text; disabled interactive elements reduce opacity and retain an explicit cursor state.

### Navigation

On large onboarding screens, progress is a numbered vertical sequence on ink with cyan completed states and a white current marker. On narrow screens, it becomes a compact numeric label and a 4px progress bar above the task. Stage transitions preserve the user's sense of direction, while semantic progress labels remain available to assistive technology.

### Choice Cards

Choice cards make the whole 16px-rounded surface interactive. The unchecked state is white and quiet; the selected state combines Violet Wash, a violet outline, an inset ring, a filled icon tile, and a clear check indicator. Titles stay compact and descriptions remain readable at small sizes.

### Trust and Ready Panels

Trust notes use a soft slate fill, a small lock icon, and concise copy without elevated framing. Completion panels shift to a pale violet surface and a violet check tile, signalling readiness without implying guarantees or promotional success claims.

## Do's and Don'ts

### Do:

- **Do** establish hierarchy with ink, paper, workspace, and slate before adding accent.
- **Do** reserve violet for primary action, focus, selection, and active progress on light surfaces.
- **Do** keep primary task headings short and explanations concise, calm, and readable.
- **Do** preserve 44px minimum control height, visible focus, semantic progress, and equivalent reduced-motion states.
- **Do** use low tonal contrast and fine borders for ordinary grouping, adding shadow only when state or hierarchy needs it.

### Don't:

- **Don't** use cyan as a second call-to-action color; it is a contextual and progress detail.
- **Don't** make every card float or glow; most surfaces are flat until selected or prioritised.
- **Don't** turn practical eligibility or sponsorship guidance into alarming, celebratory, or guarantee-like visual treatment.
- **Don't** treat the onboarding split rail as a mandatory composition for unrelated Align surfaces.
- **Don't** add playful AI motifs, decorative gradients, or ornamental motion that competes with the career task.

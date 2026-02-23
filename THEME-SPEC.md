\# ClawSuite Themes (Enterprise Polishing) — Codex Task

Add a theme system with 3 enterprise themes inspired by ops dashboards (Datadog/Slack), premium dark glow (Nuxt premium), and iOS paper light.

Constraints:

\- Tailwind v4 CSS-first only (no tailwind.config.ts)

\- Must work with existing OKLCH primary/accent token approach and \`data-accent="orange|blue|purple|green"\`

\- Desktop untouched unless theme changes are semantic (vars only)

\- Mobile + desktop both supported

\- Persist theme + accent in localStorage (Settings already saves locally)

\## 1) Root Attributes

Implement:

\- \`data-theme="ops-dark|premium-dark|paper-light"\`

\- keep \`data-accent\` as-is

Apply attributes to documentElement (html) or app root.

\## 2) Theme Variables in src/styles.css

Create semantic CSS variables used by the UI:

\- --bg, --panel, --card, --card2

\- --border, --text, --muted

\- --shadow-1, --shadow-2, --shadow-3

\- --glass (for nav/composer)

\- --focus (ring color)

Optional chart vars: --chart-1..--chart-6

Define defaults + per theme overrides:

\[data-theme="ops-dark"\] => dense structural dark, crisp borders, minimal shadows

\[data-theme="premium-dark"\] => subtle vignette + deeper shadows + soft inner highlight

\[data-theme="paper-light"\] => warm white bg, soft borders, gentle shadows

Keep glass usage tactical:

\- Bottom nav + chat composer may use --glass + backdrop-blur

\- Core panels/cards should use --panel/--card solid surfaces

\## 3) Wire Components to Semantic Vars

Refactor key layout containers + cards to use semantic vars instead of hard-coded primary scale where appropriate:

\- Dashboard panel wrappers

\- Cards (metrics, sessions, agent cards, skill cards)

\- Borders and shadows should reference --border and --shadow-\* vars

Keep your “always-dark inner cards” behavior, but ensure text contrast works in paper-light theme.

\## 4) Settings UI

Under Settings → Appearance:

\- Theme selector (segmented control or radio):

Ops Dark / Premium Dark / Paper Light

\- Accent selector remains (orange default)

On change:

\- update data-theme attribute immediately

\- save to localStorage

\- load on app boot/hydration-safe

\## 5) QA Checks

\- All text readable (no black-on-black in inputs)

\- Chat composer + bottom nav maintain correct contrast under each theme

\- No horizontal overflow introduced

\- Desktop layout unchanged (only color/styling changes via vars)

Deliver:

\- PR with theme system + settings toggle + semantic var wiring
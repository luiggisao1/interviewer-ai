# Design System Master: Interviewer AI — Editorial Study Atelier

> Generated and verified with `ui-ux-pro-max` (`Editorial Grid / Magazine` · `variance: 8`, `motion: 7`, `density: 4`).

## 1. Visual Direction & Philosophy

- **Style**: Editorial Grid / Magazine (`Editorial Study Atelier`)
- **Mood**: Warm paper craft, high-contrast literary typography, calm focus, senior engineering dossier
- **Core Idea**: Treat technical interview practice like a thoughtfully typeset publication and hiring-committee dossier rather than a generic dark neon dashboard. Questions read like editorial headlines; evaluation comparisons read like annotated review briefs.

## 2. Semantic Color Tokens (WCAG AA ≥ 4.5:1)

Declared as RGB channels in `frontend/src/styles.css` (`:root`) and mapped in `frontend/tailwind.config.js` so all Tailwind opacity utilities (`bg-accent/10`, `border-ink/15`) work natively.

| Token | Hex | RGB | Role |
|---|---|---|---|
| `--paper` | `#FFFBEB` | `255 251 235` | Primary page canvas (warm paper) |
| `--surface` | `#FEF9E7` | `254 249 231` | Subtle highlight surface / callout |
| `--card` | `#FFFFFF` | `255 255 255` | Elevated crisp editorial card |
| `--muted` | `#F5F3EE` | `245 243 238` | Recessed input, pill track, telemetry well |
| `--border` | `#E7E5E4` | `231 229 228` | Hairline stone dividers & card borders |
| `--border-strong` | `#D6D3D1` | `214 211 209` | Interactive control borders & hover states |
| `--ink` | `#18181B` | `24 24 27` | Primary charcoal ink text & primary CTA fill |
| `--ink-secondary` | `#3F3F46` | `63 63 70` | Long-form prose & secondary body copy |
| `--ink-muted` | `#57534E` | `87 83 78` | Captions, metadata, placeholders |
| `--accent` | `#D97706` | `217 119 6` | Editorial amber indicator & active switch |
| `--accent-deep` | `#B45309` | `180 83 9` | Accessible amber text on paper/white (≥ 4.8:1) |
| `--verified` | `#059669` | `5 150 105` | Verified status fill & live microphone dot |
| `--verified-deep` | `#047857` | `4 120 87` | Accessible emerald text on light surfaces |
| `--danger` | `#DC2626` | `220 38 38` | Destructive border / alert accent |
| `--danger-deep` | `#B91C1C` | `185 28 28` | Accessible error/destructive text |

## 3. Typography

- **Display / Questions (`font-serif`)**: `Newsreader`, fallback `Georgia`, `"Iowan Old Style"`, `serif` — used for hero headlines, active interview questions, section headings, and dossier headers.
- **UI / Controls / Body (`font-sans`)**: `Inter`, `system-ui`, `-apple-system`, `sans-serif` — used for forms, buttons, selects, and body readability.
- **Telemetry / Badges / Scores (`font-mono`)**: `JetBrains Mono`, `ui-monospace`, `monospace` — used for turn counters (`01`, `02`), scores, timers, status tags, and character counts.

## 4. Elevation, Spacing & Radius

- **Radius**: `10px` (`rounded-editorial`) / `12px` (`rounded-xl`) for cards, `8px` (`rounded-lg`) for inputs and controls.
- **Shadow**: `shadow-editorial` (`0 10px 28px -16px rgba(24, 24, 27, 0.14)`).
- **Spacing**: Spacious editorial rhythm (`p-5` / `p-6`, `gap-4` / `gap-5`), clear hairline `border-b border-border` section headers.

## 5. Accessibility & Interaction Rules

1. **No Emojis as Structural Icons**: Use Lucide React SVG icons exclusively; mark decorative icons beside text with `aria-hidden="true"`.
2. **Visible Keyboard Focus**: All buttons, selects, switches, and inputs provide `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`.
3. **Reduced Motion**: Respect `@media (prefers-reduced-motion: reduce)` by disabling keyframe animations (`eqBounce`, `spin`, `animate-pulse`) and transitions.
4. **Drawer & Modal Dismissal**: `TranscriptDrawer` supports `Escape` key dismissal in addition to backdrop click and explicit Close button.

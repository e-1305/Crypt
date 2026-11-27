# CRYPT brand tokens

One small set of design tokens for every page. They are CSS custom properties in [`web/brand.css`](../web/brand.css), which each page loads before its other stylesheets. `web/style.css` reads them with `var()`. The look is a phosphor green terminal: JetBrains Mono, square corners, 1px borders.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--fg` | `#33ff33` | Text, borders of the main controls, Healed state |
| `--dim` | `#22b022` | Secondary text, pane borders, Healthy state |
| `--bg` | `#050805` | Page background |
| `--warn` | `#ffb000` | Focus ring, spotlight, notices |
| `--hot` | `#ff6a3d` | Possessed state, urgent marks |
| `--state-healthy` | `#22b022` | Plate and 3D view: Healthy limb |
| `--state-rotting` | `#c8e63c` | Plate and 3D view: Rotting limb |
| `--state-possessed` | `#ff6a3d` | Plate and 3D view: Possessed limb |
| `--state-healed` | `#33ff33` | Plate and 3D view: Healed limb |
| `--state-rejected` | `#ff4d4d` | Rejected graft (the plate convulses) |
| `--surface` | `#0a140a` | Panels, cards, inputs on `--bg` |
| `--surface-deep` | `#03060a` | Graveyard night stage |
| `--healed-soft` | `#9dffb0` | Healed text and bars on the War Room |
| `--flash` | `#ddffff` | War Room thunder flash |
| `--hc-fg` | `#fff` | High-contrast text and borders |
| `--hc-bg` | `#000` | High-contrast background |

State is never shown by colour alone: every limb also carries its state as text.

## Type scale

The font is JetBrains Mono (self-hosted, OFL-1.1, see [ATTRIBUTION](ATTRIBUTION.md)); system monospace is the fallback.

| Token | Value | Use |
| --- | --- | --- |
| `--font-mono` | JetBrains Mono, then system monospace | All text |
| `--text-12` | `12px` | Cards, captions |
| `--text-14` | `14px` | Secondary copy |
| `--text-16` | `16px` | Body |
| `--text-20` | `20px` | Panel headings |
| `--text-28` | `28px` | Section headings |
| `--text-40` | `40px` | Page title |

## Spacing

| Token | Value |
| --- | --- |
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `24px` |
| `--space-6` | `32px` |

## Radius and border

| Token | Value | Use |
| --- | --- | --- |
| `--radius` | `0` | Default: square corners |
| `--radius-sm` | `2px` | Optional, for small chips |
| `--border-width` | `1px` | All borders |
| `--border` | `1px solid var(--dim)` | Panes and buttons |
| `--border-strong` | `1px solid var(--fg)` | Hero buttons and cards |

## Buttons

- Primary, filled: `--fg` background, black text, bold. One per screen (Scan your repo).
- Secondary, outline: transparent background, `--border-strong`. Hover fills with `--fg`.
- Quiet link: transparent border, underlined text, reduced opacity.

Touch targets are at least 44px on phones.

## Focus ring

| Token | Value |
| --- | --- |
| `--focus-ring` | `2px solid var(--warn)` |
| `--focus-offset` | `2px` |

Every focusable element shows the ring on keyboard focus.

## Motion

| Token | Value | Use |
| --- | --- | --- |
| `--dur-fast` | `150ms` | Hover, press, drop zone |
| `--dur-reveal` | `240ms` | Small reveals |
| `--dur-reveal-long` | `320ms` | Panels, cards, judge slides |
| `--dur-cue` | `480ms` | One-shot cues (pop, shake, convulse) |
| `--dur-settle` | `600ms` | Bars and flashes settling |
| `--ease-out` | `cubic-bezier(.22, 1, .36, 1)` | Default for every transition and animation |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` | Loops (the raid heartbeat) |

Only `transform` and `opacity` animate (checked by `tests/motion-system.test.ts`).

Under `prefers-reduced-motion: reduce` and in high-contrast mode (`body.hc`) every duration is `0ms`. `brand.css` holds tokens only. It has no animation and no timer, so the idle budget (at most 2 animation frames per second at rest) is unchanged.

## Logo

The logo is the word CRYPT set in JetBrains Mono Bold, in `--fg` on `--bg`, with the line "Don't abandon your creature." beneath it. Keep clear space of `--space-4` around it. Use `--fg` on dark backgrounds and `--hc-fg` in high-contrast mode. The mark is original text, with no copied logo or art.

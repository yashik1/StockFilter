# Voltage

A custom theme for StockFilter: electric and modern, without tipping into the
neon-crypto look that would undercut a tool people use to judge their money.

The energy comes from a violet→cyan accent gradient, a deep ink canvas with a
faint violet cast, and glow used sparingly on the one element that matters most
on each page. Everything else stays quiet so the numbers read.

## Colour palette

### Canvas & surfaces

| Role | Dark | Light |
|---|---|---|
| Canvas | `#08070f` | `#f7f7fb` |
| Surface | `#12111d` | `#ffffff` |
| Surface raised | `#1b1a2b` | `#f1f1f8` |
| Surface high | `#252439` | `#e6e6f2` |
| Border | `#252438` | `#e5e5f0` |

### Accent

| Role | Dark | Light |
|---|---|---|
| Primary | `#8b5cff` | `#6d3ff5` |
| Primary hover | `#a37dff` | `#5a2fe0` |
| Secondary (gradient end) | `#22d3ee` | `#0891b2` |
| Accent wash | `#1e1640` | `#efeaff` |

The signature is the `#8b5cff → #22d3ee` violet-to-cyan gradient, used on the
wordmark, the hero score ring, and primary buttons — nowhere else.

### Status

Not pure red/green. The good tone leans teal so it stays separable from the poor
tone under red-green colour vision deficiency, and every rating carries a text
label so colour is never the only channel.

| Role | Dark | Light |
|---|---|---|
| Good | `#00d9a3` | `#00916d` |
| Fair | `#ffb224` | `#b06a00` |
| Poor | `#ff5c72` | `#d62b6b` |

### Categorical series

Validated with the data-viz palette checker — not chosen by eye. Both modes pass
the lightness band, chroma floor, adjacent CVD separation, the normal-vision
floor and 3:1 contrast against their own surface.

| Slot | Dark | Light |
|---|---|---|
| 1 violet | `#7d5cf6` | `#6d3ff5` |
| 2 teal | `#12a594` | `#009b7e` |
| 3 amber | `#bd780c` | `#b06a00` |
| 4 pink | `#e5568a` | `#d62b6b` |

Worst adjacent CVD ΔE: 11.3 dark / 8.9 light (target ≥ 8).
Worst adjacent normal-vision ΔE: 18.4 dark / 18.5 light (floor ≥ 15).

## Typography

- **Display / headings**: Geist Sans, weight 700, tracking −0.03em. Large sizes
  are tightened so big numbers read as one shape.
- **Body**: Geist Sans, 400/500.
- **Figures**: Geist Mono with tabular numerals, so columns of prices do not
  jitter as values update.
- **Eyebrow**: 11px, 600, tracking +0.08em, uppercase.

## Motion

Restrained by design — this is a finance tool, not a game. A subtle gradient
sweep on the wordmark, a ring that draws once on the health score, and hover
lifts on cards. All of it is disabled under `prefers-reduced-motion`.

## Best used for

Consumer-facing financial research where the audience is non-expert: the look
needs to feel current and confident rather than institutional, while keeping
every figure legible and every rating readable without relying on colour.

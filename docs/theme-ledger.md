# Ledger

An editorial treatment for a tool that is read rather than operated.

The product's job is turning filings into sentences, so type carries most of the
interface. The reference points are financial publications rather than trading
terminals.

## Colour

Neutrals are warm. Cool slate reads as a dashboard; warm paper and a warm
off-black read as something printed, which is the register this product wants.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#f7f5f2` | `#121214` |
| Surface | `#ffffff` | `#1a1a1d` |
| Raised | `#f2efea` | `#232326` |
| Border | `#e3ded5` | `#2a2a2e` |
| Ink | `#16150f` | `#f5f3ef` |

### Accent — burnt amber

| | Light | Dark |
| --- | --- | --- |
| Accent | `#a35d00` | `#e0a458` |
| Hover | `#8a4e00` | `#edb771` |
| Wash | `#fbf0df` | `#33260f` |

Amber over green deliberately. Green reads as "buy" or "go", and this tool never
recommends anything — amber reads as insight and clarity, which is the actual
job. It also leaves the green end of the spectrum free for status, where it
means something specific.

### Status — kept separate from the accent

| Role | Light | Dark |
| --- | --- | --- |
| Good | `#00806e` | `#2fbfa2` |
| Mixed | `#5d6673` | `#8b95a5` |
| Weak | `#b3243f` | `#ef5f78` |

"Mixed" is a neutral slate rather than amber. Two reasons: sharing the accent's
hue would blur brand and meaning, and a mixed result is genuinely neutral rather
than a warning — amber overstated it.

Good leans teal and weak leans crimson-pink so the pair stays separable under
red-green colour vision deficiency. Every rating also carries a word, so colour
is never the only channel.

### Categorical series

Validated with the data-viz palette checker in both modes, not chosen by eye.

| Slot | Light | Dark |
| --- | --- | --- |
| 1 amber | `#a35d00` | `#c47d0e` |
| 2 teal | `#00937f` | `#12a594` |
| 3 indigo | `#5148d8` | `#6d6ff0` |
| 4 rose | `#c42a68` | `#d9538a` |

Worst adjacent CVD ΔE: 14.1 dark / 12.5 light (target ≥ 8).
Worst adjacent normal-vision ΔE: 21.0 dark / 20.4 light (floor ≥ 15).
All slots clear 3:1 contrast against their own surface.

## Type

Three faces, each with one job, all self-hosted through `next/font` so no
third-party request happens on load.

- **Newsreader** (serif) — page and section headings, and the translated
  sentences. Used with restraint: everywhere it becomes decorative, so it is
  confined to titles and to the writing that is the point of the product.
- **Inter** (sans) — running text, labels, controls.
- **JetBrains Mono** (mono) — every figure, ticker and percentage, with tabular
  numerals so columns align and a price cannot jitter as it updates.

Running prose is held near 34rem, roughly 65 characters, which is where
continuous text stays easiest to read.

## The hero

Shows the product working rather than describing it: a real Apple balance sheet
as XBRL concept names on one side, and the sentence the live scoring engine
writes from those same three numbers on the other. The claim is "we translate
this into that", and showing both halves argues it better than a feature list.

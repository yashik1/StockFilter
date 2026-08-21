# Industry

A technical wireframe for a tool that shows its working.

The product reads a filing and lays out how it reached its answer, so the
interface is a drawing of that working rather than a surface with things
resting on it. The reference points are engineering drawings and datasheets
rather than either a financial publication or a trading terminal.

## Colour

Cool grey ground, near-black ink, one steel-blue accent. Status keeps its own
hues so a rising price and a brand colour are never the same signal, and every
rating still carries its word alongside its colour.

The accent needs saying plainly. The design system's base steel is `#5980a6`,
which measures 3.7:1 on the light canvas — under AA for body text and for a
14px button label. So `--accent` carries `accent-700` (`#416180`), which is
AA-safe both as text and as a fill behind `--accent-fg`, and the brighter steel
lives in `--accent-bright` for chart series, the logo tile and other places
nothing is read off it.

The three text tiers are measured, not chosen by eye: roughly 9.0, 5.9 and 4.7
to one on the canvas in light, and the same shape in dark. The faint tier is
tuned against `--surface` rather than the canvas, because that is the darker of
the two grounds it appears on and therefore the binding case.

## Shape

Square. `--radius-sm`, `--radius` and `--radius-lg` are all `0`, and Tailwind's
own radius scale is zeroed in `@theme` so a `rounded-lg` typed later cannot
quietly reintroduce the old language. `rounded-full` is deliberately untouched:
a status dot is a mark, not a box.

Cards are line drawings — transparent, one hairline rule, no shadow — with four
registration marks at the corners. The marks live in `Card` itself so no page
can forget them or add a fifth, and the frame sits outside the border, which is
why a marked card must not clip its overflow. Shadows are reserved for things
that genuinely float: the search dropdown, a dialog.

## Type

Two faces. Barlow Condensed carries headings, figures and the eyebrow; Barlow
carries everything read as prose. Numbers use `font-variant-numeric:
tabular-nums` rather than a monospaced face, so columns still align and a price
cannot jitter as it updates, but the numerals belong to the same family as the
words around them.

The CSS variable names are inherited from the theme this replaced and are
deliberately unchanged: `--font-serif` now holds a condensed sans because the
name marks a role — headlines — not a classification. Renaming them would have
meant touching every component for no gain.

## The header

Three explicit grid columns: lockup, navigation, and a right-hand band of
controls that are all exactly 34px tall so the row reads as one ruled line.

`minmax(0, 1fr)` on the middle column is load-bearing. A bare `1fr` is
`minmax(auto, 1fr)`, which refuses to shrink below its content — which is how
the previous header pushed the whole document sideways below about 1050px. The
same rule applies anywhere in the app that a grid column holds an unbreakable
string, such as an XBRL concept name.

---

*Superseded: the previous theme, Ledger, was an editorial treatment in warm
paper and burnt amber with Newsreader over Inter, rounded cards and a gradient
bolt mark. It is kept in git history rather than here.*

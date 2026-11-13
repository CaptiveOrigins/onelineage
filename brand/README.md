# Brand

OneLineage follows the OneOrigin brand. `brand/oneorigin/` is a locked copy of the suite's brand source, OnePhylogeny's [`docs/oneorigin/`](https://github.com/CaptiveOrigins/onephylogeny/tree/main/docs/oneorigin). Change the brand there, never in this copy: `node scripts/oneorigin.mjs check` runs in CI and fails on any hand edit. To take a newer source, run `node scripts/oneorigin.mjs lock --source <OnePhylogeny checkout> --copy`.

- **Palette** (approved by the owner on 2026-11-12, in `brand/oneorigin/brand.md` and `tokens.json`): OneLineage is sky blue `#3fb1e4`, with level shades `#79c8ec` and `#a3daf2` and text color `#2c7ca0` (4.67:1 on white). The one is deep teal `#1f6f6b` with a cream center, and lines are aubergine `#363051`.
- **Mark:** `brand/oneorigin/marks/onelineage-light.svg`, `-dark.svg` and `-small.svg`: a spiral around a person, who is the one at its center.
- **Not decided yet:** OneLineage's app icon, tile and maker's mark. No icon masters (`icon.svg`, `icon-small.svg`, `icon-1024.png`) are added until they are.

CSS variables use the prefix `--ol-`.

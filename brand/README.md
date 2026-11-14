# Brand

OneFamily follows the OneOrigin brand. `brand/oneorigin/` is a locked copy of the suite's brand source, OnePhylogeny's [`docs/oneorigin/`](https://github.com/ExtantApe/OnePhylogeny/tree/main/docs/oneorigin). Change the brand there, never in this copy: `node scripts/oneorigin.mjs check` runs in CI and fails on any hand edit. To take a newer source, run `node scripts/oneorigin.mjs lock --source <OnePhylogeny checkout> --copy`.

- **Rename (D174, 2026-11-14):** this app was OneLineage and is now OneFamily. The spiral mark becomes OneFamily's, recolored to the three-color scheme. The sky blue (`#3fb1e4`) stays with the name OneLineage, which becomes a separate tree-of-life tool with a new mark. Both changes are made in the brand source, so until they land the copy here still holds the spiral as `marks/onelineage-light.svg`, `-dark.svg` and `-small.svg`, in the old blue.
- **The one** is deep teal `#1f6f6b` with a cream center, and lines are aubergine `#363051` (approved by the owner on 2026-11-12, in `brand/oneorigin/brand.md` and `tokens.json`).
- **Not decided yet:** OneFamily's app icon, tile and maker's mark. No icon masters (`icon.svg`, `icon-small.svg`, `icon-1024.png`) are added until they are.

CSS variables use the prefix `--of-`.

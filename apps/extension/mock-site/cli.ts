/** Starts the mock site for trying the extension by hand: pnpm --filter onefamily-extension mock-site [port]. */
import { startMockSite } from './server'

const port = Number(process.argv[2] ?? 8787)
const site = await startMockSite({ port, seed: 1 })
console.log(`Made-up genealogy site at ${site.origin}/kits/${site.kit}/matches (seed 1, ${site.matches.length} matches). Press Ctrl+C to stop.`)

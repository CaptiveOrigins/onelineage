# ADR 0001: Data model and provenance

Status: accepted, 2026-11-10

## Context

OneLineage combines match data from several testing services with family trees and its own analysis. Names change, people test at more than one company, and every number has to be traceable back to the file it came from. Nothing may be typed in by hand.

## Decision

- **Kit:** one test at one service, with the service, the service's test ID, and test metadata where available: chip or test version, genome build, marker count, download date.
- **Match:** another tester as one service sees them, keyed by that service's ID (for Ancestry, the match GUID). A name is a label, never a key.
- **Person:** one universal OneLineage ID per human: a family kit, a match or an ancestor. It's random and never changes. Service IDs attach to it through **identity links**, each carrying its evidence, its confidence and who confirmed it. Links are proposed by the engine and confirmed by a person. They're never assumed from a name, and they can be undone.
- **Observation:** a match seen from a kit in one export, with the cM, segments, longest segment, side label and tree status. Append-only.
- **Shared-match link:** match A and match B as seen from a kit, with the A-to-B cM where the service gives it.
- **Provenance on every record:** the source file's SHA-256, the row number and the export date. Records that come from a computation instead name the inputs and the engine version.
- **Source of truth:** raw exports are stored untouched, with checksums, and are read-only after import. Everything else can be rebuilt from them, plus the decisions log (ADR 0005).

## Consequences

- Diffs between exports are exact joins on service IDs.
- Anything shown in a report can be traced to a file and a row.
- Cross-service identity is always a reviewed decision, never an accident of matching names.

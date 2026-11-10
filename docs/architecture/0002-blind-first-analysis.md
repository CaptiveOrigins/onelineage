# ADR 0002: Blind first, enforced in code

Status: accepted, 2026-11-10

## Context

A family tree can be wrong, through a misattributed parent, an adoption or a guess written down as fact. If an analysis reads the tree first, it tends to confirm it. The point of OneLineage is to let the DNA speak before the tree does.

## Decision

- Each kit starts **blind**. Until `unblind <kit>` is run, the engine refuses to open any tree source for that kit. That covers the user's own tree, match trees used as names for groups, the service's common-ancestor hints, and the user's groups and notes.
- `unblind` is a recorded decision, with the time and who ran it, kept in the decisions log.
- After unblinding, trees may be used as a reference, and are always treated as claims to test.
- Each kit records what its user saw before the run, as an exposure log, so readers know what might have nudged it.
- A test tries to read a tree source while a kit is blind, and must fail.

## Consequences

- A blind result can be shown to be blind, rather than just claimed to be.
- Group names before unblinding are neutral IDs.

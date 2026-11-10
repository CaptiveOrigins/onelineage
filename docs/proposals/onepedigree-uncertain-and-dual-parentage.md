# Proposal to OnePedigree: uncertain parentage and dual parentage

**Outcome, 2026-11-10 (Science):** accepted, with one change. Part 1 uses OnePedigree's existing `Parentage.uncertainParents` (released in 0.1.0-alpha.20): each candidate has a `probability`, and the remainder is someone unrecorded. OneLineage adopts that, with no parallel `candidates` field. Still to come in OnePedigree: an optional `basis` per slot, and an opt-in view drawing candidates as weighted branches (Science K308). `kind` on ParentReference is accepted in principle (Science K309). No dates yet. The original proposal follows.

From OneLineage (Genealogy lead), 2026-11-10. For OnePedigree's maintainers (Science) to accept, change or decline. OneLineage only draws pedigrees through `@captiveorigins/onepedigree-react`, so it adopts whatever OnePedigree releases, and changes nothing in OnePedigree itself.

## Why

OneLineage builds family trees from DNA, and reports odds rather than single answers. Two things it needs to draw, OnePedigree can't express yet. Both come up in animal pedigrees too.

## 1. Candidate parents with weights

**Today:** `Parentage.parents` lists identified contributors. A parent is either recorded or it isn't.

**Proposal:** an optional, additive field for "one of these, with these weights":

```ts
type CandidateParents = {
  role: ParentRole              // e.g. 'father' or 'sire'
  candidates: readonly { individual: IndividualId; weight: number }[]  // weights sum to at most 1; the rest is "someone else"
  basis?: string | null          // e.g. "DNA hypothesis run 2026-11-10" or "multi-sire mating"
}
type Parentage = {
  parents: readonly ParentReference[]
  candidates?: readonly CandidateParents[]   // new, optional
  reproductiveMode?: ReproductiveModeId | null
  cohort?: CohortId | null
}
```

- **Validation:** each weight is from 0 to 1, and the weights sum to at most 1. A candidate's role can't also be filled in `parents`.
- **Views:** the candidates for one role are drawn as alternative branches side by side, each labelled with its weight ("94%"). They use a dashed connector, and the remainder shows as "other, 5%". Traversal follows only the recorded parents by default, plus an option to include candidates, weighted.
- **Animal uses:**
  - litters from multi-sire matings
  - colony animals with uncertain sires
  - parentage tests that report likelihoods

## 2. Biological and legal parents side by side

**Today:** roles are free text, so "biological father" and "legal father" can already be recorded. But the views can't tell the two apart.

**Proposal:** an optional `kind` on `ParentReference`:

```ts
type ParentKind = 'biological' | 'legal' | 'adoptive' | 'social' | 'donor' | (string & {})
type ParentReference = { individual: IndividualId; role?: ParentRole | null; kind?: ParentKind | null }  // kind: new, optional
```

- **Views:** biological links are solid. Legal-only, adoptive and social links are dashed. A toggle shows **Biological**, **Recorded** or **Both**. With Both, a person with two fathers shows both, labelled.
- **Traversal and inbreeding:** these use biological links when `kind` is given, and all links otherwise. That keeps today's behaviour for data without `kind`.
- **Animal uses:** foster dams, and surrogate or donor arrangements.

## 3. Status styling (likely no change needed)

OneLineage marks people as confirmed, supported, hypothesis or placeholder. Host data (`data`) plus the CSS variables may already cover this. Science can confirm.

## Compatibility

Both fields are optional. Existing documents and views are unchanged. The JSON schema gains two optional properties, and whether that needs a schema-version bump is OnePedigree's call.

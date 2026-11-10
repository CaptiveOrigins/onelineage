# ADR 0003: Safeguards against wrong results

Status: accepted, 2026-11-10

Each safeguard is enforced in code and covered by tests. A promise that's only written down is a bug.

| # | Safeguard | Enforced by |
| --- | --- | --- |
| S1 | Blindness | The unblind gate (ADR 0002) |
| S2 | Planted test families | Simulated families with known answers. Engine changes must find the planted answers before any real data is used. |
| S3 | Same inputs, same results | Fixed, recorded random seeds; reference runs are compared exactly |
| S4 | Import checks fail loudly | Expected columns and types, values in range (shared cM 6 to 3,600; longest segment no bigger than the total), known date formats |
| S5 | Count reconciliation | Unique IDs; previous export + new − gone = this export; the row count equals the count the service showed, when recorded |
| S6 | Spot checks against the source | A sample of matches compared with the service's own pages, where the terms register allows it |
| S7 | Genetic sanity across kits | Family kits share cM in range for their DNA relationship; side assignments agree across kits |
| S8 | Stability report | A run stops for review if more than a few percent of placed people change lines |
| S9 | Claims checked against data | Every match cited in a theory is checked against the stored observations |
| S10 | People decide conclusions | A theory's status changes only with the user's approval, which is logged |
| S11 | Backups and rebuild check | The cache is backed up before imports; a full rebuild from the library must equal the live cache |
| S12 | Provenance stamp | Every output carries the engine version, the input checksums and the seeds |

Unknown stays unknown: a match that doesn't clearly fit one line is "unplaced", never guessed.

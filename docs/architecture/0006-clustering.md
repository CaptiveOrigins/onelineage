# ADR 0006: Grouping matches from the DNA alone

Status: accepted, 2026-11-10

## Context

The first job of the analysis is to sort a kit's matches into family lines before any tree is read (ADR 0002). The method was first worked out in Python scripts kept privately, on top of `leidenalg`, `igraph` and `networkx`. OneLineage is TypeScript and runs on the user's Mac with no Python, so the method is ported to `@captiveorigins/onelineage-analysis`, with its own Leiden implementation.

## Decision

The package reads the `MatchObservation` and `SharedMatchLink` records the importers produce. It reads no names, trees, notes or groups. There are four steps.

**1. The network.** One node per match from 20 to 400 cM that has its own shared-match list. Matches the service marks as on both sides are left out. One edge per shared-match link between two nodes, weighted by the cM the two matches share with each other (the larger figure, if the pair is listed twice). Leiden sees log(1 + cM), so a few very close pairs don't swamp the rest. Matches with no links are left out. Every match that's left out is listed with its reason.

**2. Consensus groups.** Leiden is run 30 times, at resolutions 0.5, 1 and 1.5, with seeds 0 to 9 at each. Two matches are joined when they shared a group in at least 60% of the runs, and the groups are the connected pieces of that graph. Each match gets a stability: its average share of runs with the members of its group. Groups get neutral IDs (`G1`, `G2` and so on), numbered by size.

**3. Two-way splits per side.** Each side, as the service labels it, is split into its two best-separated halves, and then each half again. Only matches with 2 or more segments take part. A single-segment match often shares one old segment with a large, tightly linked set of distant cousins, and that pile-up can outweigh a real grandparent line. For each split:

- Only the largest connected piece is split. Matches outside it are marked `?`.
- Leiden runs 8 times. Each run searches resolutions from 0.0005 to 1, halving on a log scale over 30 steps, for the lowest that gives two groups with the smaller holding at least 8% of the piece.
- The runs are aligned to the first, and each match takes the majority label. A tie leaves it at the level above.
- The split is kept only if its modularity, on raw cM, is at least 0.10 and the runs agree on at least 85% of matches.
- The heavier half (more summed cM with the kit) is `.1`.

Single-segment matches are then attached to the path most of their links point to, among the same side's multi-segment matches. If they link mostly to each other, they go to `<side>.single`. With no links or a tie, they go to `<side>.?`.

**4. Seeded placement.** A person names a few matches they know are on each line. Every other match in the pool is scored by its links to matches already placed, adding log(1 + cM) per link. A match is placed only if its best line scores at least twice the runner-up, and at least 2 × log(1 + 20). Otherwise it's "unplaced", never guessed. Rounds repeat until nothing changes, at most 10.

**Leiden** is written from the paper (Traag, Waltman and van Eck, 2019), with the refinement phase that guarantees connected communities. It optimises modularity with a resolution parameter, which is what `leidenalg` calls `RBConfigurationVertexPartition`. The refinement's randomness θ is 0.01. No third-party code is copied or vendored.

**Same inputs, same results (S3).** Every random choice draws from a seeded generator. Nodes are ordered by match ID, so the order of the input records doesn't matter. `clusterKit` stamps each run with the engine version, the SHA-256 of every input file, and the resolutions, seeds and threshold used (S12).

### Where the port differs from the scripts

- Split labels are a majority vote over the aligned runs. The scripts took the first run's labels.
- Single-segment matches are attached by their links to multi-segment matches on their own side. In the scripts, matches attached earlier in the loop also counted, so the result depended on file order. A tie now gives `?`; the scripts picked one.
- Different random generators mean the port doesn't reproduce `leidenalg` run for run. The groupings agree closely (below).

## Checked against the scripts

On planted families from `pnpm simulate`, the scripts and the port were run side by side, with the scripts' input paths changed in a scratch copy. Agreement is measured with the adjusted Rand index (1 is the same grouping).

| Families | Consensus groups | Side-split paths | Seeded placement |
| --- | --- | --- | --- |
| Seeds 1–10, the simulator's default family (37–78 networked matches each) | 1.0 for all 10 | 1.0 for all 10 (also with the smallest split lowered to 8, so the splits run) | identical, match for match |
| Seeds 1–10, a denser family (test rate 0.7, 80–152 matches each) | 1.0 for all 10 | 1.0 for 7; 0.944, 0.973 and 0.951 for seeds 1, 7 and 9 | identical, match for match |

The three path differences are borderline splits. In one, the scripts' runs agreed on 81% of matches, just under the 85% bar, so they didn't split, while the port's runs agreed on all of them and did. In the other two, a side's halves came out a few matches different, and in one of them that changed whether the next split ran.

On a made-up network of 2,000 matches and 18,650 links, the consensus step takes about 0.4 seconds.

## Limits

- **It needs shared-match lists.** Matches under 20 cM have none at the services that set that floor, so they never enter the network and are never grouped by this method. That keeps unrelated small matches out, but it also leaves out real small matches. Placing them needs another method.
- **Very close family is left out.** Above 400 cM a match shares with nearly everyone on its side and would tie groups together.
- **The side splits use the service's side labels.** Matches labelled as on both sides, or unassigned, take no part in step 3. Groups from step 2 don't use the labels.
- **Only the largest piece of a side is split.** Once matches above 400 cM are left out, a side's grandparent lines are often not linked to each other at all. Then the first split runs inside one grandparent's line, and the other line is marked `?`. The consensus groups still keep the lines apart. Path levels line up only roughly with generations.
- **Small sides aren't split.** A side needs at least 20 connected multi-segment matches. In the simulator's default family most sides have fewer, so their splits report `too-small`.
- **Seeded placement is only as good as its seeds.** Seeds that come from a tree can be used only after unblinding (ADR 0002). A match related through both great-grandparents of a line, such as a descendant of a grandparent's full sibling, may be placed on either line or left unplaced. Placement says which line a match links to most. It doesn't say the match is related only through that line.
- **An intermarried community shows as one group.** Its members are related many ways over, and this method doesn't tell which community family a match comes through.
- **Misattributed parentage shows up indirectly.** A recorded parent's family that isn't biologically related shares no DNA, so it never forms a group. What shows is a group, or a seeded line, that the tree can't explain.
- **Memory grows with the square of the network.** The co-assignment table for 2,000 matches takes about 32 MB.
- **Tested only on planted families.** The simulator's own limits apply (see the README). Nothing here has been run on real data.

## Consequences

- Groups come from the DNA alone, with stated, tested limits, and can be rebuilt exactly from the same files and seeds.
- Any change to the method must still find the planted answers (S2) and should be compared against the previous version with the adjusted Rand index (S8).

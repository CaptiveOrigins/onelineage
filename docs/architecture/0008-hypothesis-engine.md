# ADR 0008: The hypothesis engine scores whole trees by simulation

Status: accepted, 2026-11-10

## Context

People ask questions like "who is this person's biological father?". There are several candidates, and the evidence is the amount of DNA shared with many matches. OneLineage reports odds, never a single answer (principle 4).

## Decision

- **A hypothesis is a complete small tree:** who is whose biological parent. It covers the person, their matches, and the ancestors that connect them.
- **Scoring:** for each hypothesis, inheritance is simulated through that exact tree hundreds of times, from a recorded seed. Each observed shared-cM value is scored against its simulated values: a point mass for "not a match" (under 8 cM), and a smoothed density above that. Log-likelihoods add up across matches, priors multiply in, and the results are normalised into posterior odds.
- **Why simulation:** a fixed table of cM ranges by relationship can't represent this tree's half relationships, double cousins or marriages within a family. Simulation through the tree itself can.
- **What comes back:** each match's contribution and the simulated median, so a person can see why one hypothesis won.

## Limits, stated in the code and the app

- Matches are treated as independent given the tree. Matches from one family share ancestors, so the odds can be overconfident. The app words them as strength of evidence, and shows each match's part.
- The simulation has no crossover interference and no Timber-style weighting.
- People outside the tree are assumed unrelated.
- Results depend on the hypotheses offered. A true answer that wasn't offered can't win.

## First check (planted family, seed 21, 300 samples)

There were three candidates for the misattributed father: the recorded man, the biological man, and the biological man's brother. The engine gave: biological father 98.5%, his brother 1.5%, recorded father under 0.1%.

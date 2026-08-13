# Research basis

Background research behind Choice Timer's design and the ideas in [IDEAS.md](IDEAS.md). Not a literature review — just enough to know the app's premise isn't just a hunch, and to ground specific feature decisions.

## Choice overload and decision fatigue

Limited cognitive capacity gets overwhelmed by too many options: each option requires effort to evaluate, and once that capacity is exceeded, people become either more impulsive or more paralyzed — avoiding a choice altogether rather than making a bad one. This is why the app caps custom options at 6, and why setup itself should stay simple (see the "setup-time presets" idea).

- [Analysis Paralysis — Learning Loop](https://learningloop.io/plays/psychology/analysis-paralysis)
- [The Neuroscience of Decision Fatigue — Global Council for Behavioral Science](https://gc-bs.org/articles/the-neuroscience-of-decision-fatigue/)
- [Decision paralysis — Wikipedia](https://en.wikipedia.org/wiki/Decision_paralysis)

## Time pressure and decision quality

Under time constraint, people shift from slow, systematic deliberation toward faster, intuitive/heuristic judgment — this is the mechanism the whole app leans on. But the evidence is mixed, not uniformly positive: time pressure can also induce perceptual narrowing, more anxiety, and reduced information search, which can hurt decision quality rather than help it in some contexts.

Practical implication: the countdown should nudge, not stress. This is the basis for the "gentler default timeout escalation" idea — keep the default alarm/flash mild, with intensity as an opt-in rather than the default.

- [Time pressure effects on decision-making in intertemporal loss scenarios — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11512456/)
- [Time Pressure Perception and Decision Making (ResearchGate)](https://www.researchgate.net/publication/270757523_Time_Pressure_Perception_and_Decision_Making)
- [Effects of time-pressure on decision-making under uncertainty — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0001691800000330)

## Levitt's coin-flip experiment

Steven Levitt ran a large field experiment (~22,500 participants via FreakonomicsExperiments.com) where people facing a stuck decision — often a big one, like quitting a job or ending a relationship — flipped a coin to help decide. People told by the coin to make the change were significantly more likely to actually make it, and reported being measurably happier both 2 months and 6 months later than those told to keep the status quo. Levitt's interpretation: people tend to be excessively cautious about change, and an external, impartial forcing device helps them overcome that.

This is the closest real-world precedent for what Choice Timer does — substituting a self-imposed deadline for the coin as the forcing mechanism — and it's also the direct model for the "post-choice satisfaction check" idea: Levitt's methodology was literally a follow-up happiness survey.

- [Heads or Tails: The Impact of a Coin Toss on Major Life Decisions and Subsequent Happiness — NBER Working Paper 22487](https://www.nber.org/papers/w22487)
- [To Change, or Not to Change? Just Flip a Coin — NBER Digest](https://www.nber.org/digest/oct16/change-or-not-change-just-flip-coin)
- [Big Think summary](https://bigthink.com/neuropsych/decision-making-process/)

## Maximizers vs. satisficers

Barry Schwartz's research distinguishes "maximizers" (people who try to find the objectively best option) from "satisficers" (people who accept the first option that's good enough). Maximizers tend to report lower happiness, optimism, self-esteem, and life satisfaction, in part because chasing an optimum invites regret and comparison. Choice Timer is, by design, a satisficing tool — it deliberately cuts off optimization. This is the basis for keeping the app's tone and copy framed around "good enough, move on" rather than implying it found the correct answer.

- [Maximizers versus satisficers: Decision-making styles, competence, and outcomes — Judgment and Decision Making (Cambridge Core)](https://www.cambridge.org/core/journals/judgment-and-decision-making/article/maximizers-versus-satisficers-decisionmaking-styles-competence-and-outcomes/065A9507C3F1F1E51B6C24D274833EA1)

## Implementation intentions

Peter Gollwitzer's research on "implementation intentions" shows that simple if-then plans ("if situation Y occurs, I will do Z") substantially improve follow-through on a goal or decision compared to just holding an intention. A meta-analysis of 94 independent tests (Gollwitzer & Sheeran, 2006) found a mean effect size of d = 0.65 — a fairly large effect for a low-cost psychological intervention. This is the basis for the "follow-through prompt" idea: asking "when will you do this?" with a quick pick right after a choice is made, to convert the decision into an actual plan.

- [Implementation Intentions: Gollwitzer & Sheeran 2006 summary — Goals & Progress](https://goalsandprogress.com/implementation-intentions-gollwitzer-how-to/)
- [Implementation Intentions (PDF) — Peter M. Gollwitzer](https://cancercontrol.cancer.gov/sites/default/files/2020-06/goal_intent_attain.pdf)

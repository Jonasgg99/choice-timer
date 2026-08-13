# Idea bank

Backlog of features and improvements for Choice Timer. Not a roadmap — just a place to collect ideas before deciding what to build. See [RESEARCH.md](RESEARCH.md) for the theoretical basis behind the research-grounded ideas below.

## Ideas

Rough effort tags: XS (~minutes), S (~an hour), M (a session), L (multi-session).

### Proposed next: rotating placeholder text (S)
Typewriter-in / backspace-out animation cycling through example questions in the empty question field, to prompt users toward different use cases. Candidate rotation set:
- "Should I go for a bike ride?"
- "What should I make for dinner?"
- "Should I apply for this job?"
- "Coffee or tea?"
- "Should I text them back?"
- "What movie should we watch tonight?"
- "Should I take the promotion?"
- "Should I go to the gym today?"
- "Which apartment should I pick?"
- "Should I say yes to this?"

Mechanics: type ~40-60ms/char, hold ~1.5-2s, backspace ~25-35ms/char (faster than typing), advance to next question, loop. Implemented via `input.placeholder` updates on an interval — no extra DOM needed. Stops mattering once the user types (native placeholder hides automatically).

### Post-choice satisfaction check (S-M)
After landing on the result screen, ask "Happy with this?" (thumbs / yes-no). Mirrors the follow-up methodology from [Levitt's coin-flip experiment](RESEARCH.md#levitts-coin-flip-experiment). v1 = immediate gut-check only; a delayed re-check (e.g. a day later) would need persistence + a reason to return, which is more than this app currently does — flag as a separate, bigger idea if wanted.

### Choice history (M)
Log past questions, options, chosen answer, and how it resolved (tapped / overtime / auto-picked), stored in `localStorage`. Fully client-side, no account or backend needed. Pairs naturally with the satisfaction check (store the rating alongside each entry).

### Follow-through prompt (S)
Right after the result, a lightweight "if-then" prompt: "When will you do this?" with quick-pick chips (Now / Today / This week). Directly implements the [Gollwitzer implementation-intentions effect](RESEARCH.md#implementation-intentions), no persistence required to be useful.

### Gentler default timeout escalation (S)
[Time-pressure research](RESEARCH.md#time-pressure-and-decision-quality) is mixed on whether hard pressure improves or hurts decisions — heavy pressure can spike anxiety. Consider a softer default alarm/flash, with a more intense "urgent mode" as an opt-in rather than the default.

### Satisficing-reinforcing copy pass (XS)
Wording nudge across result/timeout screens so the app reads as "good enough, move on" rather than implying it found the objectively correct answer — consistent with the [maximizer/satisficer research](RESEARCH.md#maximizers-vs-satisficers).

### Practical / non-research-driven
- Mute toggle for the timeout alarm sound (XS) — public-use practicality.
- Setup-time question presets ("Food", "This or that", "Big decision") to prefill common option sets and reduce setup friction becoming its own micro-paralysis point (S).
- Keyboard shortcuts: Enter to start, number keys to pick an option (XS).
- Shareable result as copyable text, e.g. "I gave myself 15s: Pizza" (S).
- PWA manifest for "add to home screen" (S) — previously discussed as a later step.

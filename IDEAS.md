# Idea bank

Backlog of features and improvements for Choice Timer. Not a roadmap — just a place to collect ideas before deciding what to build. See [RESEARCH.md](RESEARCH.md) for the theoretical basis behind the research-grounded ideas below.

Ideas move to **Shipped** as soon as they're implemented, so this file always reflects what's actually built vs. still backlog.

## Shipped

### Rotating placeholder text
Typewriter-in / backspace-out animation cycling through example questions in the empty question field, to prompt users toward different use cases. Rotation set: bike ride, dinner, job application, coffee/tea, texting back, movie night, promotion, gym, apartment choice, generic yes/no. Implemented via `input.placeholder` updates on a timer loop (`cyclePlaceholder` in `app.js`), pausing while the field has a value and resuming from where it left off once cleared.

## Ideas

Rough effort tags: XS (~minutes), S (~an hour), M (a session), L (multi-session).

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

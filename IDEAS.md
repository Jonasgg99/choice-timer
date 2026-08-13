# Idea bank

Backlog of features and improvements for Choice Timer. Not a roadmap — just a place to collect ideas before deciding what to build. See [RESEARCH.md](RESEARCH.md) for the theoretical basis behind the research-grounded ideas below.

Ideas move to **Shipped** as soon as they're implemented, so this file always reflects what's actually built vs. still backlog.

## Shipped

### Rotating placeholder text
Typewriter-in / backspace-out animation cycling through example questions in the empty question field, to prompt users toward different use cases. Rotation set: bike ride, dinner, job application, coffee/tea, texting back, movie night, promotion, gym, apartment choice, generic yes/no. Implemented via `input.placeholder` updates on a timer loop (`cyclePlaceholder` in `app.js`), pausing while the field has a value and resuming from where it left off once cleared.

## Ideas

Ordered by priority (highest first) — my judgment call, balancing effort, how directly research-backed the idea is, and how much it extends the app's core value. Rough effort tags: XS (~minutes), S (~an hour), M (a session), L (multi-session).

### 1. Shareable choice links, for group decisions (L)
*Designed, not yet implemented — see [SHARING-DESIGN.md](SHARING-DESIGN.md).* Share a link to a question — from setup and from the live countdown — so a group can vote together (meal plans, movies, trips), with waiting-room support, live participant handles/counts, host-only question control, and new questions reusable on the same link without re-sharing. Supersedes the "shareable result as copyable text" idea below, which is now folded into this.

### 2. Post-choice satisfaction check (S-M)
After landing on the result screen, ask "Happy with this?" (thumbs / yes-no). Mirrors the follow-up methodology from [Levitt's coin-flip experiment](RESEARCH.md#levitts-coin-flip-experiment). Cheap, and directly validated by real research. v1 = immediate gut-check only; a delayed re-check (e.g. a day later) would need persistence + a reason to return, which is more than this app currently does — flag as a separate, bigger idea if wanted.

### 3. Follow-through prompt (S)
Right after the result, a lightweight "if-then" prompt: "When will you do this?" with quick-pick chips (Now / Today / This week). Directly implements the [Gollwitzer implementation-intentions effect](RESEARCH.md#implementation-intentions) (d=0.65 in meta-analysis) — cheap to build, strong evidence behind it.

### 4. Satisficing-reinforcing copy pass (XS)
Wording nudge across result/timeout screens so the app reads as "good enough, move on" rather than implying it found the objectively correct answer — consistent with the [maximizer/satisficer research](RESEARCH.md#maximizers-vs-satisficers). Trivial effort, immediate polish.

### 5. Gentler default timeout escalation (S)
[Time-pressure research](RESEARCH.md#time-pressure-and-decision-quality) is mixed on whether hard pressure improves or hurts decisions — heavy pressure can spike anxiety. Consider a softer default alarm/flash, with a more intense "urgent mode" as an opt-in rather than the default.

### 6. Mute toggle for the timeout alarm (XS)
Public-use practicality — cheap, obviously useful, no dependencies.

### 7. Choice history (M)
Log past questions, options, chosen answer, and how it resolved (tapped / overtime / auto-picked), stored in `localStorage`. Fully client-side, no account or backend needed. More effort than it looks (schema + a view for it) — best done after the satisfaction check exists, so ratings can be stored alongside each entry.

### 8. Setup-time question presets (S)
Preset categories ("Food", "This or that", "Big decision") to prefill common option sets. Lower priority now that the rotating placeholder already nudges toward different use cases — this would be a smaller marginal improvement.

### 9. Keyboard shortcuts (XS)
Enter to start, number keys to pick an option. Nice-to-have polish, not blocking anything.

### 10. PWA manifest for "add to home screen" (S)
Worth doing once the app's feature set feels more settled — installability matters more once there's a reason to open it often.

### Superseded
- ~~Shareable result as copyable text~~ — folded into idea #1 above; a real share link is a strictly better version of this.

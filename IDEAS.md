# Idea bank

Backlog of features and improvements for Choice Timer. Not a roadmap — just a place to collect ideas before deciding what to build. See [RESEARCH.md](RESEARCH.md) for the theoretical basis behind the research-grounded ideas below.

Ideas move to **Shipped** as soon as they're implemented, so this file always reflects what's actually built vs. still backlog.

## Shipped

### Rotating placeholder text
Typewriter-in / backspace-out animation cycling through example questions in the empty question field, to prompt users toward different use cases. Rotation set: bike ride, dinner, job application, coffee/tea, texting back, movie night, promotion, gym, apartment choice, generic yes/no. Implemented via `input.placeholder` updates on a timer loop (`cyclePlaceholder` in `app.js`), pausing while the field has a value and resuming from where it left off once cleared.

### Shareable choice links, for group decisions
Live via Firebase Realtime Database — see [SHARING-DESIGN.md](SHARING-DESIGN.md) for the full design and its since-updated details. Share a room (from setup or an active countdown) so a group can vote together on a question, with a waiting room, live participant handles/counts, host-only question control, and reusable room links for follow-up questions without re-sharing — inviting more people works from any point in a room's lifecycle via a persistent button, not just at creation. Sharing never auto-starts the countdown — that's a separate host action, so there's time to invite people first — and uses the native OS share sheet where available (Messages, WhatsApp, Instagram DM, etc.), falling back to a clipboard copy; canceling the native share sheet cleanly aborts without creating anything or disturbing a running solo countdown. Voting supports unselecting your own choice, and once every current participant has voted (and it isn't a tie), a 5-second grace period runs before locking in, so there's still a moment to change your mind — a tie never triggers this early lock-in, since settling a tie by random pick after 5 seconds defeats the point of asking everyone to vote; the main countdown remains the fallback for anyone who never votes, or for ties that never resolve on their own. "Start over" while in a room now actually leaves it — unsubscribes, removes your presence entry, clears the room hash — instead of quietly staying subscribed and getting pulled back in the moment the host posts a new question; the question field also resets to blank on restart, in both solo and room mode. A post-build security review found and fixed two real authorization gaps in the Firebase rules (any authenticated visitor could otherwise forge any room's result or rewrite its deadline) — see SHARING-DESIGN.md's "Post-launch security review" section. Merged to `main` and live.

### Post-result reflection: satisfaction check, follow-through prompt, calendar handoff
Shares markup with group rooms (`followup.js` renders into the same result view both modes use) but is solo-only in practice: a "Happy with this?" gut-check (mirrors the [Levitt coin-flip follow-up methodology](RESEARCH.md#levitts-coin-flip-experiment)) — answering "not really" surfaces the option(s) not chosen as a concrete note for next time, rather than just an empty acknowledgment; and a "When will you do this?" prompt (Now / Today / Custom — implements [Gollwitzer implementation-intentions](RESEARCH.md#implementation-intentions)) where "Today" reveals a time picker and "Custom" a full date/time picker, generating both a downloadable `.ics` file (works with any calendar app, no API integration) and a one-click "Add to Google Calendar" link for the common case. Both blocks are hidden in group rooms — they're framed around one person's own decision/follow-through, which doesn't map onto a group reaching consensus together. Also: the switch from countdown to result now has a brief pause instead of being instant, and result/timeout copy across both modes was reworded to read as "good enough, move on" rather than implying the app found the objectively correct answer (consistent with the [maximizer/satisficer research](RESEARCH.md#maximizers-vs-satisficers)). A "Mute the timeout alarm" setting (persisted via `localStorage`) was added alongside these.

### Recently-active rooms, and host departure/ownership transfer
See [SHARING-DESIGN.md](SHARING-DESIGN.md)'s "Host departure and ownership transfer" and "Recently-active rooms" sections for the full design. The setup screen now remembers rooms you've joined (a small `localStorage` list) and offers to rejoin any of them — a room never truly expires, so all remembered rooms are shown (not just ones with someone in them right now), each labeled with its live participant count or "empty right now"; reopening an empty one is exactly how an abandoned room comes back to life. Never loads Firebase for a first-time visitor who has nothing remembered. Separately: if a room's host leaves (via "Start over"/"Leave room" or their tab disconnecting) while others remain, host status now transfers automatically to the longest-present remaining participant, rather than leaving the room stuck with nobody able to post questions or extend. Enforced via a small Firebase rules change (any current participant may claim `hostUid`, but only once the existing host is confirmed absent) plus a client-side convention for *which* participant claims it, since Realtime Database rules can't verify "oldest" mathematically. Verified directly: non-participants still can't claim host, a participant can't steal it while the real host is present, and a legitimately-transferred former host loses their write access immediately.

Two bugs found and fixed after initial testing: the "New question" button's visibility only updated inside a dedup guard meant to stop the result-reveal animation from replaying, so a participant already viewing a result screen when the host left never saw it appear once they inherited host status — fixed by moving that update outside the guard. "Start over"/leaving a room also left a stale "Shared — waiting for people to join…" status message on screen — `leaveRoom()` now clears it (and the recent-rooms prompt) along with everything else. The restart button also now reads "Leave room" while viewing a group result, "Start over" in solo mode, since the two actions mean different things.

## Ideas

Ordered by priority (highest first) — my judgment call, balancing effort, how directly research-backed the idea is, and how much it extends the app's core value. Rough effort tags: XS (~minutes), S (~an hour), M (a session), L (multi-session).

### 1. Simple chat below the voting area (M)
A lightweight chat/message thread under the options in a group room, so participants can talk through the decision ("I'm fine with either", "let's do sushi") without leaving the app. Reuses the same room/participant/handle plumbing already built for rooms — just another live-synced list under `/rooms/{roomId}/messages`, keyed by the same anonymous `uid` and Stand-name handle. No new backend concept, just more of what's already there.

### 2. Queue multiple questions before inviting the group (M)
Let the host compose several questions up front (e.g. "starter, main, dessert" or a whole trip's worth of decisions) before sharing the room link, so the group moves through them without the host having to compose live each time. Fits naturally into the existing room/question separation — just a list of pending questions on the room instead of one at a time. Note: this is one of the places the app starts to resemble Kahoot's shape (host composes ahead of time, group joins a room, works through a sequence) — worth being deliberate about; the decision-under-pressure framing (no scoring, no "correct" answer) is what keeps it a different tool, not a quiz platform.

### 3. Image (and other file) attachments on options (M-L)
Let an option carry an image (or other small file) alongside its text — useful for visual choices like restaurants, outfits, or destinations. Meaningfully bigger than it looks: needs file storage (Firebase Storage, a new dependency beyond the Realtime Database already in use), upload UI, size/type limits, and some thought about moderation since a public room with unauthenticated-but-anonymous uploads is easier to abuse than plain text. Worth doing once the core room feature has had real use, not before.

### 4. "Finish session" summary (M)
*Needs question history the room doesn't currently keep.* A host-triggered "Finish session" action that closes out the room and shows everyone a summary of every question asked and what was decided across the whole session — handy for reviewing a whole evening's worth of group decisions (dinner, then movie, then who's driving) at a glance. Currently each new question overwrites the last — `question`/`options`/`votes`/`result` get cleared the moment a new one is posted — so this needs an append-only history log on the room first (e.g. `/rooms/{roomId}/history`, one entry per resolved question). Likely worth building alongside idea #2 (queuing multiple questions), which would want the same underlying list. Distinct from idea #8 (Choice history) below — that one's a personal, solo-mode, localStorage log; this is shared and session-scoped, not a personal record.

### 5. Advanced option: collaborative question/option authoring in group rooms (M-L)
An opt-in, host-enabled "advanced" setting that lets participants suggest or add to the question/options themselves, instead of the current default of host-only authorship. Bigger than it looks: the room's Firebase security rules deliberately restrict question/option writes to the host (tightened in the post-launch security review — see `FIREBASE-RULES.json`), so this needs a real rules change — e.g. a room-level `collaborativeAuthoring: true` flag the rules check to relax the host-only requirement when the host has explicitly turned it on — not just a UI toggle. Should default off.

### 6. "Toss a coin" / "Roll the dice" as an alternative resolution (M)
For Yes/No questions, an alternative "Toss a coin" interaction; for multi-option questions, "Roll the dice" — a more playful, tactile alternative to just tapping an option or the app silently auto-picking. Leans directly into the [Levitt coin-flip research](RESEARCH.md#levitts-coin-flip-experiment) already grounding this app's premise — could reskin the existing auto-pick resolution moment (both solo and group modes) with a small physical-feeling animation instead of an instant reveal, reinforcing the "let something outside yourself decide" framing rather than just being a random-number generator.

### 7. "Find out more" button — the research behind the method (S)
A button (setup screen is the natural home) that surfaces why this app works the way it does — decision fatigue, the Levitt coin-flip study, satisficing vs. maximizing — pulling from [RESEARCH.md](RESEARCH.md) rather than leaving that context only on GitHub. Could be a simple expandable section or modal with a condensed version, linking out to the full doc for anyone who wants more.

### 8. Choice history (M)
Log past questions, options, chosen answer, and how it resolved (tapped / overtime / auto-picked), stored in `localStorage`. Fully client-side, no account or backend needed. More effort than it looks (schema + a view for it) — now that the satisfaction check exists, could optionally store that rating alongside each entry too.

### 9. Gentler default timeout escalation (S)
[Time-pressure research](RESEARCH.md#time-pressure-and-decision-quality) is mixed on whether hard pressure improves or hurts decisions — heavy pressure can spike anxiety. Consider a softer default alarm/flash, with a more intense "urgent mode" as an opt-in rather than the default.

### 10. Custom URLs (S-M)
Two related but separate concerns worth scoping individually when picked up: (a) human-readable/memorable room codes instead of random 6-character strings (e.g. host picks a slug, or auto-generated word-based codes), and (b) a custom domain for the app itself instead of the default `jonasgg99.github.io/choice-timer` GitHub Pages URL.

### 11. Sound FX redo (S-M)
Current sounds (timeout beep, success chime) are simple Web Audio oscillator tones — functional but minimal. Worth a proper pass once the app's interactions feel settled: richer envelopes/timbres, still synthesized (no audio asset files needed, keeps the zero-dependency approach) unless a specific sound calls for a real clip.

### 12. Setup-time question presets (S)
Preset categories ("Food", "This or that", "Big decision") to prefill common option sets. Lower priority now that the rotating placeholder already nudges toward different use cases — this would be a smaller marginal improvement.

### 13. Keyboard shortcuts (XS)
Enter to start, number keys to pick an option. Nice-to-have polish, not blocking anything.

### 14. PWA manifest for "add to home screen" (S)
Worth doing once the app's feature set feels more settled — installability matters more once there's a reason to open it often.

### 15. "Support the creator" button (XS)
Small link/button to a tip or donation page (Ko-fi, Buy Me a Coffee, GitHub Sponsors, etc.). Purely cosmetic/optional, needs a platform picked before building.

### 16. UI overhaul (L)
General visual design pass — the app is functional but plain. Open-ended enough that it needs its own scoping/direction session before starting, rather than being picked up as a quick task.

### 17. Consider renaming the project/repo to "Laterbase" (decision only — rename itself is quick)
Naming idea floated: "Laterbase" as a possible new name (a pun on Firebase, now that the app has one, plus "deciding things later"). Not acted on — just logged for a deliberate decision at some point. GitHub's repo transfer/rename keeps full history and auto-redirects old links, so there's no real cost to doing this whenever it's decided (see earlier discussion on repo transfers in this project).

### Superseded
- ~~Shareable result as copyable text~~ — folded into the shipped shareable-links feature above; a real share link is a strictly better version of this.

# Group sharing — design

Design for shareable, live group-decision rooms. Referenced from [IDEAS.md](IDEAS.md) idea #1. Implemented on the `feature/group-voting-rooms` branch (not yet merged to `main`); this doc reflects the current implementation, refined a few times after real use and a security review.

## Goal

Share a room (from setup or from an active countdown) so a group can vote together on a question — meal plans, movies, trips. Sharing never starts anything by itself: it just creates the room so people can join, with the host starting the countdown explicitly once ready. After a decision, the host can post a new question to the same room without sharing a new link.

## Why this needs a backend

The existing app is a static, dependency-free site. A link alone is a snapshot — it can't notify already-open tabs about a new question. Making "no re-share needed" work requires a live, shared data store all participants' devices are subscribed to. That's the one unavoidable architecture change here.

**Chosen backend: Firebase Realtime Database.** A room is a small, flat JSON blob with live listeners — exactly RTDB's use case. No build step (CDN module import), generous free tier, and built-in server-time offset correction so countdowns stay accurate across devices with clock drift. Firestore/Supabase were considered but are better suited to structured queries at scale, which this doesn't need.

## Identity, without accounts

Firebase **Anonymous Authentication** gives each browser a stable random `uid` on load — no email, password, or visible sign-up. Used for two things:

- **Host enforcement**: the room stores `hostUid`. Firebase Security Rules reject question/option/state writes from anyone whose `auth.uid` doesn't match `hostUid` — enforced server-side, not just hidden in the UI.
- **Per-participant votes and presence**, keyed by `uid`.

## Data model

```
/rooms/{roomId}
  hostUid: string                 # set once at room creation, immutable after
  question: string
  options: string[]
  durationMs, extensionMs, maxExtensions, autoPick   # set by host per-question
  state: "waiting" | "countdown" | "timeout_waiting" | "result"
  endTime: number                 # absolute epoch ms; each client derives its own countdown display
  extensionsRemaining: number
  votes: { [uid]: optionIndex }   # live, each participant can only write their own key
  allVotedAt: number | null       # set once, host-only, when every current participant has voted
  result: { answer, meta }        # meta: "voted" | "tie-break" | "auto-picked" | "overtime"

/rooms/{roomId}/participants/{uid}
  handle: string                  # randomized display name, assigned on join
  isHost: boolean
  # presence tracked via onDisconnect() — entry auto-removes when a tab disconnects
```

## Room lifecycle and screens

A room is a persistent space; a question is ephemeral content posted into it.

- **`waiting`**: room exists, no active question. Non-host viewers see a waiting screen: participant count + handles ("3 people here: Silver Fox, Blue Falcon, Clever Otter — waiting for the host"). The host instead sees the question-composer form (question/options/timer), with the live participant list alongside it. **"Share" always lands here** — a room is created in `waiting` regardless of whether a question was already typed, so the host has time to invite people before anything starts. Sharing uses the native Web Share API (opens the OS share sheet — Messages, WhatsApp, Instagram DM, etc., whatever's installed) where available, falling back to a clipboard copy otherwise.
- **`countdown`**: host has explicitly posted a question (a separate action — "Ask the group" — from sharing itself). Every participant (present now, or joining late) sees the countdown and options, and can vote — tapping an option writes their vote under their own `uid`; tapping the *same* option again removes it (unselect). Votes can be changed freely until resolution. Live per-option vote tallies are shown to everyone as votes come in.
- **`timeout_waiting`**: mirrors the solo app's lock-and-wait behavior, now driven by votes instead of a single tap — see resolution rules below. Extend is host-only, for the same reason question authorship is host-only: one point of control for room flow.
- **`result`**: shows the winning option. Host gets a "New question" action that resets the same room to `waiting` (compose again) — same link, no re-share.

## Vote resolution

Two independent triggers, whichever comes first:

- **Main timer expires** (`endTime` passed) — the original backstop, unchanged. Handles the case where not everyone votes.
- **Everyone's voted (and it's not a tie), then a short grace period elapses.** Resolving the instant the last vote comes in would remove any chance to reconsider, so instead: once every currently-present participant has a vote *and* one option is clearly ahead, the host's own client (the only one allowed to write `allVotedAt`, and only once per question) stamps `allVotedAt`. Five seconds after that, any client resolves it — same as the timer case. This lets a group that's already decided finish early without waiting out a long timer, while still giving a moment to change one's mind. **A tie never starts the grace period** — settling a tie by random pick after only 5 seconds isn't the point of asking everyone to vote; the main timer keeps running normally instead, giving time for someone to change their mind or a late joiner to break the tie themselves. The check re-runs every tick, so the moment the tie breaks (a vote changes, someone new votes), the grace period starts on its own.

At either trigger: the option with the most votes wins, tie broken randomly among the tied leaders — this random tie-break only ever happens as the *main timer's* last resort, never via the grace period. If literally nobody has voted when the *main timer* expires, that's the existing `autoPick` setting's job: random pick if on, lock-and-wait/extend if off (the grace-period path never fires in this case, since it requires at least one full round of votes to begin with).

Resolution is computed client-side by whichever connected client notices the condition first, written once (`if state !== "result"` guard, now also checked against a fresh-timestamp guard on `allVotedAt` itself — see Known simplifications). No server function needed at this trust/scale level.

## Presence and handles

Firebase's standard presence pattern (`.info/connected` + `onDisconnect().remove()`) keeps the participant list accurate even when someone just closes the tab, without needing an explicit "leave" action. No input required to get a handle — one is assigned client-side the moment a participant joins.

Handle pool: **JoJo's Bizarre Adventure Stand names** (e.g. "Star Platinum", "Killer Queen", "Gold Experience") as the primary source — a curated list of ~45 well-known Stands, comfortably more than any realistic room size, assigned without repeats within a room. If a room somehow exhausts the list (more participants than Stand names left unused), it falls back to the original adjective + animal generator (e.g. "Silver Fox") for any overflow, so a handle is always available.

## Known simplifications / risks

- **No real per-room moderation** beyond host-only question/extend control — any participant can vote as many times as they change their mind, and nothing stops someone from opening the link in two tabs to get two votes. Fine for a trusted-friend-group tool; not designed to resist bad actors.
- **The host can always overwrite their own room's `state`/`result`/`allVotedAt`**, bypassing the deadline/tally checks that apply to everyone else. This is deliberate, not an oversight: the host already has full authority over the room's content and timing (question, options, extend), and the same trust boundary that makes that acceptable makes this acceptable too — the thing the security rules actually defend against is a *stranger* (not the room's own host) forging any room's outcome, which they cannot do. See the post-launch security review below.
- **Firebase config is public** (expected for Firebase web apps — security comes from Security Rules, not from hiding the config). One real action taken here: the auto-created Google Cloud API key backing this project should be restricted (Cloud Console → Credentials → API restrictions) to just the APIs this app actually uses (Identity Toolkit, Token Service, Realtime Database) — GitHub's secret scanner flags this key on sight since it can't know it's an intentionally-public client identifier, but the restriction is still worth doing as real defense-in-depth against the key being used for unrelated APIs.
- **No room cleanup/TTL** — old rooms persist indefinitely in the free tier. Not worth building real expiry logic until it's actually a problem.
- Solo (non-shared) mode is completely unchanged — no network calls, no dependency loaded, unless "Share" is explicitly tapped.

## Post-launch security review

A review after the first working version found two real gaps in the security rules: `state`/`result` were writable by *any* authenticated visitor (not just a room's own participants) with no check that a deadline had passed, meaning a stranger with the public Firebase config could forge any room's outcome from a browser console; and `endTime` had the same gap, allowing unlimited free timer extensions or forced premature resolution. Both are fixed in the current `FIREBASE-RULES.json`: non-host writes to `state`/`result` now require the room's own stored deadline to have genuinely passed (checked against Firebase server time, not a client-supplied value) and that it wasn't already resolved; `endTime` is host-only, matching every other timer-control field. Verified by attempting the original exploits against the live rules post-fix (blocked) and re-running the full legitimate flow (still works).

## Setup required (one-time, done by the user)

1. Create a free project at the Firebase console.
2. Enable Realtime Database.
3. Enable "Anonymous" under Authentication → Sign-in method.
4. Add a Web app under Project Settings → General, and provide the resulting config object (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`, etc.) — safe to share and safe to commit, per Firebase's own guidance.

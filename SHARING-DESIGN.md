# Group sharing — design

Design for shareable, live group-decision rooms. Referenced from [IDEAS.md](IDEAS.md) idea #1. Not yet implemented — this is the plan, written down before writing code.

## Goal

Share a link (from setup or from an active countdown) so a group can vote together on a question — meal plans, movies, trips. After a decision, the host can post a new question to the same room without sharing a new link.

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
  result: { answer, meta }        # meta: "voted" | "tie-break" | "auto-picked"

/rooms/{roomId}/participants/{uid}
  handle: string                  # randomized display name, assigned on join
  isHost: boolean
  # presence tracked via onDisconnect() — entry auto-removes when a tab disconnects
```

## Room lifecycle and screens

A room is a persistent space; a question is ephemeral content posted into it.

- **`waiting`**: room exists, no active question. Non-host viewers see a waiting screen: participant count + handles ("3 people here: Silver Fox, Blue Falcon, Clever Otter — waiting for the host"). The host instead sees the question-composer form (question/options/timer), with the live participant list alongside it.
- **`countdown`**: host has posted a question. Every participant (present now, or joining late) sees the countdown and options, and can vote — tapping an option writes their vote under their own `uid`, and they can change their vote until time runs out. Live per-option vote tallies are shown to everyone as votes come in.
- **`timeout_waiting`**: mirrors the solo app's lock-and-wait behavior, now driven by votes instead of a single tap — see resolution rules below. Extend is host-only, for the same reason question authorship is host-only: one point of control for room flow.
- **`result`**: shows the winning option. Host gets a "New question" action that resets the same room to `countdown` (or back to `waiting` to compose first) — same link, no re-share.

## Vote resolution

At timeout (or when the host manually resolves): the option with the most votes wins. A tie is broken randomly among the tied leaders — consistent with the app's existing "force a decision" ethos. If literally nobody has voted, that's the existing `autoPick` setting's job: random pick among options if on, lock-and-wait/extend if off — the solo-mode semantics map over unchanged.

Resolution is computed client-side by whichever connected client's clock notices the deadline pass first, written once (`if state !== "result"` guard). No server function needed at this trust/scale level — an acceptable simplification for a hobby app.

## Presence and handles

Firebase's standard presence pattern (`.info/connected` + `onDisconnect().remove()`) keeps the participant list accurate even when someone just closes the tab, without needing an explicit "leave" action. Handles are generated client-side from a small built-in adjective + animal wordlist (e.g. "Silver Fox") when a participant joins — no input required.

## Known simplifications / risks

- **No real per-room moderation** beyond host-only question/extend control — any participant can vote as many times as they change their mind, and nothing stops someone from opening the link in two tabs to get two votes. Fine for a trusted-friend-group tool; not designed to resist bad actors.
- **Firebase config is public** (expected for Firebase web apps — security comes from Security Rules, not from hiding the config) but combined with open-to-anyone rules, a bad actor who finds the repo could still spam the database within the rules' validation limits (capped string/array lengths, no arbitrary paths). Acceptable at hobby scale; would need tightening (e.g. App Check) if abused.
- **No room cleanup/TTL** — old rooms persist indefinitely in the free tier. Not worth building real expiry logic until it's actually a problem.
- Solo (non-shared) mode is completely unchanged — no network calls, no dependency loaded, unless "Share" is explicitly tapped.

## Setup required (one-time, done by the user)

1. Create a free project at the Firebase console.
2. Enable Realtime Database.
3. Enable "Anonymous" under Authentication → Sign-in method.
4. Add a Web app under Project Settings → General, and provide the resulting config object (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`, etc.) — safe to share and safe to commit, per Firebase's own guidance.

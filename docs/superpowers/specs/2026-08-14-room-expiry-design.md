# Empty room expiry — design

Design for automatically deleting group rooms once they've sat empty for a while, so the setup screen's "recently active rooms" rejoin list doesn't accumulate stale entries forever. Prompted by the existing recently-active-rooms feature (see [SHARING-DESIGN.md](../../../SHARING-DESIGN.md)'s "Recently-active rooms" section) surfacing several long-empty rooms as rejoin options.

## Goal

An empty room (no current participants) should be deleted from Firebase once it's been empty for 30 minutes, so it stops appearing as a rejoin option and stops taking up space in the database. A room with anyone currently in it is never touched.

## Why not a real scheduled cleanup

This app is intentionally backend-free — a static site with no build step, no server, and no Cloud Functions (see [SHARING-DESIGN.md](../../../SHARING-DESIGN.md)'s "Why this needs a backend" section: Firebase Realtime Database was chosen specifically to avoid needing one). A true scheduled sweep (a Cloud Function running on a timer, deleting expired empty rooms regardless of whether anyone's looking) would guarantee cleanup even for rooms nobody ever revisits, but requires upgrading the Firebase project to the pay-as-you-go Blaze plan and adding a whole new deployment surface. That's a real architecture change this app has deliberately avoided so far, so this design instead uses **opportunistic client-side cleanup**: any client that happens to look at a room (checking the recently-active list, or opening its link) is responsible for both noticing it's expired and deleting it. This mirrors the pattern the app already uses for timeout resolution — "any connected client may act once an objective, server-verifiable condition holds" — rather than introducing a new architectural pattern.

**Known consequence:** a room nobody ever looks at again (no one checks recently-active rooms, no one opens its link) simply never gets deleted. This is an accepted tradeoff for staying backend-free, not a bug. It's also why the four rooms already sitting empty in the database today won't disappear the moment this ships — see "Rollout" below.

## Data model

One new field on the existing room object (data model documented in [SHARING-DESIGN.md](../../../SHARING-DESIGN.md)):

```
/rooms/{roomId}
  ...existing fields...
  emptyAt: number | null   # room.js's now() timestamp of when a client first
                            # observed zero current participants; null whenever
                            # the room has at least one participant
```

## Detection: stamping `emptyAt`

Two trigger points, both performing the same check ("the room currently has zero participants, and `emptyAt` isn't already set — write `emptyAt = now()`"):

1. **Explicitly inside `leaveRoom()`**, checked before removing the leaving client's own participant entry: if they're the only participant present, stamp `emptyAt` right after removing that entry (the security rule requires participants to already be empty at write time, so the stamp has to come after the removal, not before). This covers the common case of someone explicitly leaving a room they're alone in.
2. **`checkRecentRooms()`'s one-time `get()`** on each remembered room (see "Deletion triggers" below) — this is also what catches a room that went empty *without* anyone explicitly leaving (e.g. the last tab just closing, relying on presence's `onDisconnect` cleanup with nobody watching live). The next time any client checks its recently-active rooms, it observes the room is empty with no `emptyAt` set yet, and stamps it then.

There is deliberately no live-listener-based trigger: in this codebase, being subscribed to a room's `participants` node always means you are yourself one of the participants (you join before subscribing, and unsubscribe before removing your own entry on leaving), so a client's own live listener can never observe a genuinely empty result while it's still watching — a third trigger point there would be unreachable dead code.

`emptyAt` is cleared back to `null` in `joinAsParticipant()` whenever someone joins — so if a room fills back up before the 30-minute window elapses, the clock resets rather than reusing a stale timestamp from a previous empty period.

This intentionally does not attempt to catch every case with perfect precision (e.g. the last participant's tab closing via `onDisconnect()` with nobody else subscribed goes unnoticed until a client next looks) — it only needs to be eventually accurate for the rooms that actually get revisited, which is exactly the case this feature targets.

## Security rules

Extends `FIREBASE-RULES.json`'s existing `$roomId` block (documented in [SHARING-DESIGN.md](../../../SHARING-DESIGN.md)'s "Data model" section).

**New `emptyAt` field rule**, sibling to the existing `hostUid`/`question`/etc. rules:

```json
"emptyAt": {
  ".write": "auth != null && ((newData.val() === null && root.child('rooms').child($roomId).child('participants').exists()) || (newData.isNumber() && !root.child('rooms').child($roomId).child('participants').exists()))",
  ".validate": "newData.val() === null || newData.isNumber()"
}
```

Writable to a number only when the room genuinely has zero participants right now (server-verified via the existing `participants` node, not client-asserted) — this stops a client from stamping a fake old `emptyAt` on a room that's actually still active, to force premature deletion. Writable to `null` only when participants currently exist (the join-clears-it case).

**Room-level deletion.** `$roomId`'s `.write` is currently hardcoded `false` (SHARING-DESIGN.md: "the *only* write grant in that subtree is" each field's own rule — confirmed during the chat feature's final review). It becomes conditionally allowed for deletion only:

```json
"$roomId": {
  ".read": "auth != null",
  ".write": "auth != null && newData.val() === null && !data.child('participants').exists() && data.child('emptyAt').exists() && (now - data.child('emptyAt').val()) > 1800000",
  ...
}
```

`1800000` ms = 30 minutes. `now` is Firebase server time in the rules language (not client-supplied), matching the same pattern already used for the existing `state`/`result` deadline rules. This only affects a write targeting the whole `$roomId` path (i.e. a delete) — every other field keeps its own existing, more specific `.write` rule, which takes precedence for writes to that specific child path. No existing write permission is loosened.

## Deletion triggers (client code)

- **`checkRecentRooms()`** (setup screen's "rejoin a room" list): already fetches each remembered room's participant count via `get()`. This is itself detection trigger 2 above. Also fetch `emptyAt` in the same call:
  - If the room is empty and `emptyAt` isn't set yet, stamp it now (this visit is the first observation).
  - If the room is empty and `now() - emptyAt > 1800000`, attempt to delete it (best-effort — ignore failure, e.g. a race with another client) and drop it from the local `localStorage` remembered-rooms list immediately, rather than waiting for the next visit to notice it's gone.
- **Joining a room** (`enterRoom()`/`joinRoomFromHash()`): before completing the join, if the target room is found to be empty and past the threshold, delete it and surface the new "This room no longer exists" message (see below) instead of joining a room that's about to disappear.

## Stale-link handling

A room can now legitimately disappear after being shared (it didn't age out before this feature). When `enterRoom()`'s room subscription first fires with a null snapshot (the room doesn't exist — expired-and-deleted, or the link was simply wrong), show a message and return to the setup screen, instead of leaving the user on a blank waiting/countdown view with no host who could ever post a question. Reuses the existing `setup-error`-style inline messaging already used for setup-form validation errors, with the text "This room no longer exists."

## Edge cases

- A room with anyone present is never touched — `emptyAt` only gets set at zero participants, and the deletion rule requires `!participants.exists()` at delete time too (re-checked, not just at stamping time).
- A single-person test room: leaving triggers the explicit `leaveRoom()` check immediately, so `emptyAt` gets stamped right away rather than waiting for another client to happen by.
- Two clients racing to delete the same expired room: harmless — Firebase writes are atomic per path, so only one delete actually applies; a second attempt against an already-gone path is a no-op, not an error worth handling specially.
- A room that refills before 30 minutes are up: `emptyAt` was cleared to `null` on the join, so even if it goes empty again later, the window restarts from that later point.

## Rollout

The four rooms already empty in the live database today have no `emptyAt` set yet. The first time any client observes each one (e.g. the next time recently-active rooms are checked), it gets stamped `emptyAt = now()` at that moment — meaning it still takes one more full 30-minute window from that point before it's actually deleted, even though it's already been empty far longer. This is an accepted one-time transition cost of the opportunistic design, not an ongoing limitation.

## Out of scope

- A true scheduled/guaranteed cleanup (see "Why not a real scheduled cleanup" above).
- Any UI control to manually delete a room early (a host wanting to end a room now still just... stops sharing it; there's no explicit "delete this room" action, matching the app's existing lack of any room-management UI beyond leave/rejoin).
- Changing the 30-minute threshold to be configurable — it's a single hardcoded constant.

## Testing plan

Following the project's existing two-participant testing pattern and fast-forward technique (per `CLAUDE.md`: writing `endTime`/`allVotedAt` directly via the SDK rather than waiting out real timers — the same approach applies to `emptyAt` here):

1. Two participants join a room; both leave via explicit "leave" — confirm `emptyAt` gets stamped when the last one goes, via the `leaveRoom()` path. Separately, simulate an abrupt disconnect (remove a lone participant's entry directly via the SDK, bypassing `leaveRoom()`) and confirm `emptyAt` is NOT stamped immediately (nothing is watching live) but IS stamped the next time `checkRecentRooms()` observes that room.
2. Fast-forward `emptyAt` via the SDK to simulate 30+ minutes elapsed; confirm `checkRecentRooms()` deletes the room and removes it from the local recently-active list.
3. Attempt to write a spoofed old `emptyAt` onto a room that currently has participants — rejected by the rules.
4. Attempt to delete a room that has participants, or one that's empty but hasn't hit the 30-minute threshold yet — rejected by the rules.
5. Open a link to an expired (deleted) room; confirm the "This room no longer exists" message appears and the user lands back on setup, rather than a stuck blank screen.
6. Join a room, let it go empty (stamped), then rejoin before 30 minutes elapse; confirm `emptyAt` is cleared and the room is not deleted even after the original window would have passed.

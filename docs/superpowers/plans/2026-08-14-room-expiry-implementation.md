# Empty Room Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically delete a group room once it's sat empty (no current participants) for 30 minutes, per [docs/superpowers/specs/2026-08-14-room-expiry-design.md](../specs/2026-08-14-room-expiry-design.md).

**Architecture:** A new `emptyAt` timestamp field on the existing Firebase room object, stamped by any client that observes zero participants and cleared when someone (re)joins. A new conditional room-level deletion rule allows any client to delete a room once it's been empty long enough — mirroring the pattern this app already uses for timeout resolution ("any client may act once an objective, server-verifiable deadline has passed"). Deletion itself is triggered opportunistically from two existing client code paths: the setup screen's recently-active-rooms check, and joining a room via its link.

**Tech Stack:** Vanilla JS ES module (`room.js`), Firebase Realtime Database security rules — no new dependencies, no build step, no backend/Cloud Functions.

## Global Constraints

- No build step, no bundler, no npm, no new dependencies.
- No new Firebase SDK imports needed — `ref`, `get`, `set`, `remove`, `update`, `onValue` are already imported in `room.js`.
- The empty-room TTL is a single hardcoded constant: 30 minutes (`1800000` ms in rules, `30 * 60 * 1000` in JS). Not configurable — out of scope per the spec.
- `FIREBASE-RULES.json` changes do nothing until manually published to the Firebase console (Realtime Database → Rules → Publish) — every task that depends on the new rules being live must explicitly pause and ask the user to confirm they've published, exactly as prior features in this codebase have done.
- Follow existing `room.js` conventions: the `$(id)` helper, `now()` for the server-offset-corrected clock, `maybeX`-prefixed side-effect functions called from `subscribe()`'s listeners (mirroring the existing `maybeClaimAbandonedHost`), and `.catch(() => {})` for best-effort, non-critical writes.
- Reuse the existing `#setup-error` element, `showSetupError()`, and `showView("setup")` for the new "This room no longer exists" message — no new markup needed in `index.html`.
- This codebase has no automated test runner — verification is scripted manual testing via the Browser pane, per the project's documented pattern: a second **named** Firebase app instance for a second participant (not a second browser tab), and fast-forwarding time-based state (writing `emptyAt` directly via the SDK) rather than waiting out real 30-minute windows.
- `room.js` is cached after first `import()` within a page load — reload the page (or cache-bust) after editing it to pick up changes when testing.

---

## File Structure

- **Modify `FIREBASE-RULES.json`** — add an `emptyAt` field rule, and change `$roomId`'s `.write` from a hardcoded `false` to a conditional expression allowing deletion only.
- **Modify `room.js`** — new constant, edits to `leaveRoom()`, `joinAsParticipant()`, `checkRecentRooms()`, and `enterRoom()`.
- **Modify `SHARING-DESIGN.md`** and **`IDEAS.md`** — update the two places that currently claim "a room never truly expires" (now false), and add a Shipped entry.

No new files — `room.js` remains the single home for all room/Firebase logic in this project, consistent with its existing file map.

---

### Task 1: Firebase security rules for empty-room expiry

**Files:**
- Modify: `FIREBASE-RULES.json:1-6` (the `$roomId` block's `.write`)
- Modify: `FIREBASE-RULES.json:36-39` (add a sibling `emptyAt` block after `autoPick`)

**Interfaces:**
- Produces: the `/rooms/{roomId}/emptyAt` write contract that Task 2's `maybeMarkRoomEmpty()`, `leaveRoom()`, and `joinAsParticipant()` rely on — writable to a number only when the room currently has zero participants and `emptyAt` isn't already set (write-once while empty); writable to `null` only when participants currently exist (the clear-on-join case). Also produces the room-level deletion contract Task 3's `checkRecentRooms()` and `enterRoom()` rely on: a whole-room delete succeeds only when participants are empty, `emptyAt` is set, and more than 30 minutes (`1800000` ms, checked against Firebase server time) have passed since then.

- [ ] **Step 1: Change `$roomId`'s `.write` from `false` to a conditional deletion-only rule**

In `FIREBASE-RULES.json`, change:

```json
      "$roomId": {
        ".read": "auth != null",
        ".write": false,
```

to:

```json
      "$roomId": {
        ".read": "auth != null",
        ".write": "auth != null && newData.val() === null && !data.child('participants').exists() && data.child('emptyAt').exists() && (now - data.child('emptyAt').val()) > 1800000",
```

This only affects a write targeting the whole `$roomId` path (i.e. a delete, since `newData.val() === null` is required). Every other field keeps its own existing, more specific `.write` rule, which still governs writes to that exact child path — this change does not loosen anything else.

- [ ] **Step 2: Add the `emptyAt` field rule**

In `FIREBASE-RULES.json`, the `autoPick` block currently ends with a blank line before `state`:

```json
        "autoPick": {
          ".write": "auth != null && auth.uid === root.child('rooms').child($roomId).child('hostUid').val()",
          ".validate": "newData.isBoolean()"
        },

        "state": {
```

Add a new `emptyAt` sibling block between them:

```json
        "autoPick": {
          ".write": "auth != null && auth.uid === root.child('rooms').child($roomId).child('hostUid').val()",
          ".validate": "newData.isBoolean()"
        },
        "emptyAt": {
          ".write": "auth != null && ((newData.val() === null && root.child('rooms').child($roomId).child('participants').exists()) || (newData.isNumber() && !data.exists() && !root.child('rooms').child($roomId).child('participants').exists()))",
          ".validate": "newData.val() === null || newData.isNumber()"
        },

        "state": {
```

The `!data.exists()` in the numeric branch makes this write-once per empty period: once a numeric `emptyAt` is set, it can't be overwritten by a different number while the room stays empty — it must go through the `null`-clearing branch first (which requires participants to exist again). This prevents a client bug (or a client that keeps re-observing the empty room) from perpetually pushing the deletion deadline forward.

- [ ] **Step 3: Ask the user to publish the rules**

Print this exact message and wait for confirmation before continuing to Step 4:

> "I've updated `FIREBASE-RULES.json` with the empty-room-expiry rules. Please paste the full updated file into the Firebase console → Realtime Database → Rules → Publish, then let me know when it's live so I can verify it."

Do not proceed to Step 4 until the user confirms.

- [ ] **Step 4: Verify the rules against a live room**

In the Browser pane, create a room through the app UI (type a question, tap "Share with a group", complete or cancel the share sheet — either creates the room). Note the room id from the URL hash (`#room=XXXXXX`). Join it as a second, named Firebase app identity too (per the project's established multi-participant testing pattern), so there's a real `/participants` entry to test against.

Run this in `javascript_tool` (substituting the real room id for `ROOM_ID`, using the same dynamically-imported-SDK pattern this project's prior rule-verification tasks have used):

```js
const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js');
const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js');
const { getDatabase, ref, set, get, remove } = await import('https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js');
const { firebaseConfig } = await import('/firebase-config.js');

const app = initializeApp(firebaseConfig, 'ruletest');
const auth = getAuth(app);
await signInAnonymously(auth);
const db = getDatabase(app);
const ROOM_ID = 'ROOM_ID'; // replace with the real room id, which currently has a participant in it

const results = {};

// (a) stamping emptyAt while participants exist — must fail
try {
  await set(ref(db, `rooms/${ROOM_ID}/emptyAt`), Date.now());
  results.stampWhileNotEmpty = 'WRONGLY SUCCEEDED';
} catch (e) { results.stampWhileNotEmpty = 'rejected: ' + e.code; }

// (b) deleting a room that has participants — must fail
try {
  await remove(ref(db, `rooms/${ROOM_ID}`));
  results.deleteWhileNotEmpty = 'WRONGLY SUCCEEDED';
} catch (e) { results.deleteWhileNotEmpty = 'rejected: ' + e.code; }

JSON.stringify(results);
```

Expected: both report `"rejected: PERMISSION_DENIED"`.

Now remove the test participant's own entry (simulating everyone leaving) and continue:

```js
// remove the participant this identity added, so the room is genuinely empty
// (use the actual participant uid this identity joined with)
await remove(ref(db, `rooms/${ROOM_ID}/participants/${auth.currentUser.uid}`));

const results2 = {};

// (c) deleting an empty room with no emptyAt set yet — must fail
try {
  await remove(ref(db, `rooms/${ROOM_ID}`));
  results2.deleteBeforeStamped = 'WRONGLY SUCCEEDED';
} catch (e) { results2.deleteBeforeStamped = 'rejected: ' + e.code; }

// (d) stamping emptyAt now that it's genuinely empty — must succeed
await set(ref(db, `rooms/${ROOM_ID}/emptyAt`), Date.now());
results2.stampWhileEmpty = 'succeeded';

// (e) overwriting an already-set emptyAt with a new number — must fail (write-once)
try {
  await set(ref(db, `rooms/${ROOM_ID}/emptyAt`), Date.now() + 1000);
  results2.restampRejected = 'WRONGLY SUCCEEDED';
} catch (e) { results2.restampRejected = 'rejected: ' + e.code; }

// (f) deleting before 30 minutes have passed since the (real, just-set) emptyAt — must fail
try {
  await remove(ref(db, `rooms/${ROOM_ID}`));
  results2.deleteTooSoon = 'WRONGLY SUCCEEDED';
} catch (e) { results2.deleteTooSoon = 'rejected: ' + e.code; }

// (g) fast-forward emptyAt to simulate 31 minutes elapsed, then delete — must succeed
await set(ref(db, `rooms/${ROOM_ID}/emptyAt`), Date.now() - 31 * 60 * 1000);
try {
  await remove(ref(db, `rooms/${ROOM_ID}`));
  results2.deleteAfterExpiry = 'succeeded';
} catch (e) { results2.deleteAfterExpiry = 'rejected: ' + e.code; }

// (h) confirm the room is actually gone
const snap = await get(ref(db, `rooms/${ROOM_ID}`));
results2.roomGone = !snap.exists();

JSON.stringify(results2);
```

Expected: `deleteBeforeStamped` rejected, `stampWhileEmpty` succeeded, `restampRejected` rejected, `deleteTooSoon` rejected, `deleteAfterExpiry` succeeded, `roomGone` is `true`.

- [ ] **Step 5: Commit**

```bash
git add FIREBASE-RULES.json
git commit -m "Add security rules for empty room expiry"
```

---

### Task 2: Stamping and clearing `emptyAt`

**Files:**
- Modify: `room.js:212-222` (`joinAsParticipant`)
- Modify: `room.js:738-786` (`leaveRoom`)

**Interfaces:**
- Consumes: `db`, `ref`, `roomId`, `uid`, `now()`, `latestParticipants` — all existing module state/helpers.
- Produces: no new exports.

Note: there is deliberately no live-listener-based stamping wired into `subscribe()`. In this codebase, being subscribed to a room's `participants` node always means you are yourself one of the participants (you join before subscribing, and unsubscribe before removing your own entry on leaving) — so a client's own live listener can never observe a genuinely empty result while it's still watching. A trigger there would be unreachable dead code; the two real triggers are this task's explicit `leaveRoom()` stamp, and Task 3's `checkRecentRooms()` one-time check (which is what catches a room that went empty without anyone explicitly leaving, e.g. an abrupt tab close).

- [ ] **Step 1: Clear `emptyAt` on join, in `joinAsParticipant`**

In `room.js`, change:

```js
async function joinAsParticipant(id) {
  await init();
  const participantsRef = ref(db, `rooms/${id}/participants`);
  const snap = await get(participantsRef);
  const existing = snap.exists() ? snap.val() : {};
  const takenHandles = Object.values(existing).map((p) => p.handle);
  myHandle = generateHandle(takenHandles);
  const myRef = ref(db, `rooms/${id}/participants/${uid}`);
  await set(myRef, { handle: myHandle, joinedAt: now() });
  onDisconnect(myRef).remove();
}
```

to:

```js
async function joinAsParticipant(id) {
  await init();
  const participantsRef = ref(db, `rooms/${id}/participants`);
  const snap = await get(participantsRef);
  const existing = snap.exists() ? snap.val() : {};
  const takenHandles = Object.values(existing).map((p) => p.handle);
  myHandle = generateHandle(takenHandles);
  const myRef = ref(db, `rooms/${id}/participants/${uid}`);
  await set(myRef, { handle: myHandle, joinedAt: now() });
  onDisconnect(myRef).remove();
  // Now that we've joined, the room is no longer empty — clear any prior
  // emptyAt stamp so a later empty period starts its own fresh TTL window
  // instead of reusing a stale timestamp. Best-effort: if this fails, the
  // room stays fully protected from deletion anyway, since the deletion
  // rule independently requires participants to be empty at delete time.
  await set(ref(db, `rooms/${id}/emptyAt`), null).catch(() => {});
}
```

- [ ] **Step 2: Stamp `emptyAt` when the last participant leaves, in `leaveRoom`**

In `room.js`, change:

```js
export async function leaveRoom() {
  if (!roomId) return;

  if (unsubscribeRoom) unsubscribeRoom();
  if (unsubscribeParticipants) unsubscribeParticipants();
  if (unsubscribeMessages) unsubscribeMessages();
  unsubscribeRoom = null;
  unsubscribeParticipants = null;
  unsubscribeMessages = null;

  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  stopBeeping();
  document.body.classList.remove("timeout-flash");

  const myRef = ref(db, `rooms/${roomId}/participants/${uid}`);
  try {
    onDisconnect(myRef).cancel();
    await remove(myRef);
  } catch {
    // best-effort — presence will still self-clean via onDisconnect if this fails
  }

  roomId = null;
```

to:

```js
export async function leaveRoom() {
  if (!roomId) return;

  const wasLastParticipant = Object.keys(latestParticipants || {}).length === 1;

  if (unsubscribeRoom) unsubscribeRoom();
  if (unsubscribeParticipants) unsubscribeParticipants();
  if (unsubscribeMessages) unsubscribeMessages();
  unsubscribeRoom = null;
  unsubscribeParticipants = null;
  unsubscribeMessages = null;

  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  stopBeeping();
  document.body.classList.remove("timeout-flash");

  const myRef = ref(db, `rooms/${roomId}/participants/${uid}`);
  try {
    onDisconnect(myRef).cancel();
    await remove(myRef);
    // Now that our own presence entry is actually gone, the room may be
    // genuinely empty — stamp emptyAt so it becomes eligible for deletion.
    // Must happen AFTER remove(), not before: the security rule only
    // allows this write once participants is actually empty server-side.
    if (wasLastParticipant) {
      await set(ref(db, `rooms/${roomId}/emptyAt`), now());
    }
  } catch {
    // best-effort — presence will still self-clean via onDisconnect if this fails,
    // and any client that later observes the empty room will stamp emptyAt then
  }

  roomId = null;
```

(Everything after `roomId = null;` in this function is unchanged.)

- [ ] **Step 3: Verify with a two-participant browser test**

Reload the page first (room.js is cached after first import). Using the established two-Firebase-app-instance pattern (a second named app, not a second tab):

1. Create a room as the default identity (host). Join it as a second named identity too. Confirm (via `read_page` on the participant bar, or inspecting `latestParticipants` state) both are present.
2. Have the second identity leave (remove its own `/participants/{uid}` entry directly via the SDK). Confirm the room still shows 1 participant (the host) and `emptyAt` is still unset — the room isn't empty yet, so nothing should stamp it.
3. Have the host also leave via the UI's "Leave room"/"Start over" button. Confirm `emptyAt` gets stamped via the `leaveRoom()` path (fetch the room via `javascript_tool` afterward: participants should be empty and `emptyAt` a recent numeric timestamp).
4. Rejoin the same room (as the default identity again, via its link). Confirm `emptyAt` is cleared back to `null` on join.
5. Leave again (now alone), confirm `emptyAt` gets stamped again via the same `leaveRoom()` path.

- [ ] **Step 4: Commit**

```bash
git add room.js
git commit -m "Stamp and clear emptyAt as rooms empty out and refill"
```

---

### Task 3: Deletion, recently-active-rooms pruning, and stale-link handling

**Files:**
- Modify: `room.js:37-40` (add `EMPTY_ROOM_TTL_MS` constant)
- Modify: `room.js:42-44` (stale comment above `getRecentRooms`)
- Modify: `room.js:788-822` (`enterRoom`)
- Modify: `room.js:889-941` (`checkRecentRooms`)

**Interfaces:**
- Consumes: the `emptyAt` semantics from Task 2 (stamped when empty via `leaveRoom()`, cleared on join via `joinAsParticipant()`).
- Produces: no new exports — `checkRecentRooms` and `joinRoomFromHash`/`createRoomFromSetupForm`/`shareCurrentCountdown` (all of which call the now-changed `enterRoom`) keep their existing signatures.

- [ ] **Step 1: Add the TTL constant**

In `room.js`, change:

```js
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
const GRACE_PERIOD_MS = 5000;
const RECENT_ROOMS_KEY = "choiceTimerRecentRooms";
const MAX_RECENT_ROOMS = 5;
```

to:

```js
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
const GRACE_PERIOD_MS = 5000;
const RECENT_ROOMS_KEY = "choiceTimerRecentRooms";
const MAX_RECENT_ROOMS = 5;
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000; // 30 minutes
```

- [ ] **Step 2: Fix the now-stale comment above `getRecentRooms`**

In `room.js`, change:

```js
// "Active" is read from live presence — a room with nobody currently
// connected just doesn't show up here, no separate expiry/TTL bookkeeping
// needed. See app.js's export for exactly when this is checked.
function getRecentRooms() {
```

to:

```js
// Reads the locally-remembered room list. checkRecentRooms() (below) does
// the live presence check, plus this feature's emptyAt-based expiry: a
// room that's been empty for longer than EMPTY_ROOM_TTL_MS gets deleted
// and dropped from this list, not just shown as "empty right now" forever.
function getRecentRooms() {
```

- [ ] **Step 3: Check room existence and expiry before joining, in `enterRoom`**

In `room.js`, change:

```js
async function enterRoom(id) {
  roomId = id;
  await init();
  await joinAsParticipant(id);
  rememberRoom(id);
  $("recent-rooms").classList.add("hidden");
  subscribe(id);
```

to:

```js
async function enterRoom(id) {
  await init();

  const snap = await get(ref(db, `rooms/${id}`));
  const room = snap.val();
  if (!room) {
    showSetupError("This room no longer exists.");
    showView("setup");
    return;
  }

  const participantCount = Object.keys(room.participants || {}).length;
  if (participantCount === 0 && room.emptyAt && now() - room.emptyAt > EMPTY_ROOM_TTL_MS) {
    await remove(ref(db, `rooms/${id}`)).catch(() => {});
    showSetupError("This room no longer exists.");
    showView("setup");
    return;
  }

  roomId = id;
  await joinAsParticipant(id);
  rememberRoom(id);
  $("recent-rooms").classList.add("hidden");
  subscribe(id);
```

(Everything below this in `enterRoom` — the `extend-btn`/`new-question-btn`/`invite-more-btn`/`ask-group-btn`/chat wiring — is unchanged.)

Note: this runs for every call to `enterRoom`, including from `createRoomFromSetupForm` and `shareCurrentCountdown` right after a room was just created — in those cases the extra `get()` is a harmless, cheap sanity check (the room always exists and is never empty-and-expired immediately after creation).

- [ ] **Step 4: Rewrite `checkRecentRooms` to detect, stamp, and delete expired rooms**

In `room.js`, change:

```js
export async function checkRecentRooms() {
  const remembered = getRecentRooms();
  if (remembered.length === 0) return;
  await init();

  const results = await Promise.all(remembered.map(async (r) => {
    try {
      const snap = await get(ref(db, `rooms/${r.roomId}/participants`));
      const participants = snap.val() || {};
      return { roomId: r.roomId, count: Object.keys(participants).length };
    } catch {
      return { roomId: r.roomId, count: 0 };
    }
  }));

  const container = $("recent-rooms");
  if (results.length === 0 || roomId) {
    // roomId set means we've since joined a room ourselves (e.g. via a
    // #room= link that resolved while this check was in flight) — the
    // recent-rooms prompt would be irrelevant/confusing on top of that.
    container.classList.add("hidden");
    return;
  }

  // A room never truly expires (there's no cleanup/TTL — see
  // SHARING-DESIGN.md), so show all recently-visited rooms regardless of
  // current headcount, not just ones with someone in them right now. An
  // empty one just means nobody's there *at the moment* — the link still
  // works, and reopening it is exactly how an abandoned room gets revived.
  container.innerHTML = "";
```

to:

```js
export async function checkRecentRooms() {
  const remembered = getRecentRooms();
  if (remembered.length === 0) return;
  await init();

  // Each outcome is either { remembered, count } for a room still worth
  // showing, or null for one that's gone (already deleted by another
  // client, or just deleted here for sitting past its empty-room TTL) —
  // filtering nulls out below prunes both the displayed list and the
  // persisted localStorage list in one pass, preserving original order.
  const outcomes = await Promise.all(remembered.map(async (r) => {
    try {
      const snap = await get(ref(db, `rooms/${r.roomId}`));
      const room = snap.val();
      if (!room) return null;

      const participants = room.participants || {};
      const count = Object.keys(participants).length;

      if (count === 0) {
        if (!room.emptyAt) {
          await set(ref(db, `rooms/${r.roomId}/emptyAt`), now()).catch(() => {});
        } else if (now() - room.emptyAt > EMPTY_ROOM_TTL_MS) {
          await remove(ref(db, `rooms/${r.roomId}`)).catch(() => {});
          return null;
        }
      }

      return { remembered: r, count };
    } catch {
      // Couldn't reach it right now — keep it in the list rather than
      // dropping a room just because of a transient read failure.
      return { remembered: r, count: 0 };
    }
  }));

  const kept = outcomes.filter((o) => o !== null);
  if (kept.length !== remembered.length) {
    try {
      localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(kept.map((o) => o.remembered)));
    } catch {
      // localStorage unavailable — not critical, worst case we re-check next time
    }
  }

  const results = kept.map((o) => ({ roomId: o.remembered.roomId, count: o.count }));

  const container = $("recent-rooms");
  if (results.length === 0 || roomId) {
    // roomId set means we've since joined a room ourselves (e.g. via a
    // #room= link that resolved while this check was in flight) — the
    // recent-rooms prompt would be irrelevant/confusing on top of that.
    container.classList.add("hidden");
    return;
  }

  // Rooms are shown regardless of current headcount, not just ones with
  // someone in them right now — an empty one just means nobody's there *at
  // the moment*, and reopening it is exactly how an abandoned room comes
  // back to life. They stop appearing once actually deleted above, after
  // sitting empty for longer than EMPTY_ROOM_TTL_MS.
  container.innerHTML = "";
```

Note this outcome-object structure is a deliberate fix to a bug the naive version would have: mapping `Object.keys(participants).length` results but discarding which `remembered` entry each belongs to (if built via a shared array pushed to inside `Promise.all`, completion order isn't guaranteed to match the original list order). Building `{ remembered, count }` per outcome and filtering keeps the original order intact.

(Everything below `container.innerHTML = "";` — building the label, the chip row, and each room's click handler using `results` — is unchanged; `results` still has the same `{ roomId, count }` shape those lines expect.)

- [ ] **Step 5: Verify with a fast-forwarded expiry test**

Reload the page. Using `javascript_tool` with the app's own loaded Firebase instance (or a fresh named app instance, matching prior tasks' pattern):

1. Create a room, then immediately make it empty and stamp `emptyAt` to simulate 31 minutes ago (`Date.now() - 31 * 60 * 1000`) via a direct SDK write.
2. Add this room's id to `localStorage`'s `choiceTimerRecentRooms` list (matching the shape `rememberRoom()` writes: `{ roomId, joinedAt }`), reload the page, and confirm (via `read_page` on `#recent-rooms`) that this room does NOT appear in the rejoin list — confirm via a direct `get()` that the room no longer exists in Firebase at all.
3. Repeat with a room whose `emptyAt` is only 5 minutes old (not yet expired) — confirm it DOES still appear in the rejoin list, and that the room still exists in Firebase afterward.
4. Repeat with a room that has zero participants and no `emptyAt` set at all — confirm after the check that `emptyAt` is now stamped to a recent timestamp (this visit was the first observation) and the room is still shown in the list (not deleted yet, since it just got stamped).
5. Open a link (`#room=` + a room id) pointing at a room that's already been deleted (e.g. reuse the id from step 2, confirmed gone). Confirm `#setup-error` shows "This room no longer exists." and the view is `setup`, not a stuck blank waiting/countdown screen.

- [ ] **Step 6: Commit**

```bash
git add room.js
git commit -m "Delete empty rooms past their expiry, prune stale rejoin links"
```

---

### Task 4: Update docs, final regression pass

**Files:**
- Modify: `SHARING-DESIGN.md:82` (Recently-active rooms section)
- Modify: `SHARING-DESIGN.md:89` (Known simplifications bullet)
- Modify: `IDEAS.md:19` (existing Shipped entry's stale claim)
- Modify: `IDEAS.md` (new Shipped entry, appended after the "Chat in group rooms" entry, before `## Ideas`)

**Interfaces:**
- None — this is documentation plus a final end-to-end check, no new code.

- [ ] **Step 1: Update `SHARING-DESIGN.md`'s "Recently-active rooms" section**

In `SHARING-DESIGN.md`, change:

```markdown
The setup screen remembers rooms you've joined (a small `localStorage` list, capped at 5, most recent first) and offers to rejoin any of them — a room never truly expires (no cleanup/TTL, and it can always be revived per the ownership-transfer behavior above), so all remembered rooms are shown, not just ones with someone in them right now. Each is labeled with its live participant count read from presence (or "empty right now" if nobody's currently connected), so reopening an empty one is exactly how an abandoned room comes back to life. Checking this loads Firebase, so it's gated behind "does `localStorage` actually have a remembered room" — a first-time visitor never triggers it, keeping solo mode's zero-dependency promise intact.
```

to:

```markdown
The setup screen remembers rooms you've joined (a small `localStorage` list, capped at 5, most recent first) and offers to rejoin any of them, showing all remembered rooms regardless of current headcount (not just ones with someone in them right now). Each is labeled with its live participant count read from presence (or "empty right now" if nobody's currently connected), so reopening an empty one is exactly how an abandoned room comes back to life. Checking this loads Firebase, so it's gated behind "does `localStorage` actually have a remembered room" — a first-time visitor never triggers it, keeping solo mode's zero-dependency promise intact. A room that's sat empty for more than 30 minutes gets deleted and silently dropped from this list rather than lingering forever — see [the room-expiry design doc](docs/superpowers/specs/2026-08-14-room-expiry-design.md) for the full mechanism (client-side and opportunistic, no backend cron).
```

- [ ] **Step 2: Update `SHARING-DESIGN.md`'s "Known simplifications" bullet**

In `SHARING-DESIGN.md`, change:

```markdown
- **No room cleanup/TTL** — old rooms persist indefinitely in the free tier. Not worth building real expiry logic until it's actually a problem.
```

to:

```markdown
- **Empty rooms expire after 30 minutes**, deleted opportunistically by whichever client next notices (a recent-rooms check, or someone opening the room's link) rather than a scheduled backend job — see "Recently-active rooms" above. A room nobody ever revisits simply never gets cleaned up; an accepted tradeoff for staying backend-free.
```

- [ ] **Step 3: Fix the stale claim in `IDEAS.md`'s existing Shipped entry**

In `IDEAS.md`, change (within the "Recently-active rooms, and host departure/ownership transfer" entry):

```markdown
The setup screen now remembers rooms you've joined (a small `localStorage` list) and offers to rejoin any of them — a room never truly expires, so all remembered rooms are shown (not just ones with someone in them right now), each labeled with its live participant count or "empty right now"; reopening an empty one is exactly how an abandoned room comes back to life.
```

to:

```markdown
The setup screen now remembers rooms you've joined (a small `localStorage` list) and offers to rejoin any of them, showing all remembered rooms regardless of current headcount (not just ones with someone in them right now), each labeled with its live participant count or "empty right now"; reopening an empty one is exactly how an abandoned room comes back to life. (An empty room now expires and gets pruned from this list after sitting empty for 30 minutes — see the "Empty room expiry" entry below.)
```

- [ ] **Step 4: Add the new Shipped entry**

In `IDEAS.md`, append this new entry immediately after the "Chat in group rooms" entry and before the `## Ideas` heading:

```markdown

### Empty room expiry
Rooms that sit empty (no current participants) for more than 30 minutes now get deleted automatically, instead of lingering in the database and cluttering the setup screen's rejoin list forever — see [SHARING-DESIGN.md](SHARING-DESIGN.md)'s "Recently-active rooms" section and the [room-expiry design doc](docs/superpowers/specs/2026-08-14-room-expiry-design.md) for the full mechanism. No backend cron involved (this app stays static/serverless): deletion is opportunistic, triggered by whichever client next checks the recently-active-rooms list or opens the room's link, using a Firebase-server-time-verified security rule so only genuinely-empty, genuinely-expired rooms can be removed. A room nobody ever revisits simply never gets cleaned up — an accepted tradeoff for not adding a scheduled Cloud Function.
```

- [ ] **Step 5: Full regression pass**

Reload the app fresh. Using the same two-Firebase-app-instance pattern as Tasks 1-3, walk through the complete flow once end-to-end, since this is the first time all three prior tasks run together:

1. Two participants join a room, exchange a vote/question round normally (unaffected by this feature) — confirm nothing about the existing room flow broke.
2. Both leave; confirm `emptyAt` gets stamped (via either detection path).
3. Fast-forward `emptyAt` and confirm `checkRecentRooms()` deletes the room and prunes it from the local list.
4. Confirm a room that refills before 30 minutes (rejoin, leave, rejoin) never gets deleted — `emptyAt` clears on each join.
5. Confirm opening a stale link to a since-deleted room shows "This room no longer exists." and returns to setup, rather than a stuck screen.
6. Confirm a room with someone actively in it is untouched by any part of this feature — `emptyAt` never gets set while participants exist, and the deletion rule independently re-checks that participants are empty at delete time regardless of what `emptyAt` says.

- [ ] **Step 6: Commit**

```bash
git add SHARING-DESIGN.md IDEAS.md
git commit -m "Document empty room expiry, move it to Shipped in IDEAS.md"
```

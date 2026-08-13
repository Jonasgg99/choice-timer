# Room Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, always-visible chat panel to group rooms so participants can talk through a decision, per [docs/superpowers/specs/2026-08-13-room-chat-design.md](../specs/2026-08-13-room-chat-design.md).

**Architecture:** A new `/rooms/{roomId}/messages/{pushId}` node in the existing Firebase Realtime Database room, guarded by a write-once, sender-only security rule. `room.js` gets a new self-contained "chat" section (state, send, subscribe, render) that plugs into the existing `enterRoom()`/`leaveRoom()`/`subscribe()`/`renderRoom()` lifecycle the same way `participants` already does. A new sibling panel in `index.html` (same pattern as `#participant-bar`) renders independently of which of the three per-state views (`waiting`/`countdown`/`result`) is currently showing.

**Tech Stack:** Vanilla JS ES module (`room.js`), Firebase Realtime Database + Anonymous Auth (already in use, same SDK version), no build step, no new dependencies.

## Global Constraints

- No build step, no bundler, no npm, no new dependencies — plain JS/HTML/CSS only, matching the rest of the project.
- Firebase SDK imports must use the same pinned CDN version already used in `room.js`: `12.17.1`.
- Message text: 1–280 characters, enforced both client-side (`maxlength` on the input) and server-side (security rule `.validate`).
- No message edit or delete in v1 — messages are write-once.
- Chat is room-scoped (persists across questions, cleared only on `leaveRoom()`), not question-scoped — it must NOT be touched by `postQuestionToRoom()` or `requestNewQuestion()`.
- Follow existing `room.js` conventions: the `$(id)` helper for `document.getElementById`, the shared `.hidden` CSS utility class (not a bespoke one) for show/hide, and `latestX`-prefixed module state mirroring the existing `latestRoom`/`latestParticipants` pattern.
- This codebase has no automated test runner (no npm, no test framework) — "tests" in this plan are concrete, scripted manual verification procedures run through the Browser pane, per the project's own documented testing approach in `CLAUDE.md`. Specifically: use a second **named** Firebase app instance for a second participant (not a second browser tab — tabs share the same anonymous auth identity and silently break multi-participant tests), and reload the page (or cache-bust the `import('./room.js')` call) after each `room.js` edit, since a module is cached after first import within a page load.
- `FIREBASE-RULES.json` changes do nothing until manually pasted into the Firebase console (Realtime Database → Rules → Publish) — this plan cannot do that step itself. Each task that depends on the new rule being live must explicitly pause and ask the user to confirm they've published it.

---

## File Structure

- **Modify `FIREBASE-RULES.json`** — add a `messages` rules block under the existing `$roomId` block.
- **Modify `index.html`** — add the chat panel markup as a sibling of the view sections (same placement pattern as `#participant-bar`/`#invite-more-btn`).
- **Modify `style.css`** — add chat panel styling, appended at the end of the file, using the existing CSS custom properties (`--surface`, `--surface-2`, `--text`, `--text-dim`, `--accent`, `--border`, `--radius`).
- **Modify `room.js`** — new imports (`push`, `query`, `limitToLast`), new module state, a new "chat" function section, and small integration edits inside `renderRoom()`, `subscribe()`, `leaveRoom()`, and `enterRoom()`.
- **Modify `IDEAS.md`** — move backlog item 1 into the Shipped section once done (existing project standing rule).

No new files. This is a small enough feature that splitting `room.js` further would just fragment tightly-coupled state (`room.js` is already the single home for all room/Firebase logic, per the project's own file map in `CLAUDE.md`).

---

### Task 1: Firebase security rules for chat messages

**Files:**
- Modify: `FIREBASE-RULES.json:65-71`

**Interfaces:**
- Produces: the `/rooms/{roomId}/messages/{pushId}` write contract that Task 3's `sendChatMessage()` relies on — a message document must have exactly `{ uid, handle, text, ts }`, `uid` must equal the writer's `auth.uid`, `text` must be 1–280 characters, and once written a message can never be overwritten.

- [ ] **Step 1: Add the `messages` rules block**

In `FIREBASE-RULES.json`, the `participants` block currently ends the `$roomId` object:

```json
        "participants": {
          "$uid": {
            ".write": "auth != null && auth.uid === $uid",
            ".validate": "newData.hasChild('handle')"
          }
        }
      }
```

Change it to add a `messages` sibling block:

```json
        "participants": {
          "$uid": {
            ".write": "auth != null && auth.uid === $uid",
            ".validate": "newData.hasChild('handle')"
          }
        },

        "messages": {
          "$messageId": {
            ".write": "auth != null && !data.exists() && newData.child('uid').val() === auth.uid && root.child('rooms').child($roomId).child('participants').child(auth.uid).exists()",
            ".validate": "newData.hasChildren(['uid', 'handle', 'text', 'ts']) && newData.child('uid').val() === auth.uid && newData.child('handle').isString() && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 280 && newData.child('ts').isNumber()"
          }
        }
      }
```

No new `.read` rule is needed — `/rooms/{roomId}/.read` is already `"auth != null"` and Realtime Database read rules cascade to all descendants unless a child overrides them (the existing `participants` and `votes` blocks rely on the same cascade).

- [ ] **Step 2: Ask the user to publish the rules**

Print this exact message and wait for confirmation before continuing to Step 3:

> "I've updated `FIREBASE-RULES.json` with the new `messages` block. Please paste the full updated file into the Firebase console → Realtime Database → Rules → Publish, then let me know when it's live so I can verify it."

Do not proceed to Step 3 until the user confirms.

- [ ] **Step 3: Verify the rule against a live room**

In the Browser pane, open the app and create a room (via the UI: type a question, tap "Share with a group", complete or cancel the native share sheet — either is fine, the room still gets created). Note the room id from the URL hash (`#room=XXXXXX`).

Run this in `javascript_tool` (substituting the real room id for `ROOM_ID`) to attempt five writes as a **second**, separate anonymous identity that has never joined the room as a participant:

```js
const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js');
const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js');
const { getDatabase, ref, push, set } = await import('https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js');
const { firebaseConfig } = await import('/firebase-config.js');

const app = initializeApp(firebaseConfig, 'ruletest');
const auth = getAuth(app);
await signInAnonymously(auth);
const db = getDatabase(app);
const uid = auth.currentUser.uid;
const ROOM_ID = 'ROOM_ID'; // replace with the real room id

const results = {};

// (a) non-participant write — must fail
try {
  await set(push(ref(db, `rooms/${ROOM_ID}/messages`)), { uid, handle: 'Test', text: 'hi', ts: Date.now() });
  results.nonParticipant = 'WRONGLY SUCCEEDED';
} catch (e) { results.nonParticipant = 'rejected: ' + e.code; }

// (b) spoofed uid — must fail
try {
  await set(push(ref(db, `rooms/${ROOM_ID}/messages`)), { uid: 'not-me', handle: 'Test', text: 'hi', ts: Date.now() });
  results.spoofedUid = 'WRONGLY SUCCEEDED';
} catch (e) { results.spoofedUid = 'rejected: ' + e.code; }

// (c) text too long — must fail
try {
  await set(push(ref(db, `rooms/${ROOM_ID}/messages`)), { uid, handle: 'Test', text: 'x'.repeat(281), ts: Date.now() });
  results.tooLong = 'WRONGLY SUCCEEDED';
} catch (e) { results.tooLong = 'rejected: ' + e.code; }

// (d) missing field — must fail
try {
  await set(push(ref(db, `rooms/${ROOM_ID}/messages`)), { uid, handle: 'Test', ts: Date.now() });
  results.missingField = 'WRONGLY SUCCEEDED';
} catch (e) { results.missingField = 'rejected: ' + e.code; }

JSON.stringify(results);
```

Expected: all four report `"rejected: PERMISSION_DENIED"`.

Then join the room as a real participant through the app UI (open the room link, so this same `ruletest` identity gets added to `/participants`), and re-run just case (a)'s write:

```js
const key = push(ref(db, `rooms/${ROOM_ID}/messages`)).key;
await set(ref(db, `rooms/${ROOM_ID}/messages/${key}`), { uid, handle: 'Test', text: 'hello room', ts: Date.now() });
// now try to overwrite the same key — must fail (write-once)
try {
  await set(ref(db, `rooms/${ROOM_ID}/messages/${key}`), { uid, handle: 'Test', text: 'edited', ts: Date.now() });
  'WRONGLY SUCCEEDED overwrite';
} catch (e) { 'overwrite rejected: ' + e.code; }
```

Expected: the first write succeeds (no thrown error), the second (overwrite) is rejected with `PERMISSION_DENIED`.

- [ ] **Step 4: Commit**

```bash
git add FIREBASE-RULES.json
git commit -m "Add security rules for room chat messages"
```

---

### Task 2: Chat panel markup and styling

**Files:**
- Modify: `index.html:135-137`
- Modify: `style.css` (append at end, after line 411)

**Interfaces:**
- Produces: the DOM elements Task 3 and Task 4 wire up — `#chat-panel`, `#chat-toggle`, `#chat-unread-dot`, `#chat-body`, `#chat-messages`, `#chat-form`, `#chat-input`.
- No behavior yet — the panel is inert markup, hidden by default via the existing shared `.hidden` utility class (`style.css:124`).

- [ ] **Step 1: Add the chat panel markup**

In `index.html`, between the closing `</section>` of `view-result` and `</main>`:

```html
  </section>

  <div id="chat-panel" class="chat-panel hidden">
    <button type="button" id="chat-toggle" class="chat-toggle" aria-expanded="true">
      Chat
      <span id="chat-unread-dot" class="chat-unread-dot hidden"></span>
    </button>
    <div id="chat-body" class="chat-body">
      <div id="chat-messages" class="chat-messages"></div>
      <form id="chat-form" class="chat-form">
        <input type="text" id="chat-input" class="chat-input" placeholder="Message the room&hellip;" maxlength="280" autocomplete="off">
        <button type="submit" class="chat-send-btn">Send</button>
      </form>
    </div>
  </div>

</main>
```

- [ ] **Step 2: Add chat panel styles**

Append to the end of `style.css`:

```css
/* Chat */

.chat-panel {
  max-width: 420px;
  width: 100%;
  margin: 20px 0 0;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
}

.chat-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.chat-unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.chat-messages {
  max-height: 220px;
  overflow-y: auto;
  padding: 0 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-message {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 85%;
}

.chat-message-own {
  align-self: flex-end;
  align-items: flex-end;
}

.chat-message-sender {
  color: var(--text-dim);
  font-size: 0.72rem;
  margin-bottom: 2px;
}

.chat-message-text {
  padding: 6px 10px;
  border-radius: 12px;
  background: var(--surface-2);
  font-size: 0.9rem;
  word-break: break-word;
}

.chat-message-own .chat-message-text {
  background: var(--accent);
  color: var(--accent-text);
}

.chat-form {
  display: flex;
  gap: 8px;
  padding: 10px 14px 14px;
}

.chat-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: 0.9rem;
}

.chat-send-btn {
  padding: 8px 16px;
  border-radius: 999px;
  border: none;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 3: Verify the markup renders correctly**

Start the local server (`python -m http.server 8000`), open the app in the Browser pane. Confirm via `read_page` that `#chat-panel` exists but is not visible (nothing shows it yet — no JS references it). Then, purely to eyeball the styling before wiring any behavior, run in `javascript_tool`:

```js
document.getElementById('chat-panel').classList.remove('hidden');
document.getElementById('chat-messages').innerHTML = '<div class="chat-message"><span class="chat-message-sender">Silver Fox</span><span class="chat-message-text">Sounds good to me</span></div><div class="chat-message chat-message-own"><span class="chat-message-sender">You</span><span class="chat-message-text">Great, let\'s do it</span></div>';
```

Take a screenshot and confirm: the panel is visually distinct (bordered, rounded), the toggle button reads "Chat", the two sample messages render with the "own" message right-aligned in the accent color and the other left-aligned in the surface color. Then reload the page (discarding this manual DOM edit — it's not committed to any file).

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Add chat panel markup and styling"
```

---

### Task 3: Message send/receive plumbing

**Files:**
- Modify: `room.js:7-9` (imports)
- Modify: `room.js:25-30` (module state)
- Modify: `room.js:495-500` (`renderRoom` — panel visibility hook)
- Modify: `room.js:616-628` (`subscribe` — messages listener)
- Modify: `room.js:633-668` (`leaveRoom` — teardown)
- Modify: `room.js:670-689` (`enterRoom` — wiring)
- New section: chat functions, inserted before the `// ---------- subscription ----------` comment (currently `room.js:611`)

**Interfaces:**
- Consumes: `db`, `ref`, `uid`, `roomId`, `myHandle`, `now()` — all existing module-level state/helpers already defined earlier in `room.js`.
- Produces: `sendChatMessage(text: string): Promise<void>` and `renderChatMessages(): void`, both consumed by Task 4 and by this task's own UI wiring. Module state `latestMessages: { [pushId]: { uid, handle, text, ts } }`.

- [ ] **Step 1: Add new Firebase imports**

In `room.js`, change:

```js
import {
  getDatabase, ref, set, update, get, remove, onValue, onDisconnect,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";
```

to:

```js
import {
  getDatabase, ref, set, update, get, remove, onValue, onDisconnect, push, query, limitToLast,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";
```

- [ ] **Step 2: Add chat module state**

Near the existing module state (after `let beepIntervalId = null;` at `room.js:30`), add:

```js
let latestMessages = {};
let unsubscribeMessages = null;
```

- [ ] **Step 3: Add the chat functions**

Insert this new section immediately before the `// ---------- subscription ----------` comment (`room.js:611`):

```js
// ---------- chat ----------

async function sendChatMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || !roomId) return;
  const messageRef = push(ref(db, `rooms/${roomId}/messages`));
  await set(messageRef, {
    uid,
    handle: myHandle,
    text: trimmed,
    ts: now(),
  });
}

function renderChatMessages() {
  const container = $("chat-messages");
  const entries = Object.values(latestMessages).sort((a, b) => a.ts - b.ts);

  container.innerHTML = "";
  entries.forEach((m) => {
    const row = document.createElement("div");
    row.className = m.uid === uid ? "chat-message chat-message-own" : "chat-message";

    const sender = document.createElement("span");
    sender.className = "chat-message-sender";
    sender.textContent = m.handle;

    const text = document.createElement("span");
    text.className = "chat-message-text";
    text.textContent = m.text;

    row.appendChild(sender);
    row.appendChild(text);
    container.appendChild(row);
  });
  container.scrollTop = container.scrollHeight;
}

```

- [ ] **Step 4: Show/hide the panel with room entry/exit, and wire the send form**

In `enterRoom()` (`room.js:670-689`), add to the end of the function (after the existing `$("ask-group-btn").onclick = ...` block):

```js
  $("chat-panel").classList.remove("hidden");
  $("chat-form").onsubmit = (e) => {
    e.preventDefault();
    const input = $("chat-input");
    sendChatMessage(input.value);
    input.value = "";
  };
```

In `leaveRoom()` (`room.js:633-668`), add to the teardown block (alongside the existing `unsubscribeParticipants` teardown):

```js
  if (unsubscribeMessages) unsubscribeMessages();
  unsubscribeMessages = null;
```

and add to the state-reset block (alongside the existing `latestParticipants = {};`):

```js
  latestMessages = {};
```

and add to the DOM-reset block (alongside the existing `$("participant-bar").classList.add("hidden");`):

```js
  $("chat-panel").classList.add("hidden");
  $("chat-messages").innerHTML = "";
  $("chat-input").value = "";
```

- [ ] **Step 5: Subscribe to messages**

In `subscribe()` (`room.js:616-628`), add a third listener alongside the existing two:

```js
function subscribe(id) {
  unsubscribeRoom = onValue(ref(db, `rooms/${id}`), (snap) => {
    latestRoom = snap.val();
    renderRoom();
    maybeClaimAbandonedHost(latestRoom);
  });
  unsubscribeParticipants = onValue(ref(db, `rooms/${id}/participants`), (snap) => {
    latestParticipants = snap.val() || {};
    renderRoom();
    maybeClaimAbandonedHost(latestRoom);
  });
  unsubscribeMessages = onValue(
    query(ref(db, `rooms/${id}/messages`), limitToLast(200)),
    (snap) => {
      latestMessages = snap.val() || {};
      renderChatMessages();
    },
  );
  if (!rafId) tick();
}
```

- [ ] **Step 6: Verify with a two-participant browser test**

Reload the page first (room.js is cached after first import — edits need a fresh load). Per `CLAUDE.md`'s documented pattern, use a second **named** Firebase app instance for the second participant rather than a second tab.

In the Browser pane, create a room through the UI as the default identity (host). Then in `javascript_tool`, join the same room as a second participant:

```js
const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js');
const { getAuth, signInAnonymously, inMemoryPersistence, setPersistence } = await import('https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js');
const { getDatabase, ref, set, onValue } = await import('https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js');
const { firebaseConfig } = await import('/firebase-config.js');
const { generateHandle } = await import('/handles.js');

const app2 = initializeApp(firebaseConfig, 'participant2');
const auth2 = getAuth(app2);
await setPersistence(auth2, inMemoryPersistence);
await signInAnonymously(auth2);
const db2 = getDatabase(app2);
const uid2 = auth2.currentUser.uid;
const ROOM_ID = location.hash.match(/#room=([A-Za-z0-9]+)/)[1];

await set(ref(db2, `rooms/${ROOM_ID}/participants/${uid2}`), { handle: 'Second Tester', joinedAt: Date.now() });

let seen = [];
onValue(ref(db2, `rooms/${ROOM_ID}/messages`), (snap) => { seen = Object.values(snap.val() || {}); });

// send a message as participant 2
await set(ref(db2, `rooms/${ROOM_ID}/messages/testmsg1`), { uid: uid2, handle: 'Second Tester', text: 'hello from participant 2', ts: Date.now() });
```

Then, back in the actual page UI (the host/default identity), confirm via `read_page` on `#chat-messages` that "hello from participant 2" appears with sender "Second Tester", rendered as a non-own message. Type a message into `#chat-input` and submit `#chat-form` through the UI (`computer` click or `form_input` + Enter); confirm via the `seen` variable (re-inspect with `javascript_tool`) that participant 2's live listener picked it up.

Then, as the host, use the UI to post a new question ("Ask the group"). Confirm via `read_page` that `#chat-messages` still contains both prior messages — chat must survive the question reset (verifying it isn't touched by `postQuestionToRoom()`).

Finally, click "Start over" / "Leave room" as the host and confirm `#chat-panel` gets the `hidden` class again and `#chat-messages` is emptied.

- [ ] **Step 7: Commit**

```bash
git add room.js
git commit -m "Add live chat send/receive to group rooms"
```

---

### Task 4: Collapse/expand behavior, per-view defaults, and unread indicator

**Files:**
- Modify: `room.js` (new state near the state added in Task 3, new functions in the chat section added in Task 3, small edit to `renderRoom()` at `room.js:495-500`, small edit to `enterRoom()`)

**Interfaces:**
- Consumes: `renderChatMessages()` and `latestMessages` from Task 3.
- Produces: `setChatCollapsed(collapsed: boolean): void`, called by the `#chat-toggle` click handler; `updateChatDefaultCollapse(state: string): void`, called from `renderRoom()`.

- [ ] **Step 1: Add collapse-tracking state**

Alongside the state added in Task 3 Step 2:

```js
let chatCollapsed = false;
let chatLastCategory = null;
let lastSeenMessageTs = 0;
```

- [ ] **Step 2: Add collapse/default logic to the chat section**

In the chat section added in Task 3 Step 3, add these functions (after `sendChatMessage`, before `renderChatMessages`):

```js
function chatCategoryFor(state) {
  return (state === "countdown" || state === "timeout_waiting") ? "countdown" : "expanded";
}

// Re-derives the default collapse state only when the room moves between a
// countdown-shaped state and a waiting/result-shaped state — so a manual
// toggle during countdown isn't fought on every render, only reset when the
// view genuinely changes category.
function updateChatDefaultCollapse(state) {
  const category = chatCategoryFor(state);
  if (category !== chatLastCategory) {
    chatCollapsed = category === "countdown";
    chatLastCategory = category;
  }
}

function renderChatCollapseState() {
  $("chat-body").classList.toggle("hidden", chatCollapsed);
  $("chat-toggle").setAttribute("aria-expanded", String(!chatCollapsed));
  if (!chatCollapsed) {
    const latestTs = Object.values(latestMessages).reduce((max, m) => Math.max(max, m.ts || 0), 0);
    lastSeenMessageTs = Math.max(lastSeenMessageTs, latestTs);
    $("chat-unread-dot").classList.add("hidden");
  }
}

function setChatCollapsed(collapsed) {
  chatCollapsed = collapsed;
  renderChatCollapseState();
}
```

- [ ] **Step 3: Update `renderChatMessages` to set the unread dot**

In the `renderChatMessages` function added in Task 3, add before the closing `}`:

```js
  const latestTs = entries.length ? entries[entries.length - 1].ts : 0;
  if (chatCollapsed && latestTs > lastSeenMessageTs) {
    $("chat-unread-dot").classList.remove("hidden");
  }
```

- [ ] **Step 4: Hook into `renderRoom()` and wire the toggle button**

In `renderRoom()` (`room.js:495-500`), change:

```js
function renderRoom() {
  const room = latestRoom;
  renderParticipantBar();

  if (!room) return;
```

to:

```js
function renderRoom() {
  const room = latestRoom;
  renderParticipantBar();

  if (!room) return;

  updateChatDefaultCollapse(room.state);
  renderChatCollapseState();
```

In `enterRoom()`, add alongside the `$("chat-form").onsubmit = ...` line added in Task 3 Step 4:

```js
  $("chat-toggle").onclick = () => setChatCollapsed(!chatCollapsed);
```

Also reset the collapse-tracking state in `leaveRoom()`, alongside `latestMessages = {};`:

```js
  chatCollapsed = false;
  chatLastCategory = null;
  lastSeenMessageTs = 0;
```

- [ ] **Step 5: Verify collapse defaults and the unread indicator**

Reload the page. Join a room as host (state `waiting`) — confirm via `read_page` that `#chat-body` does NOT have the `hidden` class (expanded by default). Post a question ("Ask the group", state becomes `countdown`) — confirm `#chat-body` now HAS the `hidden` class (collapsed by default) and `#chat-toggle`'s `aria-expanded` is `"false"`.

Using the same second-participant script pattern from Task 3 Step 6, send a chat message as participant 2 while the host's chat is collapsed. Confirm via `read_page` that `#chat-unread-dot` no longer has the `hidden` class. Click `#chat-toggle` (via `computer`) to expand; confirm `#chat-unread-dot` gets `hidden` again and the new message is visible in `#chat-messages`.

Let the countdown resolve to a result (fast-forward `endTime` via the Firebase SDK and call `resolveIfExpired()` directly, per `CLAUDE.md`'s documented technique for this app, rather than waiting out a real timer). Confirm `#chat-body` auto-expands again (result is an "expanded" category state).

- [ ] **Step 6: Commit**

```bash
git add room.js
git commit -m "Add chat panel collapse/expand behavior with unread indicator"
```

---

### Task 5: Update IDEAS.md and final regression pass

**Files:**
- Modify: `IDEAS.md:27-28` (move item 1 out of Ideas) and `IDEAS.md`'s Shipped section (add a new entry)

**Interfaces:**
- None — this is documentation plus a final end-to-end check, no new code.

- [ ] **Step 1: Move the chat feature from Ideas to Shipped**

In `IDEAS.md`, remove the "### 1. Simple chat below the voting area (M)" entry (`IDEAS.md:27-28`) from the Ideas section, renumbering the remaining ideas (old #2 becomes #1, etc. — renumber all of them down by one).

Add a new entry at the end of the Shipped section (after the existing "Recently-active rooms, and host departure/ownership transfer" entry), following the section's existing prose style:

```markdown
### Chat in group rooms
A persistent chat panel in group rooms (`/rooms/{roomId}/messages` in Firebase, alongside the existing room data — see [SHARING-DESIGN.md](SHARING-DESIGN.md)'s data model). Room-scoped rather than question-scoped: messages persist across the whole room's lifetime, including when the host posts a new question, and the panel is visible on every screen (waiting, countdown, result) — not just while a question is active. Messages are write-once (no edit/delete) and capped at 280 characters, enforced by both the input and the Firebase security rules; a sender's handle is copied onto each message at send time so it stays correct even after that participant leaves. The panel is collapsible to avoid competing with the timer and options on the countdown screen — expanded by default while waiting or viewing a result, collapsed by default during countdown, with a small unread-message dot when new messages arrive while collapsed.
```

- [ ] **Step 2: Full regression pass**

Reload the app fresh. Using the same two-Firebase-app-instance pattern from Tasks 3 and 4, walk through the complete flow once end-to-end and confirm each item, since this is the first time all four tasks run together:

1. Host creates a room, chat panel is visible and expanded on the waiting screen.
2. Host and a second participant exchange several messages; both sides show them live, correctly distinguishing own vs. others'.
3. Host posts a question; chat auto-collapses; prior messages are still present (scroll/expand to confirm) and unaffected by the question reset.
4. A message sent while collapsed shows the unread dot; expanding clears it.
5. Resolve the question to a result (fast-forward `endTime`, call `resolveIfExpired()` directly); chat auto-expands.
6. Host leaves the room; chat panel disappears and its state resets (confirmed already in Task 3, re-check here as part of the full flow).
7. Attempt (via `javascript_tool`, a fresh named app, no prior participant entry) to write a message as a non-participant — still rejected, confirming Task 1's rule is unaffected by the later UI changes.
8. Using the second participant identity from step 2 (which genuinely joined and sent messages earlier), remove its own `/rooms/{roomId}/participants/{uid2}` entry to simulate leaving, then attempt another chat write with that same identity — must be rejected. This is the specific case Task 1's rule targets (someone who *was* a legitimate participant, not just a stranger who never joined) and is worth checking once the full room lifecycle (including the ownership-transfer/presence logic already shipped) is exercised alongside it.

- [ ] **Step 3: Commit**

```bash
git add IDEAS.md
git commit -m "Move chat feature to Shipped in IDEAS.md"
```

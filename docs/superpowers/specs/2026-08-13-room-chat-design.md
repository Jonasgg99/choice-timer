# Room chat — design

Design for a lightweight chat thread inside group rooms, so participants can talk through a decision ("I'm fine with either", "let's do sushi") without leaving the app. Corresponds to [IDEAS.md](../../../IDEAS.md) backlog item 1 ("Simple chat below the voting area").

## Goal

Let participants in a room send short text messages to each other, visible to everyone currently in the room, for the lifetime of the room — not scoped to any single question.

## Data model

```
/rooms/{roomId}/messages/{pushId}
  uid: string      # sender's Firebase Anonymous Auth uid
  handle: string   # sender's display handle, denormalized at send time
  text: string     # 1-280 chars, trimmed
  ts: number       # room.js's existing now() (server-time-offset-corrected clock)
```

One node per message, keyed by Firebase `push()` IDs (chronologically sortable by construction). `handle` is copied at send time rather than looked up from `/participants/{uid}` at render time, so a message still shows the right sender name even after that participant leaves and their presence entry is removed.

Extends the existing room data model documented in [SHARING-DESIGN.md](../../../SHARING-DESIGN.md) — same room, new sibling node, no changes to `question`/`options`/`votes`/`result`/etc.

## Persistence and scope

Chat is **room-scoped, not question-scoped**: it persists across the whole room's lifetime, including when the host posts a new question (unlike `question`/`options`/`votes`/`result`, which get overwritten each round). It is visible in every room state — waiting, countdown, and result — including on the host's own screen while they're composing the next question.

Client reads with a `limitToLast(200)`-style query rather than the unbounded list, as a cheap safety valve against one degenerate case (a room left open for days with constant chatter). No server-side pruning/deletion job — consistent with the project's existing stance of not building room cleanup/TTL until it's an actual problem (see SHARING-DESIGN.md's "Known simplifications").

## Security rules

New rules block under the existing `$roomId` rules in `FIREBASE-RULES.json`:

```json
"messages": {
  "$messageId": {
    ".write": "auth != null && !data.exists() && newData.child('uid').val() === auth.uid && root.child('rooms').child($roomId).child('participants').child(auth.uid).exists()",
    ".validate": "newData.hasChildren(['uid', 'handle', 'text', 'ts']) && newData.child('uid').val() === auth.uid && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 280"
  }
}
```

- **Write-once**: `!data.exists()` blocks editing or overwriting any existing message (including your own, once sent) — no edit/delete for v1. Keeps this rule simple and matches the "no real per-room moderation" trust model already documented for votes.
- **No spoofing**: `newData.child('uid').val() === auth.uid`, checked in both `.write` and `.validate`, same pattern the existing `votes/$uid` rule uses.
- **Must be a current participant**: blocks someone who has left the room (their `/participants/{uid}` entry removed) from continuing to post.
- **Read**: no new rule needed — `/rooms/{roomId}/.read` is `auth != null` and RTDB read rules cascade to descendants, so `messages` is already covered by the existing top-level room read rule.

## UI

A persistent chat panel, sibling to the existing per-state view sections (`view-waiting`, `view-countdown`, `view-result`) in `index.html` — the same structural pattern as the existing `participant-bar`, which already renders regardless of which view is showing. This is what makes "always visible across the whole room" work without duplicating markup into three separate views.

Contents: a scrollable message list (sender handle + text, own messages visually distinguished from others'), a text input, and a Send button (Enter also sends). Empty state: "No messages yet."

**Collapsible, not always-expanded.** Chat competes for screen space with the timer and options on the countdown view, so the panel is collapsible:
- Expanded by default on waiting and result views.
- Collapsed by default on the countdown view.
- A small unread-message indicator (dot) appears on the collapsed header when a message arrives with `ts` newer than a local, in-memory "last seen" timestamp (not persisted — resets each page load, same lifetime as the rest of the room module's in-memory state).

Only shown when actually in a room (hidden in solo mode and on the setup screen before joining/sharing), matching how `participant-bar` already behaves.

## Send behavior

- Input capped at 280 characters (matching the rule's validation).
- No client-side rate limiting beyond Firebase's natural request overhead — consistent with the app's existing trusted-friend-group threat model (see SHARING-DESIGN.md's "Known simplifications": no protection against a participant opening two tabs, etc.).
- No message editing or deletion in v1.

## Out of scope (v1)

- Message editing/deletion.
- Rich content (images, links preview, reactions) — separate backlog item (#3, image attachments) if ever pursued.
- Read receipts / per-user unread counts persisted server-side — the unread dot is a local, ephemeral UI nicety only.
- Profanity filtering or moderation tooling beyond the existing participant-only write gate.

## Testing plan

Following the project's existing two-participant testing pattern (CLAUDE.md: a second named Firebase app instance in the same tab, not a second browser tab, to avoid sharing the same anonymous auth identity):

1. Two participants exchange messages; both see them live via the `onValue` subscription.
2. A message from a non-participant `uid` (or a spoofed `uid` not matching `auth.uid`) is rejected by the rules.
3. A message over 280 characters is rejected by the rules.
4. Chat messages persist across the host posting a new question (room `state` cycles waiting → countdown → result → waiting again; `messages` node is untouched).
5. The collapsed countdown-view panel shows an unread indicator when a message arrives while collapsed, and it clears on expand.
6. A participant who has left (removed from `/participants`) can no longer write a new message, even with a previously-valid session.

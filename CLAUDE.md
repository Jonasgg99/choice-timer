# Choice Timer — notes for a new session

A small web app that forces a decision under a countdown, solo or with a group. Read [README.md](README.md) for the user-facing pitch. This file is project-specific onboarding — general working-style preferences live in the user's global config, not here.

## Architecture

- Static site: plain HTML/CSS/JS, no build step, no bundler, no framework, no npm.
- Solo mode is fully client-side and zero-dependency — no network calls unless the user explicitly taps "Share."
- Group rooms are lazy-loaded (`import('./room.js')`, only triggered by a Share action or opening a `#room=` link) and backed by Firebase Realtime Database + Firebase Anonymous Auth.

## File map

- `index.html` — all views in one page (setup / waiting / countdown / result), toggled via `hidden` class
- `style.css` — all styling
- `app.js` — solo-mode logic, plus the shared bootstrapping room.js hooks into (`window.__choiceTimer`: view switching, reading/stopping the local countdown)
- `room.js` — everything group-room related: Firebase auth/CRUD, presence, vote resolution, rendering. Lazy-loaded.
- `followup.js` — post-result satisfaction check + follow-through/calendar prompt. Shared markup between solo and group result views, but both blocks are **solo-only in practice** (`room.js` explicitly hides them via `reset({ showPersonal: false })`) — they're framed around one person's own decision, which doesn't map onto a group reaching consensus.
- `handles.js` — JoJo Stand name generator for room participant handles (falls back to an adjective+animal generator if exhausted)
- `firebase-config.js` — Firebase web config. **Intentionally public** (Firebase's own guidance — this is not a secret, don't "fix" it by hiding it). GitHub's secret scanner will flag it anyway; that's expected, dismiss the alert rather than rotating the key.
- `FIREBASE-RULES.json` — the real security boundary. There is no backend/server; these Realtime Database rules are the *only* thing enforcing "only the host can set the question," vote ownership, etc. **Editing this file does nothing on its own** — the user must manually paste it into the Firebase console → Realtime Database → Rules → Publish. Always confirm they've done so before testing or assuming a rules change is live.

## Docs to read first

- [README.md](README.md) — user-facing description, live link, local dev instructions
- [IDEAS.md](IDEAS.md) — the feature backlog *and* the shipped-features changelog. **Standing rule: whenever you implement something from the backlog, move it into the Shipped section in the same turn.** Keep it as the single source of truth for what's actually built vs. still an idea — don't let it drift.
- [RESEARCH.md](RESEARCH.md) — the psychology/behavioral-science grounding for the app's premise (decision fatigue, Levitt's coin-flip study, satisficing vs. maximizing, implementation intentions). Ground new feature proposals in this where it applies, rather than adding things arbitrarily.
- [SHARING-DESIGN.md](SHARING-DESIGN.md) — full design for the group-rooms feature, including a "Post-launch security review" section documenting two real authorization bugs that were found and fixed (any authenticated stranger could otherwise forge a room's result or rewrite its deadline). Read this before touching `FIREBASE-RULES.json` or `room.js`'s resolution logic.

## Testing this app

- Local server: `python -m http.server 8000` from the repo root. `.claude/launch.json` is already configured for the Browser pane preview.
- **The Browser pane's `requestAnimationFrame` loop doesn't reliably run when the pane isn't actively displayed/composited.** This breaks the live countdown tick and vote-resolution loop in automated testing. Don't rely on watching a countdown visually reach 0 — instead, fast-forward by writing `endTime` (or `allVotedAt`) directly via the Firebase SDK in a `javascript_tool` call, then invoke `resolveIfExpired()` / `maybeStartGracePeriod()` directly — both are exported from `room.js` specifically to make this possible.
- **To simulate a second room participant, don't use two Browser pane tabs** — they share the same browser storage and resolve to the *same* anonymous auth identity, which silently breaks host/participant tests. Instead, create a second named Firebase app instance in the same tab: `initializeApp(firebaseConfig, 'participant2')` with `setPersistence(auth2, inMemoryPersistence)`.
- `room.js` is an ES module. Editing it and calling `import('./room.js')` again **in the same page load returns the stale cached version** — reload the page to pick up edits, or use a cache-busted import (`import('./room.js?t=' + Date.now())`) for isolated one-off testing. Note a freshly-imported instance has empty module state (`roomId` is `null`), so call `joinRoomFromHash()` on it first if the test needs consistent state.
- Console errors from earlier test rooms/actions persist across page loads in this environment — check the *timestamp* on a `PERMISSION_DENIED` before assuming it's from your current action; it's often a stale one from a prior test.
- Test rooms accumulate in the Firebase database with no way to delete them (no delete capability was designed in — a known, harmless limitation at hobby scale). Don't worry about cleaning them up.

## Deployment

- GitHub: `Jonasgg99/choice-timer`, default branch `main`
- `main` auto-deploys to GitHub Pages: **https://jonasgg99.github.io/choice-timer/**
- Check build status: `gh api repos/Jonasgg99/choice-timer/pages/builds/latest --jq '.status'`
- Small changes go straight to `main`. The one large feature so far (group rooms) was built on `feature/group-voting-rooms` and merged after testing — use a branch again for anything similarly sized/risky, ask before merging.

## Current state

Check [IDEAS.md](IDEAS.md)'s Shipped section and `git log` for what's actually built — this file won't try to keep a duplicate status summary in sync. As of the last update here: solo mode and group voting rooms are both shipped and live on `main`.

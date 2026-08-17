# Speak your question — design

Voice input for the setup screen's question field, from the 2026-08-18 solo-experience brainstorm (see [IDEAS.md](../../../IDEAS.md)'s "From the 2026-08-18 solo-experience brainstorm" section for the other ideas from that session). Goal: reduce friction to *starting* a decision — typing a full question is more effort than tapping a mic and saying it.

## Scope

Question field only, not custom-option inputs — that's where the typing friction actually is (a full sentence vs. a couple of words per option). No new dependency: the browser's native `SpeechRecognition` / `webkitSpeechRecognition` API, already built into Chrome and Edge.

## Where it lives

Implemented in `redesign.js`, not `app.js`, following the pattern every other enhancement in that file already uses: wrap the native element, keep it as the source of truth, feature-detect and no-op cleanly if unsupported. This means:
- Zero changes to `app.js`.
- If `redesign.js` fails to load (or the browser lacks the API), the question field behaves exactly as it does today — no dead button, nothing to hide.

## Browser support

`SpeechRecognition` is solid in Chrome/Edge, absent in Firefox, and unsupported in Safari (desktop and iOS). Feature-detected via `window.SpeechRecognition || window.webkitSpeechRecognition`; if neither exists, the whole block is skipped and no mic button is ever created. This is a real long-term gap on iPhone specifically — noted in IDEAS.md as a forward-looking tie-in to the already-backlogged PWA idea (#12), not something this feature attempts to solve.

## Interaction

1. A mic button appears inside the question field (absolutely positioned, right-aligned), created only when the API is available.
2. Click starts recognition (single utterance — `interimResults: false`, `maxAlternatives: 1`, `lang` from `navigator.language`). The button gets a `.listening` state: an accent-colored pulse (not red — red is reserved for real errors elsewhere in this app), respecting `prefers-reduced-motion`.
3. Clicking again while listening calls `recognition.stop()` — a graceful stop that still processes whatever was heard, not `abort()`.
4. On `onresult`: the transcript is written into `#question.value`, an `input` event is dispatched (so the existing placeholder-cycling logic in `app.js` — which polls `.value !== ''` — behaves correctly with no changes needed there), and focus returns to the field. **The user reviews/edits before hitting Start** — recognition never auto-starts the countdown.
5. On `onerror` (permission denied, no speech, network): the button resets, and a one-line message reuses the existing `#setup-error` element and its styling ("Couldn't hear that — try typing it."), so it's not a silent dead end. `aborted` is excluded from this (a manual stop isn't an error).

## Icon

Drawn via CSS (a bordered capsule + a short stem below), `currentColor`, no SVG asset and no emoji — the same treatment already used for the coin/dice glyphs, to stay zero-asset and theme-adaptive between light/dark.

## Out of scope for this pass

- Custom-option inputs (see "Scope" above).
- Continuous/dictation-style recognition — single utterance only.
- Any server-side or account-based improvement to recognition accuracy.
- Making this available on iOS Safari — not solvable client-side; tracked against the PWA idea instead.

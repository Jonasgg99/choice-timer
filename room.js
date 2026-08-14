// Group rooms: shareable live voting sessions on top of the solo app.
// Only loaded when a "Share" action is actually used, or when opening a room link.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getDatabase, ref, set, update, get, remove, onValue, onDisconnect, push, query, limitToLast,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { generateHandle } from "./handles.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

const $ = (id) => document.getElementById(id);
const { showView } = window.__choiceTimer;

let uid = null;
let authReadyPromise = null;
let serverTimeOffset = 0;
let offsetReadyPromise = null;

let roomId = null;
let latestRoom = null;
let latestParticipants = {};
let myHandle = null;
let rafId = null;
let beepIntervalId = null;
let latestMessages = {};
let unsubscribeMessages = null;
let chatCollapsed = false;
let chatLastCategory = null;
let lastSeenMessageTs = 0;

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
const GRACE_PERIOD_MS = 5000;
const RECENT_ROOMS_KEY = "choiceTimerRecentRooms";
const MAX_RECENT_ROOMS = 5;
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Reads the locally-remembered room list. checkRecentRooms() (below) does
// the live presence check, plus this feature's emptyAt-based expiry: a
// room that's been empty for longer than EMPTY_ROOM_TTL_MS gets deleted
// and dropped from this list, not just shown as "empty right now" forever.
function getRecentRooms() {
  try {
    const raw = localStorage.getItem(RECENT_ROOMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function rememberRoom(id) {
  try {
    const rest = getRecentRooms().filter((r) => r.roomId !== id);
    rest.unshift({ roomId: id, joinedAt: Date.now() });
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(rest.slice(0, MAX_RECENT_ROOMS)));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — not critical
  }
}

function ensureAuth() {
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve, reject) => {
      const unsub = onAuthStateChanged(auth, (user) => {
        if (user) {
          uid = user.uid;
          unsub();
          resolve(uid);
        }
      });
      signInAnonymously(auth).catch(reject);
    });
  }
  return authReadyPromise;
}

function ensureServerOffset() {
  if (!offsetReadyPromise) {
    offsetReadyPromise = new Promise((resolve) => {
      onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
        serverTimeOffset = snap.val() || 0;
        resolve();
      });
    });
  }
  return offsetReadyPromise;
}

async function init() {
  await Promise.all([ensureAuth(), ensureServerOffset()]);
}

function now() {
  return Date.now() + serverTimeOffset;
}

function randomRoomId() {
  let id = "";
  for (let i = 0; i < 6; i += 1) {
    id += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return id;
}

function roomUrl(id) {
  const base = location.href.split("#")[0];
  return `${base}#room=${id}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Native share sheet (Messages, WhatsApp, Instagram DM, etc. — whatever's
// installed) when available, falling back to a clipboard copy otherwise.
// Returns "shared" | "copied" | "manual" | "cancelled" — callers that create
// something new (a room) must treat "cancelled" as "the user backed out,
// don't create anything."
async function shareLink(url) {
  if (navigator.share) {
    try {
      await navigator.share({ title: "Choice Timer", text: "Join and help decide:", url });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
      // other share failures fall through to clipboard
    }
  }
  const copied = await copyToClipboard(url);
  return copied ? "copied" : "manual";
}

async function shareCurrentRoomLink() {
  const outcome = await shareLink(roomUrl(roomId));
  if (outcome !== "shared" && outcome !== "cancelled") {
    const url = roomUrl(roomId);
    alert(outcome === "copied" ? `Link copied: ${url}` : `Share this link: ${url}`);
  }
}

// ---------- reading the setup form (mirrors app.js's own local-mode logic) ----------

function readSetupForm() {
  const question = $("question").value.trim();
  const isCustom = $("mode-custom").classList.contains("active");
  const options = isCustom
    ? Array.from(document.querySelectorAll("#custom-options .option-input"))
        .map((i) => i.value.trim())
        .filter((v) => v.length > 0)
    : ["Yes", "No"];

  const durationSelect = $("duration");
  const durationMs = durationSelect.value === "custom"
    ? (() => {
        const secs = parseInt($("duration-custom").value, 10);
        return Number.isNaN(secs) || secs <= 0 ? null : secs * 1000;
      })()
    : parseInt(durationSelect.value, 10) * 1000;

  return {
    question,
    options,
    durationMs,
    autoPick: $("auto-pick").checked,
    maxExtensions: parseInt($("max-extensions").value, 10),
    extensionMs: parseInt($("extension-length").value, 10) * 1000,
  };
}

function showSetupError(msg) {
  const el = $("setup-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

// ---------- Firebase room operations ----------

// Sharing a room never starts its countdown by default — that's a separate,
// explicit step (the host's own "Ask the group" action) so there's time to
// invite people before the timer is running. `startImmediately` is only used
// when converting an already-running solo countdown into a room, where the
// countdown is meant to keep going, not pause.
async function createRoomInFirebase(form, id, { startImmediately = false } = {}) {
  await init();

  // Written in two steps: security rules for every other field check the
  // room's hostUid, which isn't visible to sibling fields within one shared
  // multi-path write — it has to already exist in the database first.
  await set(ref(db, `rooms/${id}/hostUid`), uid);
  await update(ref(db, `rooms/${id}`), {
    question: form.question || "",
    options: form.options || [],
    durationMs: form.durationMs || 30000,
    autoPick: !!form.autoPick,
    extensionMs: form.extensionMs || 15000,
    maxExtensions: form.maxExtensions || 0,
    extensionsRemaining: form.maxExtensions || 0,
    state: startImmediately ? "countdown" : "waiting",
    endTime: startImmediately ? now() + form.durationMs : null,
  });
  return id;
}

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

async function postQuestionToRoom(form) {
  await update(ref(db, `rooms/${roomId}`), {
    question: form.question,
    options: form.options,
    durationMs: form.durationMs,
    autoPick: !!form.autoPick,
    extensionMs: form.extensionMs,
    maxExtensions: form.maxExtensions,
    extensionsRemaining: form.maxExtensions,
    state: "countdown",
    endTime: now() + form.durationMs,
    votes: null,
    result: null,
    allVotedAt: null,
  });
}

async function extendRoom() {
  const snap = await get(ref(db, `rooms/${roomId}`));
  const room = snap.val();
  if (!room || room.extensionsRemaining <= 0) return;
  await update(ref(db, `rooms/${roomId}`), {
    extensionsRemaining: room.extensionsRemaining - 1,
    endTime: now() + room.extensionMs,
    state: "countdown",
    allVotedAt: null,
  });
}

async function castVote(optionIndex) {
  await init();
  const myCurrentVote = latestRoom && latestRoom.votes ? latestRoom.votes[uid] : undefined;
  const voteRef = ref(db, `rooms/${roomId}/votes/${uid}`);

  if (myCurrentVote === optionIndex) {
    await remove(voteRef); // clicking your own selection again unselects it
    return;
  }

  await set(voteRef, optionIndex);
  if (latestRoom && latestRoom.state === "timeout_waiting") {
    await update(ref(db, `rooms/${roomId}`), {
      state: "result",
      result: { answer: latestRoom.options[optionIndex], meta: "overtime" },
    });
  }
}

// Host-only: once every current participant has voted, start a short grace
// window (rather than resolving instantly) so people can still change their
// mind. The main countdown remains the backstop for anyone who never votes.
export async function maybeStartGracePeriod(room) {
  if (!room || room.state !== "countdown" || room.allVotedAt) return;
  if (!isHost()) return;
  const participantIds = Object.keys(latestParticipants || {});
  if (participantIds.length === 0) return;
  const votes = room.votes || {};
  const allVoted = participantIds.every((pid) => pid in votes);
  if (!allVoted) return;
  if (!room.endTime || room.endTime - now() <= GRACE_PERIOD_MS) return; // already close enough to the deadline

  // A tie doesn't get an early lock-in — let the full timer keep running (in
  // case someone changes their mind, or a late joiner breaks it) rather than
  // settling it with a random pick after only a few seconds.
  const counts = new Array(room.options.length).fill(0);
  Object.values(votes).forEach((idx) => {
    if (typeof idx === "number" && counts[idx] !== undefined) counts[idx] += 1;
  });
  const max = Math.max(...counts);
  const leaders = counts.filter((c) => c === max).length;
  if (leaders > 1) return; // tied — keep counting down normally instead

  await set(ref(db, `rooms/${roomId}/allVotedAt`), now());
}

async function requestNewQuestion() {
  await update(ref(db, `rooms/${roomId}`), {
    state: "waiting",
    question: "",
    options: [],
    votes: null,
    result: null,
    endTime: null,
    allVotedAt: null,
  });
}

export async function resolveIfExpired(room) {
  if (!room || room.state === "result") return;
  if (room.state !== "countdown" && room.state !== "timeout_waiting") return;

  const deadlinePassed = room.endTime && room.endTime - now() <= 0;
  const gracePassed = room.allVotedAt && now() - room.allVotedAt >= GRACE_PERIOD_MS;
  if (!deadlinePassed && !gracePassed) return;

  const votes = room.votes || {};
  const counts = new Array(room.options.length).fill(0);
  Object.values(votes).forEach((idx) => {
    if (typeof idx === "number" && counts[idx] !== undefined) counts[idx] += 1;
  });
  const totalVotes = counts.reduce((a, b) => a + b, 0);

  if (totalVotes === 0) {
    if (room.autoPick) {
      const pick = Math.floor(Math.random() * room.options.length);
      await update(ref(db, `rooms/${roomId}`), {
        state: "result",
        result: { answer: room.options[pick], meta: "auto-picked" },
      });
    } else if (room.state !== "timeout_waiting") {
      await update(ref(db, `rooms/${roomId}`), { state: "timeout_waiting" });
    }
    return;
  }

  const max = Math.max(...counts);
  const leaders = counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
  const winnerIndex = leaders.length === 1
    ? leaders[0]
    : leaders[Math.floor(Math.random() * leaders.length)];
  await update(ref(db, `rooms/${roomId}`), {
    state: "result",
    result: {
      answer: room.options[winnerIndex],
      meta: leaders.length === 1 ? "voted" : "tie-break",
    },
  });
}

// ---------- audio (kept minimal, separate from app.js's private helpers) ----------

let audioCtx = null;
function ensureAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function beep(freq = 220, durationMs = 250) {
  if (document.getElementById('mute-alarm').checked) return;
  const ctx = ensureAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
}

function startBeeping() {
  stopBeeping();
  beep();
  beepIntervalId = setInterval(beep, 1000);
}
function stopBeeping() {
  if (beepIntervalId) {
    clearInterval(beepIntervalId);
    beepIntervalId = null;
  }
}

function successChime() {
  const ctx = ensureAudioCtx();
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t + i * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.27);
  });
}

// ---------- rendering ----------

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}`;
}

function isHost() {
  return latestRoom && latestRoom.hostUid === uid;
}

// If the current host is no longer present (left, or their tab disconnected),
// any present participant may claim hostUid per the security rules — but only
// one of us should actually try. Every client computes "am I the earliest
// joiner still here" from the same synced participants data, so in the
// well-behaved case exactly one client attempts the claim, and it converges
// on the oldest remaining participant without the rules needing to verify
// that mathematically (Realtime Database rules can't aggregate/loop).
function maybeClaimAbandonedHost(room) {
  if (!room || !room.hostUid || !roomId) return;
  if (room.hostUid === uid) return; // already host
  const participants = latestParticipants || {};
  if (!(uid in participants)) return; // not fully joined yet
  if (room.hostUid in participants) return; // current host still here

  const myJoinedAt = participants[uid].joinedAt;
  const iAmOldest = Object.entries(participants).every(
    ([pid, p]) => pid === uid || p.joinedAt >= myJoinedAt,
  );
  if (!iAmOldest) return;

  set(ref(db, `rooms/${roomId}/hostUid`), uid).catch(() => {
    // lost the race to another equally-old participant, or rules rejected it — fine
  });
}

function renderParticipantBar() {
  const bar = $("participant-bar");
  const entries = Object.values(latestParticipants || {});
  const count = entries.length;
  if (count === 0) {
    bar.classList.add("hidden");
    return;
  }
  const names = entries.map((p) => p.handle).join(", ");
  bar.textContent = `${count} here: ${names}`;
  bar.classList.remove("hidden");
}

function renderOptionsWithTallies(container, options, votes, onVote) {
  container.innerHTML = "";
  const counts = new Array(options.length).fill(0);
  Object.values(votes || {}).forEach((idx) => {
    if (typeof idx === "number" && counts[idx] !== undefined) counts[idx] += 1;
  });
  const myVoteIndex = votes && uid in votes ? votes[uid] : null;

  options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    if (i === myVoteIndex) btn.classList.add("my-vote");

    const label = document.createElement("span");
    label.textContent = opt;
    const tally = document.createElement("span");
    tally.className = "tally";
    tally.textContent = counts[i] > 0 ? `${counts[i]} vote${counts[i] === 1 ? "" : "s"}` : "";

    btn.appendChild(label);
    btn.appendChild(tally);
    btn.addEventListener("click", () => onVote(i));
    container.appendChild(btn);
  });
}

const resultMetaText = {
  voted: "The group decided — good enough, go with it.",
  "tie-break": "It was a tie — settled at random.",
  "auto-picked": "Nobody voted in time — picked at random.",
  overtime: "Time ran out, but a vote came in.",
};

const REVEAL_DELAY_MS = 450;
let lastRenderedResultKey = null;

function renderRoom() {
  const room = latestRoom;
  renderParticipantBar();

  if (!room) return;

  updateChatDefaultCollapse(room.state);
  renderChatCollapseState();

  // Once in a room, inviting more people is always available, in every state.
  $("invite-more-btn").classList.remove("hidden");
  $("countdown-share-btn").classList.add("hidden"); // superseded by the persistent button above

  const iAmHost = isHost();
  if (room.state !== "result") lastRenderedResultKey = null;

  if (room.state === "waiting") {
    stopBeeping();
    document.body.classList.remove("timeout-flash");
    if (iAmHost) {
      $("start-btn").classList.add("hidden");
      $("setup-share-btn").classList.add("hidden");
      $("ask-group-btn").classList.remove("hidden");
      showView("setup");
    } else {
      showView("waiting");
    }
    return;
  }

  $("start-btn").classList.remove("hidden");
  $("setup-share-btn").classList.remove("hidden");
  $("ask-group-btn").classList.add("hidden");

  if (room.state === "countdown" || room.state === "timeout_waiting") {
    $("countdown-question").textContent = room.question;
    renderOptionsWithTallies($("options-container"), room.options, room.votes, (i) => castVote(i));

    const timerDisplay = $("timer-display");
    const extendBtn = $("extend-btn");
    const extendInfo = $("extend-info");

    if (room.state === "timeout_waiting") {
      timerDisplay.textContent = "0";
      timerDisplay.classList.remove("warning");
      timerDisplay.classList.add("critical");
      document.body.classList.add("timeout-flash");
      if (!beepIntervalId) startBeeping();
      if (iAmHost && room.extensionsRemaining > 0) {
        extendBtn.textContent = `+${room.extensionMs / 1000}s (${room.extensionsRemaining} left)`;
        extendBtn.classList.remove("hidden");
      } else {
        extendBtn.classList.add("hidden");
      }
      extendInfo.textContent = "Time's up — vote, or wait for the host to extend.";
      extendInfo.classList.remove("hidden");
    } else {
      stopBeeping();
      document.body.classList.remove("timeout-flash");
      extendBtn.classList.add("hidden");
      if (room.allVotedAt) {
        extendInfo.textContent = "Everyone's voted — locking in shortly, still time to change your mind…";
        extendInfo.classList.remove("hidden");
      } else {
        extendInfo.classList.add("hidden");
      }
    }

    showView("countdown");
    return;
  }

  if (room.state === "result") {
    // Kept outside the dedup guard below: host status can change (via
    // ownership transfer) without the result itself changing, and this
    // needs to stay current even when we skip re-playing the reveal.
    $("new-question-btn").classList.toggle("hidden", !iAmHost);
    $("restart-btn").textContent = "Leave room";

    const resultKey = JSON.stringify(room.result);
    if (resultKey === lastRenderedResultKey) return; // already showing this exact result
    lastRenderedResultKey = resultKey;

    stopBeeping();
    document.body.classList.remove("timeout-flash");

    // Small pause before switching views so the reveal doesn't feel instant.
    setTimeout(() => {
      $("result-answer").textContent = room.result.answer;
      $("result-meta").textContent = resultMetaText[room.result.meta] || "";
      window.__choiceTimerFollowup.reset({ showPersonal: false });
      showView("result");

      successChime();
      const check = $("result-check");
      check.classList.remove("pop");
      void check.offsetWidth;
      check.classList.add("pop");
    }, REVEAL_DELAY_MS);
  }
}

function tick() {
  if (rafId) cancelAnimationFrame(rafId);
  const room = latestRoom;
  if (room && (room.state === "countdown" || room.state === "timeout_waiting")) {
    const remaining = room.endTime - now();
    const timerDisplay = $("timer-display");
    if (room.state === "countdown") {
      timerDisplay.textContent = formatTime(remaining);
      timerDisplay.classList.toggle("warning", remaining <= 10000 && remaining > 5000);
      timerDisplay.classList.toggle("critical", remaining <= 5000 && remaining > 0);
      maybeStartGracePeriod(room);
    }
    resolveIfExpired(room);
  }
  rafId = requestAnimationFrame(tick);
}

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
    scrollChatToBottom();
  }
}

function setChatCollapsed(collapsed) {
  chatCollapsed = collapsed;
  renderChatCollapseState();
}

// #chat-messages has display:none while the panel is collapsed (via the
// shared .hidden class on #chat-body), so scrollHeight reads 0 and this is a
// no-op then — that's fine, renderChatCollapseState() re-calls this once the
// panel actually becomes visible.
function scrollChatToBottom() {
  const container = $("chat-messages");
  container.scrollTop = container.scrollHeight;
}

function renderChatMessages() {
  const container = $("chat-messages");
  const entries = Object.values(latestMessages).sort((a, b) => a.ts - b.ts);

  container.innerHTML = "";
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chat-empty";
    empty.textContent = "No messages yet.";
    container.appendChild(empty);
  }
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
  scrollChatToBottom();

  const latestTs = entries.length ? entries[entries.length - 1].ts : 0;
  if (chatCollapsed && latestTs > lastSeenMessageTs) {
    $("chat-unread-dot").classList.remove("hidden");
  }
}

// ---------- subscription ----------

let unsubscribeRoom = null;
let unsubscribeParticipants = null;

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

// Fully disconnects from the current room — used by "Start over," so leaving
// doesn't quietly keep you subscribed and get yanked back in the moment the
// host posts a new question. Does nothing if not currently in a room.
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
  latestRoom = null;
  latestParticipants = {};
  latestMessages = {};
  chatCollapsed = false;
  chatLastCategory = null;
  lastSeenMessageTs = 0;
  myHandle = null;
  lastRenderedResultKey = null;

  $("participant-bar").classList.add("hidden");
  $("invite-more-btn").classList.add("hidden");
  $("recent-rooms").classList.add("hidden");
  $("setup-share-status").classList.add("hidden");
  $("setup-share-status").textContent = "";
  $("restart-btn").textContent = "Start over";
  $("chat-panel").classList.add("hidden");
  $("chat-messages").innerHTML = "";
  $("chat-input").value = "";
  $("chat-unread-dot").classList.add("hidden");
  $("chat-error").classList.add("hidden");
  $("chat-body").classList.remove("hidden");
  $("chat-toggle").setAttribute("aria-expanded", "true");

  history.replaceState(null, "", location.pathname + location.search);
}

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

  $("extend-btn").onclick = () => extendRoom();
  $("new-question-btn").onclick = () => requestNewQuestion();
  $("invite-more-btn").onclick = () => shareCurrentRoomLink();
  $("ask-group-btn").onclick = async () => {
    const form = readSetupForm();
    $("setup-error").classList.add("hidden");
    if (!form.question) return showSetupError("Enter a question first.");
    if (form.options.length < 2) return showSetupError("Add at least two options.");
    if (!form.durationMs) return showSetupError("Enter a valid timer length.");
    await postQuestionToRoom(form);
  };

  $("chat-panel").classList.remove("hidden");
  $("chat-form").onsubmit = (e) => {
    e.preventDefault();
    const input = $("chat-input");
    const text = input.value;
    input.value = "";
    $("chat-error").classList.add("hidden");
    sendChatMessage(text).catch(() => {
      input.value = text;
      $("chat-error").textContent = "Message didn't send — try again.";
      $("chat-error").classList.remove("hidden");
    });
  };
  $("chat-toggle").onclick = () => setChatCollapsed(!chatCollapsed);
}

// ---------- public entry points, called from app.js ----------

export async function createRoomFromSetupForm() {
  const form = readSetupForm();
  $("setup-error").classList.add("hidden");

  // Generate the id/link and attempt the share BEFORE touching Firebase at
  // all — if the user backs out of the native share sheet, nothing should
  // have been created, and they should just land back on the setup screen.
  const id = randomRoomId();
  const url = roomUrl(id);
  const outcome = await shareLink(url);
  if (outcome === "cancelled") return;

  const statusEl = $("setup-share-status");
  statusEl.textContent = "Creating room…";
  statusEl.classList.remove("hidden");

  await createRoomInFirebase(form, id);
  statusEl.textContent = outcome === "shared" ? "Shared — waiting for people to join…"
    : outcome === "copied" ? `Link copied: ${url}`
    : `Share this link: ${url}`;

  history.replaceState(null, "", `#room=${id}`);
  await enterRoom(id);
}

export async function shareCurrentCountdown() {
  if (roomId) {
    // Already in a room — this is "invite more people," nothing new to create.
    await shareCurrentRoomLink();
    return;
  }

  const snapshot = window.__choiceTimer.getLocalSnapshot();
  if (!snapshot.remainingMs || snapshot.remainingMs <= 0) return;

  const id = randomRoomId();
  const url = roomUrl(id);
  const outcome = await shareLink(url);
  if (outcome === "cancelled") return; // local countdown keeps running, untouched

  window.__choiceTimer.stopLocalCountdown();

  await createRoomInFirebase({
    question: snapshot.question,
    options: snapshot.options,
    durationMs: snapshot.remainingMs,
    autoPick: snapshot.autoPick,
    maxExtensions: snapshot.extensionsRemaining,
    extensionMs: snapshot.extensionMs,
  }, id, { startImmediately: true });

  if (outcome !== "shared") alert(outcome === "copied" ? `Link copied: ${url}` : `Share this link: ${url}`);

  history.replaceState(null, "", `#room=${id}`);
  await enterRoom(id);
}

export async function joinRoomFromHash() {
  const match = location.hash.match(/^#room=([A-Za-z0-9]+)$/);
  if (!match) return;
  await enterRoom(match[1]);
}

// Called only when app.js already knows localStorage has remembered rooms,
// so a first-time visitor never triggers this (and never loads Firebase).
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
  const label = document.createElement("p");
  label.className = "post-result-question";
  label.textContent = "Rejoin a room:";
  container.appendChild(label);

  const row = document.createElement("div");
  row.className = "chip-row";
  results.forEach((r) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn";
    btn.textContent = r.count > 0 ? `${r.roomId} · ${r.count} here` : `${r.roomId} · empty right now`;
    btn.addEventListener("click", () => {
      history.replaceState(null, "", `#room=${r.roomId}`);
      enterRoom(r.roomId);
    });
    row.appendChild(btn);
  });
  container.appendChild(row);
  container.classList.remove("hidden");
}

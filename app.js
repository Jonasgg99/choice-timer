(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    // setup
    viewSetup: $('view-setup'),
    question: $('question'),
    modeYesNo: $('mode-yesno'),
    modeCustom: $('mode-custom'),
    customOptions: $('custom-options'),
    addOption: $('add-option'),
    duration: $('duration'),
    durationCustom: $('duration-custom'),
    advancedToggle: $('advanced-toggle'),
    advancedPanel: $('advanced-panel'),
    autoPick: $('auto-pick'),
    maxExtensions: $('max-extensions'),
    extensionLength: $('extension-length'),
    startBtn: $('start-btn'),
    setupError: $('setup-error'),
    muteAlarm: $('mute-alarm'),
    setupShareBtn: $('setup-share-btn'),
    setupShareStatus: $('setup-share-status'),
    askGroupBtn: $('ask-group-btn'),

    // waiting (group rooms)
    viewWaiting: $('view-waiting'),

    // countdown
    viewCountdown: $('view-countdown'),
    countdownQuestion: $('countdown-question'),
    timerDisplay: $('timer-display'),
    extendInfo: $('extend-info'),
    optionsContainer: $('options-container'),
    extendBtn: $('extend-btn'),
    countdownShareBtn: $('countdown-share-btn'),

    // result
    viewResult: $('view-result'),
    resultCheck: $('result-check'),
    resultLabel: $('result-label'),
    resultAnswer: $('result-answer'),
    resultMeta: $('result-meta'),
    restartBtn: $('restart-btn'),
    newQuestionBtn: $('new-question-btn'),
  };

  const state = {
    mode: 'yesno', // 'yesno' | 'custom'
    question: '',
    options: [],
    endTime: null,
    timedOut: false,
    extensionsRemaining: 0,
    extensionMs: 15000,
    autoPick: false,
    rafId: null,
    beepIntervalId: null,
  };

  let audioCtx = null;

  function ensureAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function successChime() {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5-E5-G5 arpeggio
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.27);
    });
  }

  function beep(freq = 880, durationMs = 150) {
    if (els.muteAlarm.checked) return;
    const ctx = ensureAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
  }

  // ---------- view switching ----------

  function showView(name) {
    els.viewSetup.classList.toggle('hidden', name !== 'setup');
    els.viewWaiting.classList.toggle('hidden', name !== 'waiting');
    els.viewCountdown.classList.toggle('hidden', name !== 'countdown');
    els.viewResult.classList.toggle('hidden', name !== 'result');
  }

  // ---------- setup view ----------

  els.modeYesNo.addEventListener('click', () => setMode('yesno'));
  els.modeCustom.addEventListener('click', () => setMode('custom'));

  function setMode(mode) {
    state.mode = mode;
    els.modeYesNo.classList.toggle('active', mode === 'yesno');
    els.modeCustom.classList.toggle('active', mode === 'custom');
    els.customOptions.classList.toggle('hidden', mode !== 'custom');
  }

  els.addOption.addEventListener('click', () => {
    const rows = els.customOptions.querySelectorAll('.option-row');
    if (rows.length >= 6) return;
    const row = document.createElement('div');
    row.className = 'option-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'option-input';
    input.maxLength = 60;
    input.placeholder = `Option ${rows.length + 1}`;
    row.appendChild(input);
    els.customOptions.insertBefore(row, els.addOption);
    if (rows.length + 1 >= 6) els.addOption.classList.add('hidden');
  });

  els.duration.addEventListener('change', () => {
    els.durationCustom.style.display = els.duration.value === 'custom' ? 'block' : 'none';
  });

  els.advancedToggle.addEventListener('click', () => {
    els.advancedPanel.classList.toggle('hidden');
  });

  function readOptions() {
    if (state.mode === 'yesno') return ['Yes', 'No'];
    const inputs = els.customOptions.querySelectorAll('.option-input');
    return Array.from(inputs)
      .map((i) => i.value.trim())
      .filter((v) => v.length > 0);
  }

  function readDurationMs() {
    if (els.duration.value === 'custom') {
      const secs = parseInt(els.durationCustom.value, 10);
      return isNaN(secs) || secs <= 0 ? null : secs * 1000;
    }
    return parseInt(els.duration.value, 10) * 1000;
  }

  function showSetupError(msg) {
    els.setupError.textContent = msg;
    els.setupError.classList.remove('hidden');
  }

  els.startBtn.addEventListener('click', () => {
    els.setupError.classList.add('hidden');

    const question = els.question.value.trim();
    if (!question) return showSetupError('Enter a question first.');

    const options = readOptions();
    if (options.length < 2) return showSetupError('Add at least two options.');

    const durationMs = readDurationMs();
    if (!durationMs) return showSetupError('Enter a valid timer length.');

    ensureAudioCtx();

    state.question = question;
    state.options = options;
    state.autoPick = els.autoPick.checked;
    state.extensionsRemaining = parseInt(els.maxExtensions.value, 10);
    state.extensionMs = parseInt(els.extensionLength.value, 10) * 1000;

    startCountdown(durationMs);
  });

  // ---------- countdown view ----------

  function renderOptions() {
    els.optionsContainer.innerHTML = '';
    state.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => selectOption(opt));
      els.optionsContainer.appendChild(btn);
    });
  }

  function startCountdown(durationMs) {
    state.endTime = Date.now() + durationMs;
    state.timedOut = false;
    els.countdownQuestion.textContent = state.question;
    renderOptions();
    els.extendBtn.classList.add('hidden');
    els.extendInfo.classList.add('hidden');
    document.body.classList.remove('timeout-flash');
    stopBeeping();
    showView('countdown');
    tick();
  }

  function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
  }

  function tick() {
    if (state.timedOut) return; // handleTimeout takes over
    const remaining = state.endTime - Date.now();

    els.timerDisplay.textContent = formatTime(remaining);
    els.timerDisplay.classList.toggle('warning', remaining <= 10000 && remaining > 5000);
    els.timerDisplay.classList.toggle('critical', remaining <= 5000 && remaining > 0);

    if (remaining <= 0) {
      handleTimeout();
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function handleTimeout() {
    els.timerDisplay.textContent = '0';
    els.timerDisplay.classList.remove('warning');
    els.timerDisplay.classList.add('critical');

    if (state.autoPick) {
      const pick = state.options[Math.floor(Math.random() * state.options.length)];
      beep(660, 200);
      finish(pick, 'auto-picked');
      return;
    }

    state.timedOut = true;
    document.body.classList.add('timeout-flash');
    startBeeping();

    if (state.extensionsRemaining > 0) {
      els.extendBtn.textContent = `+${state.extensionMs / 1000}s (${state.extensionsRemaining} left)`;
      els.extendBtn.classList.remove('hidden');
    } else {
      els.extendBtn.classList.add('hidden');
    }
    els.extendInfo.textContent = "Time's up — pick one, or extend.";
    els.extendInfo.classList.remove('hidden');
  }

  function startBeeping() {
    stopBeeping();
    beep(220, 250);
    state.beepIntervalId = setInterval(() => beep(220, 250), 1000);
  }

  function stopBeeping() {
    if (state.beepIntervalId) {
      clearInterval(state.beepIntervalId);
      state.beepIntervalId = null;
    }
  }

  els.extendBtn.addEventListener('click', () => {
    if (state.extensionsRemaining <= 0) return;
    state.extensionsRemaining -= 1;
    state.endTime = Date.now() + state.extensionMs;
    state.timedOut = false;
    document.body.classList.remove('timeout-flash');
    stopBeeping();
    els.extendBtn.classList.add('hidden');
    els.extendInfo.classList.add('hidden');
    tick();
  });

  function selectOption(opt) {
    const meta = state.timedOut ? 'overtime' : 'tapped';
    finish(opt, meta);
  }

  // ---------- result view ----------

  const metaText = {
    tapped: 'Good enough — go with it.',
    overtime: "Time ran out, but you still made the call.",
    'auto-picked': "No time left to overthink it — this one's it.",
  };

  const REVEAL_DELAY_MS = 450;

  function finish(answer, meta) {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
    stopBeeping();
    document.body.classList.remove('timeout-flash');

    // Small pause before switching views so the reveal doesn't feel instant.
    setTimeout(() => {
      els.resultAnswer.textContent = answer;
      els.resultMeta.textContent = metaText[meta] || '';
      els.restartBtn.textContent = 'Start over';
      window.__choiceTimerFollowup.reset({
        otherOptions: state.options.filter((o) => o !== answer),
      });
      showView('result');

      successChime();
      els.resultCheck.classList.remove('pop');
      void els.resultCheck.offsetWidth; // restart animation on repeat choices
      els.resultCheck.classList.add('pop');
    }, REVEAL_DELAY_MS);
  }

  els.restartBtn.addEventListener('click', async () => {
    els.question.value = '';
    if (location.hash.startsWith('#room=')) {
      try {
        const room = await import('./room.js');
        await room.leaveRoom();
      } catch (err) {
        console.error(err);
      }
    }
    showView('setup');
  });

  // ---------- group rooms (lazy-loaded, only when actually used) ----------

  els.setupShareBtn.addEventListener('click', async () => {
    els.setupShareBtn.disabled = true;
    try {
      const room = await import('./room.js');
      await room.createRoomFromSetupForm();
    } catch (err) {
      console.error(err);
      showSetupError('Could not create the room — check your connection and try again.');
    } finally {
      els.setupShareBtn.disabled = false;
    }
  });

  els.countdownShareBtn.addEventListener('click', async () => {
    els.countdownShareBtn.disabled = true;
    try {
      const room = await import('./room.js');
      await room.shareCurrentCountdown();
    } catch (err) {
      console.error(err);
    } finally {
      els.countdownShareBtn.disabled = false;
    }
  });

  // Minimal surface room.js uses to read/stop a solo countdown when converting
  // it into a shared room, and to reuse this file's view switching.
  window.__choiceTimer = {
    showView,
    getLocalSnapshot() {
      return {
        question: state.question,
        options: state.options,
        remainingMs: state.endTime ? state.endTime - Date.now() : null,
        autoPick: state.autoPick,
        extensionMs: state.extensionMs,
        extensionsRemaining: state.extensionsRemaining,
      };
    },
    stopLocalCountdown() {
      if (state.rafId) cancelAnimationFrame(state.rafId);
      state.rafId = null;
      stopBeeping();
      document.body.classList.remove('timeout-flash');
    },
  };

  if (location.hash.startsWith('#room=')) {
    import('./room.js').then((room) => room.joinRoomFromHash());
  } else {
    els.question.focus();

    // Only bother loading Firebase to check for rejoinable rooms if this
    // browser has actually used group rooms before — a first-time visitor
    // never triggers this, keeping solo mode's zero-dependency promise.
    let hasRecentRooms = false;
    try {
      const raw = localStorage.getItem('choiceTimerRecentRooms');
      hasRecentRooms = raw && JSON.parse(raw).length > 0;
    } catch {
      hasRecentRooms = false;
    }
    if (hasRecentRooms) {
      import('./room.js').then((room) => room.checkRecentRooms());
    }
  }

  // ---------- rotating placeholder ----------

  const PLACEHOLDER_QUESTIONS = [
    'Should I go for a bike ride?',
    'What should I make for dinner?',
    'Should I apply for this job?',
    'Coffee or tea?',
    'Should I text them back?',
    'What movie should we watch tonight?',
    'Should I take the promotion?',
    'Should I go to the gym today?',
    'Which apartment should I pick?',
    'Should I say yes to this?',
  ];

  let placeholderIndex = 0;

  function schedulePlaceholder(fn, delay) {
    setTimeout(fn, delay);
  }

  function typePlaceholder(text, i, onDone) {
    if (els.question.value !== '') {
      schedulePlaceholder(() => typePlaceholder(text, i, onDone), 300);
      return;
    }
    els.question.placeholder = text.slice(0, i);
    if (i < text.length) {
      schedulePlaceholder(() => typePlaceholder(text, i + 1, onDone), 40 + Math.random() * 20);
    } else {
      schedulePlaceholder(onDone, 1700);
    }
  }

  function erasePlaceholder(text, i, onDone) {
    if (els.question.value !== '') {
      schedulePlaceholder(() => erasePlaceholder(text, i, onDone), 300);
      return;
    }
    els.question.placeholder = text.slice(0, i);
    if (i > 0) {
      schedulePlaceholder(() => erasePlaceholder(text, i - 1, onDone), 25 + Math.random() * 10);
    } else {
      onDone();
    }
  }

  function cyclePlaceholder() {
    const text = PLACEHOLDER_QUESTIONS[placeholderIndex];
    typePlaceholder(text, 0, () => {
      erasePlaceholder(text, text.length, () => {
        placeholderIndex = (placeholderIndex + 1) % PLACEHOLDER_QUESTIONS.length;
        cyclePlaceholder();
      });
    });
  }

  // ---------- mute toggle ----------

  els.muteAlarm.checked = localStorage.getItem('choiceTimerMuted') === 'true';
  els.muteAlarm.addEventListener('change', () => {
    localStorage.setItem('choiceTimerMuted', els.muteAlarm.checked);
  });

  // ---------- init ----------
  setMode('yesno');
  cyclePlaceholder();
})();

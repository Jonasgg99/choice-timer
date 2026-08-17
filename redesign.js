/* ==========================================================================
   Choice Timer — redesign.js
   Progressive enhancement only. Additive: it does not rename, remove or
   rebind anything app.js / room.js / followup.js rely on. Load it AFTER
   app.js. If it fails to load, the app still works — you just get selects
   instead of chips and a bare number instead of a ring.
   ========================================================================== */
(() => {
  const $ = (id) => document.getElementById(id);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- theme */
  const root = document.documentElement;
  const stored = localStorage.getItem('ct-theme');
  if (stored === 'light' || stored === 'dark') root.dataset.theme = stored;

  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.className = 'ct-theme-btn';
  themeBtn.setAttribute('aria-label', 'Switch between light and dark');
  themeBtn.addEventListener('click', () => {
    const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const current = root.dataset.theme || (systemDark ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('ct-theme', next);
  });
  document.body.appendChild(themeBtn);

  /* ------------------------------------------------- selects become chips
     The native <select> stays in the DOM, visually hidden, still focusable
     and still the source of truth — chips just write to it and fire the
     change event app.js already listens for. Keyboard and screen-reader
     behaviour is therefore unchanged.                                     */
  function chipify(select, { compact = false, label } = {}) {
    if (!select) return;
    const chips = document.createElement('div');
    chips.className = 'ct-chips' + (compact ? ' ct-chips--compact' : '');
    chips.setAttribute('aria-hidden', 'true');

    const buttons = [...select.options].map((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ct-chip';
      b.textContent = label ? label(opt) : opt.textContent;
      b.tabIndex = -1;
      if (opt.value === 'custom') b.dataset.custom = '';
      b.addEventListener('click', () => {
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
      });
      chips.appendChild(b);
      return { b, value: opt.value };
    });

    function sync() {
      buttons.forEach(({ b, value }) =>
        b.setAttribute('aria-pressed', String(value === select.value))
      );
    }

    select.classList.add('ct-sr-only');
    select.after(chips);
    select.addEventListener('change', sync);
    sync();
  }

  const shortDuration = (opt) =>
    ({ '10': '10s', '30': '30s', '60': '1 min', '300': '5 min' }[opt.value] || opt.textContent);

  chipify($('duration'), { label: shortDuration });
  chipify($('max-extensions'), { compact: true });
  chipify($('extension-length'), { compact: true, label: (o) => o.textContent.replace(' seconds', 's').replace('+1 minute', '+1m') });

  /* --------------------------------------------------- speak your question
     Only created when the API exists — nothing to hide otherwise. #question
     stays the source of truth: the mic just writes into it and dispatches
     the input event, same as typing would.                                */
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const question = $('question');

  if (SpeechRec && question) {
    const wrap = document.createElement('div');
    wrap.className = 'ct-question-wrap';
    question.replaceWith(wrap);
    wrap.appendChild(question);
    question.classList.add('has-mic');

    const micBtn = document.createElement('button');
    micBtn.type = 'button';
    micBtn.className = 'ct-mic-btn';
    micBtn.setAttribute('aria-label', 'Speak your question');
    const micIcon = document.createElement('span');
    micIcon.className = 'ct-mic-icon';
    micBtn.appendChild(micIcon);
    wrap.appendChild(micBtn);

    let recognition = null;
    let listening = false;

    function setListening(next) {
      listening = next;
      micBtn.classList.toggle('listening', next);
    }

    micBtn.addEventListener('click', () => {
      if (listening) {
        recognition?.stop();
        return;
      }

      recognition = new SpeechRec();
      recognition.lang = navigator.language || 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (e) => {
        question.value = e.results[0][0].transcript;
        question.dispatchEvent(new Event('input', { bubbles: true }));
        question.focus();
      };
      recognition.onerror = (e) => {
        if (e.error === 'aborted') return;
        const err = $('setup-error');
        if (err) {
          err.textContent = "Couldn't hear that — try typing it.";
          err.classList.remove('hidden');
        }
      };
      recognition.onend = () => setListening(false);

      $('setup-error')?.classList.add('hidden');
      setListening(true);
      try {
        recognition.start();
      } catch {
        setListening(false);
      }
    });
  }

  /* ------------------------------------------- advanced summary + a11y */
  const advToggle = $('advanced-toggle');
  const advPanel = $('advanced-panel');

  if (advToggle && advPanel) {
    const labelText = document.createElement('span');
    labelText.textContent = advToggle.textContent.trim();
    const summary = document.createElement('span');
    summary.className = 'ct-advanced-summary';
    const wrap = document.createElement('span');
    wrap.append(labelText, summary);
    advToggle.textContent = '';
    advToggle.appendChild(wrap);

    advToggle.setAttribute('aria-controls', 'advanced-panel');
    advPanel.setAttribute('role', 'group');

    function updateSummary() {
      const auto = $('auto-pick');
      const mute = $('mute-alarm');
      const n = Number($('max-extensions')?.value ?? 0);
      const len = $('extension-length')?.selectedOptions[0]?.textContent.trim() ?? '';
      const parts = [
        auto?.checked ? 'Auto-picks at zero' : 'Locks at zero',
        n === 0 ? 'no extensions' : `${n} extension${n === 1 ? '' : 's'} of ${len.replace('+', '+')}`,
        mute?.checked ? 'alarm muted' : 'alarm on',
      ];
      summary.textContent = parts.join(' · ');
    }

    ['auto-pick', 'mute-alarm', 'max-extensions', 'extension-length'].forEach((id) =>
      $(id)?.addEventListener('change', updateSummary)
    );
    updateSummary();

    const syncExpanded = () =>
      advToggle.setAttribute('aria-expanded', String(!advPanel.classList.contains('hidden')));
    syncExpanded();
    new MutationObserver(syncExpanded).observe(advPanel, { attributes: true, attributeFilter: ['class'] });
  }

  /* ------------------------------------------------------ countdown ring
     app.js keeps writing the text and the .warning / .critical classes on
     #timer-display; we only wrap it and read it. Colour thresholds stay in
     app.js — the ring picks its colour off those classes in CSS.          */
  const timer = $('timer-display');
  let ring = null;

  if (timer) {
    ring = document.createElement('div');
    ring.className = 'timer-ring';
    const inner = document.createElement('div');
    inner.className = 'timer-ring-inner';
    const unit = document.createElement('p');
    unit.className = 'timer-unit';
    unit.textContent = 'SECONDS';

    timer.replaceWith(ring);
    ring.appendChild(inner);
    inner.append(timer, unit);

    const seconds = (text) => {
      const t = (text || '').trim();
      if (t.includes(':')) {
        const [m, s] = t.split(':').map(Number);
        return (m || 0) * 60 + (s || 0);
      }
      const n = parseInt(t, 10);
      return Number.isNaN(n) ? null : n;
    };

    let peak = 0;
    let last = null;

    function tick() {
      const value = seconds(timer.textContent);
      if (value === null) return;

      // A fresh run or an extension both raise the ceiling, so the ring
      // refills instead of staying pinned near empty.
      if (last === null || value > peak || value > last) peak = Math.max(peak, value);
      if (peak <= 0) peak = value || 1;

      ring.style.setProperty('--p', String(Math.max(0, Math.min(100, (value / peak) * 100))));

      if (value === 0) {
        ring.setAttribute('data-locked', '');
        unit.textContent = "TIME'S UP";
        if (last !== 0 && !reduceMotion) navigator.vibrate?.([30, 60, 30]);
      } else {
        ring.removeAttribute('data-locked');
        unit.textContent = value === 1 ? 'SECOND' : 'SECONDS';
        // Haptics carry the urgency on a phone; the screen stays calm.
        if (value <= 5 && value !== last && !reduceMotion) navigator.vibrate?.(8);
      }

      // Re-trigger the one-tick breath without touching app.js.
      if (timer.classList.contains('critical') && value !== last) {
        timer.style.animation = 'none';
        void timer.offsetWidth;
        timer.style.animation = '';
      }

      last = value;
    }

    new MutationObserver(tick).observe(timer, {
      childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'],
    });
    tick();

    // A new question resets the ceiling.
    $('start-btn')?.addEventListener('click', () => { peak = 0; last = null; });
    $('ask-group-btn')?.addEventListener('click', () => { peak = 0; last = null; });
  }

  /* ------------------------------------------ resolution method, promoted
     "How it got decided" changes how you read the answer, so it moves above
     it as a pill. #result-meta stays in the DOM (app.js writes to it) — we
     mirror its text into the pill and keep the original as the detail line. */
  const meta = $('result-meta');
  const resultLabel = $('result-label');
  const check = $('result-check');

  if (meta && resultLabel && check) {
    const pill = document.createElement('p');
    pill.className = 'ct-method';
    const pillText = document.createElement('span');
    pill.append(check, pillText);
    resultLabel.before(pill);

    const syncPill = () => {
      const text = meta.textContent.trim();
      pillText.textContent = text;
      pill.classList.toggle('hidden', !text);
      meta.classList.add('hidden');
    };
    new MutationObserver(syncPill).observe(meta, { childList: true, characterData: true, subtree: true });
    syncPill();
  }

  /* -------------------------------------- result: one question at a time
     Reveal the follow-through prompt only once the satisfaction check has
     been answered. Same components, same handlers — just sequenced.        */
  const satisfaction = $('satisfaction-buttons');
  const followBlock = $('follow-through-chips')?.closest('.post-result-block');
  const ack = $('satisfaction-ack');

  if (satisfaction && followBlock && ack) {
    const gate = () => followBlock.classList.toggle('ct-gated', ack.classList.contains('hidden'));
    const style = document.createElement('style');
    style.textContent = '.post-result-block.ct-gated{display:none}';
    document.head.appendChild(style);
    new MutationObserver(gate).observe(ack, { attributes: true, attributeFilter: ['class'] });
    gate();
  }

  /* --------------------------------------------- chat: preview + counter */
  const chatToggle = $('chat-toggle');
  const chatBody = $('chat-body');
  const chatMessages = $('chat-messages');
  const dot = $('chat-unread-dot');

  if (chatToggle && chatBody && chatMessages && dot) {
    const preview = document.createElement('span');
    preview.className = 'ct-chat-preview';
    dot.after(preview);

    let unread = 0;

    const isOpen = () => !chatBody.classList.contains('hidden') && chatBody.offsetHeight > 0;

    function render() {
      const msgs = chatMessages.querySelectorAll('.chat-message');
      const last = msgs[msgs.length - 1];
      if (last) {
        const who = last.querySelector('.chat-message-sender')?.textContent.trim();
        const what = last.querySelector('.chat-message-text')?.textContent.trim() ?? '';
        preview.textContent = who ? `${who}: ${what}` : what;
      } else {
        preview.textContent = '';
      }

      if (unread > 0) {
        dot.dataset.count = String(unread);
        dot.textContent = unread > 9 ? '9+' : String(unread);
        dot.classList.remove('hidden');
      } else {
        delete dot.dataset.count;
        dot.textContent = '';
      }
    }

    new MutationObserver((records) => {
      const added = records.some((r) => r.addedNodes.length);
      if (added && !isOpen()) unread += 1;
      render();
    }).observe(chatMessages, { childList: true });

    chatToggle.addEventListener('click', () => {
      // Runs after app.js's own handler has flipped the panel.
      setTimeout(() => {
        if (isOpen()) { unread = 0; render(); }
      }, 0);
    });

    render();
  }
})();

// Post-result extras shared by both solo and group modes, since they both
// render into the same #view-result markup — though in practice both blocks
// here are hidden in group mode (see room.js's reset({ showPersonal: false })
// calls), since they're framed around one person's own decision/follow-through.
(() => {
  const $ = (id) => document.getElementById(id);

  const satisfactionButtons = $('satisfaction-buttons');
  const satisfactionAck = $('satisfaction-ack');
  const chips = document.querySelectorAll('#follow-through-chips .chip-btn');
  const timeInput = $('follow-through-time');
  const datetimeInput = $('follow-through-datetime');
  const calendarLinks = $('calendar-links');
  const icsLink = $('add-to-calendar');
  const googleLink = $('add-to-google-calendar');

  let currentOtherOptions = [];

  // "Not happy" surfaces what else was on the table — not to invite a redo
  // right now (the choice is locked in), but as a concrete note for next time.
  function showAck(kind) {
    satisfactionButtons.classList.add('hidden');
    if (kind === 'yes') {
      satisfactionAck.textContent = 'Good — go with it.';
    } else {
      const alt = currentOtherOptions.join(', ');
      satisfactionAck.textContent = alt
        ? `Noted — for next time, the other option was: ${alt}.`
        : "That's alright. You still get to move on.";
    }
    satisfactionAck.classList.remove('hidden');
  }

  $('satisfaction-yes').addEventListener('click', () => showAck('yes'));
  $('satisfaction-no').addEventListener('click', () => showAck('no'));

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function icsTimestamp(d) {
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  }

  function buildIcs(summary, start, end) {
    const uid = `${Date.now()}@choice-timer`;
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Choice Timer//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${icsTimestamp(new Date())}`,
      `DTSTART:${icsTimestamp(start)}`,
      `DTEND:${icsTimestamp(end)}`,
      `SUMMARY:${summary.replace(/[\r\n]/g, ' ')}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  // .ics is the universal option — works with every calendar app via
  // import, no accounts or API keys. Google Calendar also gets a one-click
  // link alongside it (just a URL template, not a real API integration),
  // since that's the common case and a download+import round-trip is more
  // friction than most people need for it.
  function setCalendarLinks(date) {
    const summary = ($('result-answer').textContent || 'Choice Timer decision').trim();
    const end = new Date(date.getTime() + 30 * 60000);

    const ics = buildIcs(summary, date, end);
    const blob = new Blob([ics], { type: 'text/calendar' });
    if (icsLink.dataset.blobUrl) URL.revokeObjectURL(icsLink.dataset.blobUrl);
    const url = URL.createObjectURL(blob);
    icsLink.href = url;
    icsLink.dataset.blobUrl = url;

    const gcalUrl = new URL('https://calendar.google.com/calendar/render');
    gcalUrl.searchParams.set('action', 'TEMPLATE');
    gcalUrl.searchParams.set('text', summary);
    gcalUrl.searchParams.set('dates', `${icsTimestamp(date)}/${icsTimestamp(end)}`);
    googleLink.href = gcalUrl.toString();

    calendarLinks.classList.remove('hidden');
  }

  function hideInputsAndLinks() {
    timeInput.classList.add('hidden');
    datetimeInput.classList.add('hidden');
    calendarLinks.classList.add('hidden');
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      hideInputsAndLinks();

      const when = chip.dataset.when;
      if (when === 'now') {
        setCalendarLinks(new Date());
      } else if (when === 'today') {
        timeInput.value = '';
        timeInput.classList.remove('hidden');
        timeInput.focus();
      } else if (when === 'custom') {
        datetimeInput.value = '';
        datetimeInput.classList.remove('hidden');
        datetimeInput.focus();
      }
    });
  });

  timeInput.addEventListener('change', () => {
    if (!timeInput.value) return;
    const [h, m] = timeInput.value.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    setCalendarLinks(d);
  });

  datetimeInput.addEventListener('change', () => {
    if (!datetimeInput.value) return;
    setCalendarLinks(new Date(datetimeInput.value));
  });

  const satisfactionBlock = satisfactionButtons.closest('.post-result-block');
  const followThroughBlock = $('follow-through-chips').closest('.post-result-block');

  window.__choiceTimerFollowup = {
    // showPersonal: both blocks here are about one person's own decision
    // ("did this help YOU", "when will YOU do this") — neither maps onto a
    // group room, where the point is reaching consensus together, not any
    // one participant's personal follow-through. Group results skip both.
    reset({ showPersonal = true, otherOptions = [] } = {}) {
      currentOtherOptions = otherOptions;
      satisfactionBlock.classList.toggle('hidden', !showPersonal);
      followThroughBlock.classList.toggle('hidden', !showPersonal);

      satisfactionButtons.classList.remove('hidden');
      satisfactionAck.classList.add('hidden');
      chips.forEach((c) => c.classList.remove('active'));
      hideInputsAndLinks();
      if (icsLink.dataset.blobUrl) {
        URL.revokeObjectURL(icsLink.dataset.blobUrl);
        delete icsLink.dataset.blobUrl;
      }
      icsLink.removeAttribute('href');
      googleLink.removeAttribute('href');
    },
  };
})();

// Post-result extras shared by both solo and group modes, since they both
// render into the same #view-result markup: a quick satisfaction gut-check
// (no storage, no server — just an in-the-moment prompt) and a follow-through
// "when will you do this" prompt that can hand off to a calendar via .ics.
(() => {
  const $ = (id) => document.getElementById(id);

  const satisfactionButtons = $('satisfaction-buttons');
  const satisfactionAck = $('satisfaction-ack');
  const chips = document.querySelectorAll('#follow-through-chips .chip-btn');
  const addToCalendarLink = $('add-to-calendar');

  const ackText = {
    yes: 'Good — go with it.',
    no: "That's alright. You still get to move on.",
  };

  function showAck(kind) {
    satisfactionButtons.classList.add('hidden');
    satisfactionAck.textContent = ackText[kind];
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

  function whenToDate(when) {
    const d = new Date();
    if (when === 'now') return d;
    if (when === 'today') {
      const evening = new Date(d);
      evening.setHours(18, 0, 0, 0);
      return evening > d ? evening : new Date(Date.now() + 2 * 60 * 60 * 1000);
    }
    // "week"
    d.setDate(d.getDate() + 3);
    return d;
  }

  function buildIcs(summary, date) {
    const dt = icsTimestamp(date);
    const uid = `${Date.now()}@choice-timer`;
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Choice Timer//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dt}`,
      `DTSTART:${dt}`,
      `SUMMARY:${summary.replace(/[\r\n]/g, ' ')}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');

      const date = whenToDate(chip.dataset.when);
      const summary = ($('result-answer').textContent || 'Choice Timer decision').trim();
      const ics = buildIcs(summary, date);
      const blob = new Blob([ics], { type: 'text/calendar' });
      if (addToCalendarLink.dataset.blobUrl) URL.revokeObjectURL(addToCalendarLink.dataset.blobUrl);
      const url = URL.createObjectURL(blob);
      addToCalendarLink.href = url;
      addToCalendarLink.dataset.blobUrl = url;
      addToCalendarLink.classList.remove('hidden');
    });
  });

  const satisfactionBlock = satisfactionButtons.closest('.post-result-block');
  const followThroughBlock = $('follow-through-chips').closest('.post-result-block');

  window.__choiceTimerFollowup = {
    // showPersonal: both the satisfaction gut-check and the follow-through
    // prompt are about one person's own decision ("did this help you stop
    // overthinking", "when will YOU do this") — neither maps cleanly onto a
    // group room, where the point is reaching consensus together, not any
    // one participant's personal follow-through. So group results skip both.
    reset({ showPersonal = true } = {}) {
      satisfactionBlock.classList.toggle('hidden', !showPersonal);
      followThroughBlock.classList.toggle('hidden', !showPersonal);
      satisfactionButtons.classList.remove('hidden');
      satisfactionAck.classList.add('hidden');
      chips.forEach((c) => c.classList.remove('active'));
      addToCalendarLink.classList.add('hidden');
      if (addToCalendarLink.dataset.blobUrl) {
        URL.revokeObjectURL(addToCalendarLink.dataset.blobUrl);
        delete addToCalendarLink.dataset.blobUrl;
      }
      addToCalendarLink.removeAttribute('href');
    },
  };
})();

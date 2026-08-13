# Choice Timer

A small app for making a decision before you overthink it. Type a question, give it Yes/No or custom options, set a countdown, and pick before time runs out.

**Live:** https://jonasgg99.github.io/choice-timer/

## How it works

- Set a question and 2-6 options (or use the Yes/No preset), pick a timer length, hit Start.
- The timer counts down, flashing as it gets close to zero.
- If time runs out before you pick, the app locks and waits — it doesn't choose for you unless you've turned on auto-pick in Advanced settings. A limited number of time extensions are available instead.
- Once you pick, the result screen confirms your choice.

## Running locally

No build step or dependencies. Serve the folder with any static file server, e.g.:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

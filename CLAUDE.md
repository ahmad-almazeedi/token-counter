# Token Counter

Static site (index.html, script.js, style.css) — no build step.

## Workflow

Always commit and push after every change.

## Design

Grayscale only — never introduce any color/hue anywhere (no accents, no colored states, no tinted links). Everything stays in shades of gray, black, and white. Light mode background is pure white (#fff); dark mode background is pure black (#000).

## Dev server

The app is served at http://localhost:1234/. After every change, make sure that server is running (start one if it isn't, e.g. `python3 -m http.server 1234`) so the change can be viewed there.

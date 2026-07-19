# Token Counter

Static site (index.html, script.js, style.css) — no build step.

## Workflow

Always commit and push after every change.

## Design

Grayscale by default — the site's look is monochrome (light mode background #fcfcfc, dark mode pure black #000). Color is allowed when it genuinely earns its place (e.g. a destructive-action warning), but should stay rare and deliberate, never decorative.

## Dev server

The app is served at http://localhost:1234/. After every change, make sure that server is running (start one if it isn't, e.g. `python3 -m http.server 1234`) so the change can be viewed there.

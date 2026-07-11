---
name: verify
description: How to run and verify changes to this static site end-to-end in the browser.
---

# Verifying Token Counter changes

Static site, no build. Surface is the browser.

## Launch

A dev server should already be on http://localhost:1234/ (see CLAUDE.md). Check with
`curl -s -o /dev/null -w "%{http_code}" http://localhost:1234/`; if down, start
`python3 -m http.server 1234` from the repo root (background).

## Drive

Use the claude-in-chrome tools against http://localhost:1234/.

- The empty box is covered by a paste-zone; **clicking it triggers a clipboard read**
  (permission prompt risk). To type instead: focus via
  `document.getElementById('input').focus()` in javascript_tool, then use the
  `type` action. Typing a letter anywhere also focuses the box, but space/modifier
  keys deliberately don't.
- Read results from `document.getElementById('stats').textContent` — that's the
  rendered UI output.
- Large-text path: >100,000 chars routes counting to a Web Worker (built from
  serialized functions in script.js — if you add a helper that `analyzeText` calls,
  it must also be added to the worker source template). Inject via javascript_tool
  (`input.value = ...; input.dispatchEvent(new Event('input', {bubbles: true}))`),
  wait ~1.5s (250ms debounce + compute), then read stats. Check console errors —
  a broken worker falls back silently with identical numbers.
- Filter menu: button top-right (~1006, 25); rows toggle stats and persist to
  localStorage key `visibleStats`.

## Gotchas

- Text persists to localStorage (`editorText`) — clear it (Clear button, ~(241, 729)
  when text present) and restore `visibleStats` when done, since this is the user's
  real browser profile.
- Batched clicks occasionally don't land after menu/Escape interactions — verify
  each state change via javascript_tool and re-click if needed.

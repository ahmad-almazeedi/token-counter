// ---------- Elements ----------
const input = document.getElementById("input");
const statsEl = document.getElementById("stats");
const filterBtn = document.getElementById("filterBtn");
const filterMenu = document.getElementById("filterMenu");
const themeToggle = document.getElementById("themeToggle");
const themeIcon = themeToggle.querySelector(".theme-toggle__icon");
const pasteZone = document.getElementById("pasteZone");
const clearBtn = document.getElementById("clearBtn");
const replaceBtn = document.getElementById("replaceBtn");
const preview = document.getElementById("preview");
const previewBtn = document.getElementById("previewBtn");
const previewIcon = previewBtn.querySelector(".pill-btn__icon");
const previewLabel = previewBtn.querySelector(".pill-btn__label");

const nf = new Intl.NumberFormat();
const LARGE_TEXT_THRESHOLD = 100_000;
const COUNT_UPDATE_DELAY = 250;
const MARKDOWN_UPDATE_DELAY = 500;
const WORKER_UPDATE_DELAY = 250;
const TEXT_STORAGE_KEY = "editorText";
const TEXT_SAVE_DELAY = 250;

let inputRevision = 0;
let textAnalysisWorker = null;
let workerUpdateTimer = 0;
let textSaveTimer = 0;

// Tracked explicitly — document.activeElement is unreliable during the blur event.
let inputFocused = false;
// Whether the box is currently showing rendered Markdown instead of the textarea.
let previewMode = false;
// Clipboard text as of the last time we legitimately saw it (a paste we ran,
// a Cmd+V, or a copy/cut on this page). null = unknown. Used to hide
// Paste & Replace when it would be a no-op.
let knownClipboard = null;
let clipboardMatchesInput = false;

// ---------- Text persistence ----------
function restoreText() {
  try {
    const storedText = localStorage.getItem(TEXT_STORAGE_KEY);
    if (storedText !== null) input.value = storedText;
  } catch (e) {}
}

function saveText() {
  clearTimeout(textSaveTimer);
  textSaveTimer = 0;

  try {
    if (input.value) localStorage.setItem(TEXT_STORAGE_KEY, input.value);
    else localStorage.removeItem(TEXT_STORAGE_KEY);
  } catch (e) {}
}

// Avoid copying a large document into localStorage on every keystroke. The
// pending write is flushed on pagehide, so refreshing immediately after an
// edit still saves the latest value.
function scheduleTextSave() {
  clearTimeout(textSaveTimer);
  textSaveTimer = window.setTimeout(saveText, TEXT_SAVE_DELAY);
}

window.addEventListener("pagehide", () => {
  if (textSaveTimer) saveText();
});

// ---------- Counting ----------
// The paste zone covers the box only when it's empty AND not focused (no
// blinking cursor). The clear button shows whenever there's text.
function syncPasteZone(textLength = input.textLength) {
  const empty = textLength === 0;
  const showZone = empty && !inputFocused;
  pasteZone.classList.toggle("paste-zone--hidden", !showZone);
  clearBtn.classList.toggle("clear-btn--hidden", empty);
  // Hide Paste & Replace when the box is empty or replacing wouldn't change anything.
  const replaceNoop = knownClipboard !== null && clipboardMatchesInput;
  replaceBtn.classList.toggle("replace-btn--hidden", empty || replaceNoop);
  // Hide the typing placeholder while the paste zone covers the box.
  input.placeholder = showZone ? "" : "Type here";
}

input.addEventListener("focus", () => {
  inputFocused = true;
  syncPasteZone();
});
input.addEventListener("blur", () => {
  inputFocused = false;
  syncPasteZone();
});

// When the window deactivates, the browser keeps the textarea as the element
// to restore focus to on re-activation — so a click that merely brings the
// window back would drop a typing cursor into the box before the click lands.
// Release the focus for real: the empty box falls back to the paste zone and
// the activating click pastes (or does nothing outside the box).
window.addEventListener("blur", () => {
  if (document.activeElement === input) input.blur();
});

// ---------- Markdown preview ----------
const PREVIEW_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const PREVIEW_EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.3 3.2M6.2 6.2A17 17 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 5.8-1.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></svg>`;

function renderPreviewBtn() {
  previewIcon.innerHTML = previewMode ? PREVIEW_EYE_OFF : PREVIEW_EYE;
  previewLabel.textContent = previewMode ? "Markdown off" : "Markdown";
  previewBtn.setAttribute(
    "aria-label",
    previewMode ? "Turn off Markdown rendering" : "View Markdown rendering"
  );
}

function applyMarkdownState(isMd, value = null) {
  previewBtn.classList.toggle("preview-btn--hidden", !isMd);
  // If we were previewing and the text no longer looks like Markdown, drop back.
  if (!isMd && previewMode) exitPreview();
  else if (previewMode) {
    preview.innerHTML = window.renderMarkdown(value === null ? input.value : value);
  }
}

// Offer the preview button only when the text actually looks like Markdown.
function syncMarkdown() {
  const value = input.value;
  applyMarkdownState(window.looksLikeMarkdown(value), value);
}

let markdownUpdateTimer = 0;

// Markdown detection runs several patterns over the whole value. For a large
// document, wait until typing pauses so that work never sits in the keystroke's
// critical path.
function scheduleMarkdownUpdate(textLength) {
  clearTimeout(markdownUpdateTimer);
  markdownUpdateTimer = 0;

  if (textLength <= LARGE_TEXT_THRESHOLD) {
    syncMarkdown();
    return;
  }

  markdownUpdateTimer = window.setTimeout(() => {
    markdownUpdateTimer = 0;
    syncMarkdown();
  }, MARKDOWN_UPDATE_DELAY);
}

function enterPreview() {
  clearTimeout(markdownUpdateTimer);
  markdownUpdateTimer = 0;
  previewMode = true;
  preview.innerHTML = window.renderMarkdown(input.value);
  preview.classList.remove("preview--hidden");
  input.style.display = "none";
  renderPreviewBtn();
}

function exitPreview() {
  previewMode = false;
  preview.classList.add("preview--hidden");
  preview.innerHTML = "";
  input.style.display = "";
  renderPreviewBtn();
}

previewBtn.addEventListener("click", () => {
  if (previewMode) exitPreview();
  else enterPreview();
});

// Clicking the rendered Markdown drops back to editing (links still work).
preview.addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
  exitPreview();
  input.focus();
  inputFocused = true;
  syncPasteZone();
});

// ---------- Stats (configurable via the filter dropdown) ----------
const STATS = [
  {
    key: "characters",
    label: "characters",
    short: "chars",
  },
  {
    key: "words",
    label: "words",
  },
  {
    key: "lines",
    label: "lines",
  },
  {
    key: "paragraphs",
    label: "paragraphs",
    short: "paras",
  },
  {
    key: "tokens",
    label: "tokens (est.)",
    short: "tokens",
    menuLabel: "Tokens (est.)",
  },
];

// Matches JavaScript's \s/trim whitespace set without running a regular
// expression for every character.
function isWhitespaceCodeUnit(code) {
  return (
    (code >= 0x0009 && code <= 0x000d) ||
    code === 0x0020 ||
    code === 0x00a0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

// Derive every count in one pass. The previous implementation scanned the
// whole value once per stat, twice (for full and short labels), and retained
// large arrays of every word/line/paragraph along the way.
function analyzeText(value) {
  let firstNonWhitespace = -1;
  let lastNonWhitespace = -1;
  let words = 0;
  let newlines = 0;
  let trimmedNewlines = 0;
  let whitespaceNewlines = 0;
  let paragraphs = 0;
  let previousWasWhitespace = true;

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const whitespace = isWhitespaceCodeUnit(code);

    if (code === 0x000a && firstNonWhitespace !== -1) {
      newlines++;
      whitespaceNewlines++;
    }

    if (whitespace) {
      previousWasWhitespace = true;
      continue;
    }

    if (firstNonWhitespace === -1) {
      firstNonWhitespace = i;
      paragraphs = 1;
    } else if (whitespaceNewlines >= 2) {
      // Two newlines with only whitespace between them start a new block.
      paragraphs++;
    }

    if (previousWasWhitespace) words++;

    previousWasWhitespace = false;
    whitespaceNewlines = 0;
    lastNonWhitespace = i;
    // Remember the count at the last real character so trailing newlines do
    // not contribute, matching the original trim().split() behavior.
    trimmedNewlines = newlines;
  }

  const characters =
    firstNonWhitespace === -1 ? 0 : lastNonWhitespace - firstNonWhitespace + 1;

  return {
    characters,
    words,
    lines: characters ? trimmedNewlines + 1 : 0,
    paragraphs,
    // Rough AI-tokenizer estimate for English-like text: ~4 characters or
    // ~0.75 words per token — take the larger of the two guesses.
    tokens: characters
      ? Math.max(Math.ceil(characters / 4), Math.ceil(words / 0.75))
      : 0,
  };
}

// Large documents are analyzed away from the UI thread. Building the worker
// from the existing functions keeps this dependency-free and also works when
// the site is opened without a build step.
function createTextAnalysisWorker() {
  if (!("Worker" in window) || !("Blob" in window) || !("URL" in window)) {
    return null;
  }

  try {
    const source = `
      "use strict";
      ${isWhitespaceCodeUnit.toString()}
      ${analyzeText.toString()}
      const looksLikeMarkdown = ${window.looksLikeMarkdown.toString()};

      self.addEventListener("message", (event) => {
        const { revision, value } = event.data;
        self.postMessage({
          revision,
          counts: analyzeText(value),
          isMarkdown: looksLikeMarkdown(value),
        });
      });
    `;
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" })
    );
    const worker = new Worker(url);
    const releaseUrl = () => URL.revokeObjectURL(url);
    worker.addEventListener("message", releaseUrl, { once: true });
    worker.addEventListener("error", releaseUrl, { once: true });
    return worker;
  } catch (e) {
    return null;
  }
}

textAnalysisWorker = createTextAnalysisWorker();

if (textAnalysisWorker) {
  textAnalysisWorker.addEventListener("message", (event) => {
    const { revision, counts, isMarkdown } = event.data;
    if (revision !== inputRevision) return;
    renderStats(counts);
    applyMarkdownState(isMarkdown);
  });

  textAnalysisWorker.addEventListener("error", () => {
    textAnalysisWorker.terminate();
    textAnalysisWorker = null;

    // Preserve behavior if workers are blocked by the page's environment.
    if (input.textLength > LARGE_TEXT_THRESHOLD) {
      scheduleStatsUpdate(input.textLength);
      scheduleMarkdownUpdate(input.textLength);
    }
  });
}

const DEFAULT_VISIBLE = ["characters", "words", "tokens"];

function visibleStats() {
  try {
    const raw = JSON.parse(localStorage.getItem("visibleStats"));
    if (Array.isArray(raw)) {
      return raw.filter((k) => STATS.some((s) => s.key === k));
    }
  } catch (e) {}
  return DEFAULT_VISIBLE.slice();
}

function setVisibleStats(keys) {
  try {
    localStorage.setItem("visibleStats", JSON.stringify(keys));
  } catch (e) {}
}

let selectedStatKeys = visibleStats();
let statsHtmlFull = "";
let statsHtmlShort = "";
let renderedStatsHtml = "";

function renderStats(precomputedCounts = null) {
  const shown = STATS.filter((s) => selectedStatKeys.includes(s.key));
  const value = precomputedCounts ? null : input.value;
  // A character-only display can use the engine's optimized trim without
  // walking the entire document. Every other stat benefits from the shared pass.
  const counts =
    precomputedCounts ||
    (shown.length === 1 && shown[0].key === "characters"
      ? { characters: value.trim().length }
      : shown.length
        ? analyzeText(value)
        : {});
  const formatted = shown.map((stat) => ({
    stat,
    value: nf.format(counts[stat.key]),
  }));
  const build = (useShort) =>
    formatted
      .map(
        ({ stat, value: count }) =>
          `<span class="stats__item"><span class="stats__value">${count}</span> ${
            useShort ? stat.short || stat.label : stat.label
          }</span>`
      )
      .join(`<span class="stats__sep" aria-hidden="true">·</span>`);
  const nextFull = build(false);
  const nextShort = build(true);

  // For example, typing inside a word does not change a words-only display.
  // Avoid DOM work and forced layout when the rendered counters are unchanged.
  if (nextFull === statsHtmlFull && nextShort === statsHtmlShort) return;

  statsHtmlFull = nextFull;
  statsHtmlShort = nextShort;
  fitStats();
}

// Show full labels when they fit on the stats row; abbreviate if not.
function fitStats() {
  if (renderedStatsHtml !== statsHtmlFull) {
    statsEl.innerHTML = statsHtmlFull;
    renderedStatsHtml = statsHtmlFull;
  }
  if (statsEl.scrollWidth > statsEl.clientWidth + 1) {
    if (renderedStatsHtml !== statsHtmlShort) {
      statsEl.innerHTML = statsHtmlShort;
      renderedStatsHtml = statsHtmlShort;
    }
  }
}

let statsUpdateTimer = 0;

// Small values still update synchronously. With a large value, coalesce rapid
// input and count after typing pauses so the textarea can paint first.
function scheduleStatsUpdate(textLength) {
  clearTimeout(statsUpdateTimer);
  statsUpdateTimer = 0;

  if (textLength <= LARGE_TEXT_THRESHOLD) {
    renderStats();
    return;
  }

  statsUpdateTimer = window.setTimeout(() => {
    statsUpdateTimer = 0;
    renderStats();
  }, COUNT_UPDATE_DELAY);
}

// Coalesce count and Markdown work into one worker message. Only the newest
// revision is allowed to update the UI, so rapid edits cannot show stale data.
function scheduleTextAnalysis(textLength) {
  clearTimeout(workerUpdateTimer);
  workerUpdateTimer = 0;

  if (textLength > LARGE_TEXT_THRESHOLD && textAnalysisWorker) {
    clearTimeout(statsUpdateTimer);
    statsUpdateTimer = 0;
    clearTimeout(markdownUpdateTimer);
    markdownUpdateTimer = 0;

    const revision = inputRevision;
    workerUpdateTimer = window.setTimeout(() => {
      workerUpdateTimer = 0;
      if (revision !== inputRevision || !textAnalysisWorker) return;
      textAnalysisWorker.postMessage({ revision, value: input.value });
    }, WORKER_UPDATE_DELAY);
    return;
  }

  scheduleStatsUpdate(textLength);
  scheduleMarkdownUpdate(textLength);
}

// Build the dropdown's checkboxes once.
function buildFilterMenu() {
  filterMenu.innerHTML = STATS.map(
    (s) => `<label class="filter-menu__item">
      <input type="checkbox" value="${s.key}" ${selectedStatKeys.includes(s.key) ? "checked" : ""} />
      <span>${s.menuLabel || s.label.charAt(0).toUpperCase() + s.label.slice(1)}</span>
    </label>`
  ).join("");
}

filterMenu.addEventListener("change", () => {
  const keys = [...filterMenu.querySelectorAll("input:checked")].map(
    (cb) => cb.value
  );
  selectedStatKeys = keys;
  setVisibleStats(keys);
  scheduleTextAnalysis(input.textLength);
});

function toggleFilterMenu(open) {
  const show =
    open !== undefined ? open : filterMenu.classList.contains("filter-menu--hidden");
  filterMenu.classList.toggle("filter-menu--hidden", !show);
  filterBtn.setAttribute("aria-expanded", String(show));
}

filterBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleFilterMenu();
});

// Click anywhere else (or Escape) closes the dropdown.
document.addEventListener("click", (e) => {
  if (!filterMenu.classList.contains("filter-menu--hidden") &&
      !e.target.closest(".stats-filter")) {
    toggleFilterMenu(false);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") toggleFilterMenu(false);
});

function updateCounts({ persist = true } = {}) {
  const textLength = input.textLength;
  inputRevision++;
  // Do not read the full textarea value in the keystroke handler. Large values
  // are read only once, after editing pauses, when they are sent to the worker.
  syncPasteZone(textLength);
  scheduleTextAnalysis(textLength);
  if (persist) scheduleTextSave();
}

input.addEventListener("input", () => {
  clipboardMatchesInput = false;
  updateCounts();
  // The browser scrolls only far enough to keep the caret visible, leaving the
  // last line flush with the bottom edge. When typing at the end, scroll fully
  // down so the bottom padding shows as breathing room.
  if (input.selectionEnd === input.textLength) {
    input.scrollTop = input.scrollHeight;
  }
});

let resizeFrame = 0;
window.addEventListener("resize", () => {
  if (resizeFrame) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    fitStats();
  });
});

// ---------- Paste / type ----------
// Clicking the empty box pastes; typing anywhere on the page starts typing.
async function doPaste() {
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch (e) {
    return; // dismissed or blocked — leave the paste zone untouched
  }
  knownClipboard = text;
  clipboardMatchesInput = !text && input.textLength === 0;
  if (text) {
    input.value = text;
    clipboardMatchesInput = true;
    updateCounts();
  }
  input.focus();
  inputFocused = true;
  syncPasteZone();
}

pasteZone.addEventListener("click", doPaste);
// Paste & replace: overwrite the current text with the clipboard in one step.
replaceBtn.addEventListener("click", doPaste);
pasteZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    doPaste();
  }
});

// Typing anywhere on the page starts typing in the box and captures the key.
document.addEventListener("keydown", (e) => {
  if (previewMode) return; // showing rendered Markdown, not editing
  if (inputFocused) return; // already typing
  if (e.metaKey || e.ctrlKey || e.altKey) return; // leave shortcuts alone
  if (e.key.length !== 1 || e.key === " ") return; // only printable, non-space
  // Focusing mid-keydown won't redirect this keystroke, so insert it manually;
  // subsequent keys type natively into the now-focused box.
  e.preventDefault();
  input.focus();
  inputFocused = true;
  const end = input.textLength;
  input.setRangeText(e.key, end, end, "end");
  clipboardMatchesInput = false;
  updateCounts();
});

// Cmd+V anywhere pastes into the box — the browser hands us the text directly
// on a user-initiated paste, so no clipboard permission prompt is involved.
document.addEventListener("paste", (e) => {
  const text = e.clipboardData && e.clipboardData.getData("text/plain");
  if (typeof text === "string") {
    knownClipboard = text;
    clipboardMatchesInput = false;
  }
  if (previewMode) return; // showing rendered Markdown, not editing
  if (inputFocused) {
    // Native paste into the textarea handles insertion. Compare once after it
    // lands; ordinary keystrokes never compare the full document.
    setTimeout(() => {
      clipboardMatchesInput =
        knownClipboard !== null &&
        knownClipboard.length === input.textLength &&
        knownClipboard === input.value;
      syncPasteZone();
    }, 0);
    return;
  }
  if (!text) return;
  e.preventDefault();
  const wasEmpty = input.textLength === 0;
  const end = input.textLength;
  input.setRangeText(text, end, end, "end");
  clipboardMatchesInput = wasEmpty;
  input.focus();
  inputFocused = true;
  updateCounts();
});

// Copy/cut on this page also changes the clipboard — keep our record current.
function trackCopy(e) {
  const inputSelection = e.target === input;
  const selectionStart = inputSelection ? input.selectionStart : 0;
  const selectionEnd = inputSelection ? input.selectionEnd : 0;
  const sel = inputSelection
    ? input.value.slice(selectionStart, selectionEnd)
    : String(window.getSelection());
  if (sel) {
    knownClipboard = sel;
    clipboardMatchesInput =
      e.type === "copy" &&
      inputSelection &&
      selectionStart === 0 &&
      selectionEnd === input.textLength;
    // Defer so a cut's value change lands before we re-check visibility.
    setTimeout(syncPasteZone, 0);
  }
}
document.addEventListener("copy", trackCopy);
document.addEventListener("cut", trackCopy);

// ---------- Clear ----------
clearBtn.addEventListener("click", () => {
  input.value = "";
  clipboardMatchesInput = knownClipboard === "";
  if (previewMode) exitPreview(); // drop the rendered view before clearing
  inputFocused = false;
  input.blur(); // return to the paste-zone state
  updateCounts();
});

// ---------- Theme ----------
const SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.3a8.4 8.4 0 0 1-10.8-10.8A8.5 8.5 0 1 0 20.5 14.3Z"/></svg>`;

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function storedTheme() {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : null;
  } catch (e) {
    return null;
  }
}

function effectiveTheme() {
  return storedTheme() || (systemDark.matches ? "dark" : "light");
}

function renderIcon() {
  // Show the icon for the mode you'd switch to.
  const isDark = effectiveTheme() === "dark";
  themeIcon.innerHTML = isDark ? SUN : MOON;
  themeToggle.setAttribute(
    "aria-label",
    isDark ? "Switch to light mode" : "Switch to dark mode"
  );
}

themeToggle.addEventListener("click", () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch (e) {}
  renderIcon();
});

// Keep the icon in sync if the system theme changes and there's no manual override.
systemDark.addEventListener("change", () => {
  if (!storedTheme()) renderIcon();
});

// ---------- Init ----------
restoreText();
buildFilterMenu();
renderPreviewBtn();
updateCounts({ persist: false });
renderIcon();

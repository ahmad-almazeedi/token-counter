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

// Tracked explicitly — document.activeElement is unreliable during the blur event.
let inputFocused = false;
// Whether the box is currently showing rendered Markdown instead of the textarea.
let previewMode = false;
// Clipboard text as of the last time we legitimately saw it (a paste we ran,
// a Cmd+V, or a copy/cut on this page). null = unknown. Used to hide
// Paste & Replace when it would be a no-op.
let knownClipboard = null;

// ---------- Counting ----------
// The paste zone covers the box only when it's empty AND not focused (no
// blinking cursor). The clear button shows whenever there's text.
function syncPasteZone() {
  const empty = input.value.length === 0;
  const showZone = empty && !inputFocused;
  pasteZone.classList.toggle("paste-zone--hidden", !showZone);
  clearBtn.classList.toggle("clear-btn--hidden", empty);
  // Hide Paste & Replace when the box is empty or replacing wouldn't change anything.
  const replaceNoop = knownClipboard !== null && knownClipboard === input.value;
  replaceBtn.classList.toggle("replace-btn--hidden", empty || replaceNoop);
  // Hide the typing placeholder while the paste zone covers the box.
  input.placeholder = showZone ? "" : "Type here";
  // Buttons appearing/disappearing changes the room left for the counters.
  if (typeof fitStats === "function") fitStats();
}

input.addEventListener("focus", () => {
  inputFocused = true;
  syncPasteZone();
});
input.addEventListener("blur", () => {
  inputFocused = false;
  syncPasteZone();
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

// Offer the preview button only when the text actually looks like Markdown.
function syncMarkdown() {
  const isMd = window.looksLikeMarkdown(input.value);
  previewBtn.classList.toggle("preview-btn--hidden", !isMd);
  // If we were previewing and the text no longer looks like Markdown, drop back.
  if (!isMd && previewMode) exitPreview();
}

function enterPreview() {
  previewMode = true;
  preview.innerHTML = window.renderMarkdown(input.value);
  preview.classList.remove("preview--hidden");
  input.style.display = "none";
  renderPreviewBtn();
  // Cap the preview at the same bottom limit the textarea grows to.
  preview.style.maxHeight = availableHeight(preview) + "px";
}

function exitPreview() {
  previewMode = false;
  preview.classList.add("preview--hidden");
  preview.innerHTML = "";
  input.style.display = "";
  renderPreviewBtn();
  autoGrow();
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
    // Ignore whitespace before the first and after the last real character.
    count: (v) => v.trim().length,
  },
  {
    key: "words",
    label: "words",
    count: (v) => {
      const words = v.match(/\S+/g);
      return words ? words.length : 0;
    },
  },
  {
    key: "lines",
    label: "lines",
    count: (v) => {
      const t = v.trim();
      return t ? t.split("\n").length : 0;
    },
  },
  {
    key: "paragraphs",
    label: "paragraphs",
    short: "paras",
    // Blocks separated by one or more blank lines.
    count: (v) => {
      const t = v.trim();
      return t ? t.split(/\n\s*\n/).length : 0;
    },
  },
  {
    key: "tokens",
    label: "tokens (est.)",
    short: "tokens",
    menuLabel: "Tokens (est.)",
    // Rough AI-tokenizer estimate for English-like text: ~4 characters or
    // ~0.75 words per token — take the larger of the two guesses.
    count: (v) => {
      const chars = v.trim().length;
      if (!chars) return 0;
      const words = (v.match(/\S+/g) || []).length;
      return Math.max(Math.ceil(chars / 4), Math.ceil(words / 0.75));
    },
  },
];

const DEFAULT_VISIBLE = ["characters", "words"];

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

let statsHtmlFull = "";
let statsHtmlShort = "";

function renderStats() {
  const visible = visibleStats();
  const shown = STATS.filter((s) => visible.includes(s.key));
  const build = (useShort) =>
    shown
      .map(
        (s) =>
          `<span class="stats__item"><span class="stats__value">${nf.format(
            s.count(input.value)
          )}</span> ${useShort ? s.short || s.label : s.label}</span>`
      )
      .join(`<span class="stats__sep" aria-hidden="true">·</span>`);
  statsHtmlFull = build(false);
  statsHtmlShort = build(true);
  fitStats();
}

// Stats + visible buttons wider than the row? The row is right-aligned, so
// overflow spills off the LEFT edge, which scrollWidth doesn't report —
// sum the children's real widths instead.
function rowOverflows(row) {
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  let total = 0;
  let count = 0;
  for (const child of row.children) {
    if (getComputedStyle(child).display === "none") continue;
    total += child.getBoundingClientRect().width;
    count++;
  }
  total += gap * Math.max(0, count - 1);
  return total > row.clientWidth + 1;
}

// Show full labels when they fit on the toolbar row; abbreviate if not.
function fitStats() {
  const row = statsEl.parentElement;
  statsEl.innerHTML = statsHtmlFull;
  if (rowOverflows(row)) {
    statsEl.innerHTML = statsHtmlShort;
  }
}

// Build the dropdown's checkboxes once.
function buildFilterMenu() {
  const visible = visibleStats();
  filterMenu.innerHTML = STATS.map(
    (s) => `<label class="filter-menu__item">
      <input type="checkbox" value="${s.key}" ${visible.includes(s.key) ? "checked" : ""} />
      <span>${s.menuLabel || s.label.charAt(0).toUpperCase() + s.label.slice(1)}</span>
    </label>`
  ).join("");
}

filterMenu.addEventListener("change", () => {
  const keys = [...filterMenu.querySelectorAll("input:checked")].map(
    (cb) => cb.value
  );
  setVisibleStats(keys);
  renderStats();
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

function updateCounts() {
  renderStats();
  syncPasteZone();
  syncMarkdown();
  // Keep the live preview in sync if it's open while text changes programmatically.
  if (previewMode) preview.innerHTML = window.renderMarkdown(input.value);
}

// Room from an element's top down to the padded bottom of the viewport,
// minus breathing space so the box stops a bit before the screen edge.
function availableHeight(el) {
  const docTop = el.getBoundingClientRect().top + window.scrollY;
  const bottomGap = parseFloat(getComputedStyle(document.body).paddingBottom) || 24;
  return Math.max(window.innerHeight - docTop - bottomGap - 56, 120);
}

// Grow the box downward to fit its content, but only until its bottom reaches
// the limit above — past that, scroll inside the box instead.
function autoGrow() {
  if (previewMode) return; // textarea is hidden; nothing to size
  // Measure the full content height with the CSS min-height as the floor.
  input.style.height = "auto";
  input.style.minHeight = "";
  const cs = getComputedStyle(input);
  const borders =
    parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  const needed = input.scrollHeight + borders;

  const maxHeight = availableHeight(input);

  if (needed > maxHeight) {
    input.style.minHeight = maxHeight + "px";
    input.style.height = maxHeight + "px";
    input.style.overflowY = "auto";
  } else {
    input.style.height = needed + "px";
    input.style.overflowY = "hidden";
  }
}

input.addEventListener("input", () => {
  updateCounts();
  autoGrow();
});

window.addEventListener("resize", () => {
  autoGrow();
  fitStats();
  if (previewMode) preview.style.maxHeight = availableHeight(preview) + "px";
});

// ---------- Paste / type ----------
// The whole empty box pastes; the small "or type" link is the only way to type.
async function doPaste() {
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch (e) {
    return; // dismissed or blocked — leave the paste zone untouched
  }
  knownClipboard = text;
  if (text) {
    input.value = text;
    updateCounts();
    autoGrow();
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
  input.value += e.key;
  updateCounts();
  autoGrow();
});

// Cmd+V anywhere pastes into the box — the browser hands us the text directly
// on a user-initiated paste, so no clipboard permission prompt is involved.
document.addEventListener("paste", (e) => {
  const text = e.clipboardData && e.clipboardData.getData("text/plain");
  if (typeof text === "string") knownClipboard = text;
  if (previewMode) return; // showing rendered Markdown, not editing
  if (inputFocused) {
    // Native paste into the textarea handles insertion; just refresh the
    // Paste & Replace visibility once the value has updated.
    setTimeout(syncPasteZone, 0);
    return;
  }
  if (!text) return;
  e.preventDefault();
  input.value += text;
  input.focus();
  inputFocused = true;
  updateCounts();
  autoGrow();
});

// Copy/cut on this page also changes the clipboard — keep our record current.
function trackCopy(e) {
  const sel =
    e.target === input
      ? input.value.slice(input.selectionStart, input.selectionEnd)
      : String(window.getSelection());
  if (sel) {
    knownClipboard = sel;
    // Defer so a cut's value change lands before we re-check visibility.
    setTimeout(syncPasteZone, 0);
  }
}
document.addEventListener("copy", trackCopy);
document.addEventListener("cut", trackCopy);

// ---------- Clear ----------
clearBtn.addEventListener("click", () => {
  input.value = "";
  if (previewMode) exitPreview(); // drop the rendered view before clearing
  inputFocused = false;
  input.blur(); // return to the paste-zone state
  updateCounts();
  autoGrow();
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
buildFilterMenu();
renderPreviewBtn();
updateCounts();
autoGrow();
renderIcon();

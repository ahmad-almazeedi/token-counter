// ---------- Elements ----------
const input = document.getElementById("input");
const charCountEl = document.getElementById("charCount");
const wordCountEl = document.getElementById("wordCount");
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
const PREVIEW_PENCIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

function renderPreviewBtn() {
  previewIcon.innerHTML = previewMode ? PREVIEW_PENCIL : PREVIEW_EYE;
  previewLabel.textContent = previewMode ? "Edit" : "Markdown";
  previewBtn.setAttribute(
    "aria-label",
    previewMode ? "Back to editing" : "View Markdown rendering"
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

function updateCounts() {
  charCountEl.textContent = nf.format(input.value.length);
  const words = input.value.match(/\S+/g);
  wordCountEl.textContent = nf.format(words ? words.length : 0);
  syncPasteZone();
  syncMarkdown();
  // Keep the live preview in sync if it's open while text changes programmatically.
  if (previewMode) preview.innerHTML = window.renderMarkdown(input.value);
}

// Grow the box downward to fit its content, but only until its bottom reaches
// the padded bottom of the screen — past that, scroll inside the box instead.
function autoGrow() {
  if (previewMode) return; // textarea is hidden; nothing to size
  // Measure the full content height with the CSS min-height as the floor.
  input.style.height = "auto";
  input.style.minHeight = "";
  const cs = getComputedStyle(input);
  const borders =
    parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  const needed = input.scrollHeight + borders;

  // Space from the box's top down to the padded bottom of the viewport.
  const docTop = input.getBoundingClientRect().top + window.scrollY;
  const bottomGap = parseFloat(getComputedStyle(document.body).paddingBottom) || 24;
  const maxHeight = Math.max(window.innerHeight - docTop - bottomGap, 120);

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

window.addEventListener("resize", autoGrow);

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
renderPreviewBtn();
updateCounts();
autoGrow();
renderIcon();

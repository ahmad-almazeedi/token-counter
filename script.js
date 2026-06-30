// ---------- Elements ----------
const input = document.getElementById("input");
const charCountEl = document.getElementById("charCount");
const themeToggle = document.getElementById("themeToggle");
const themeIcon = themeToggle.querySelector(".theme-toggle__icon");
const pasteZone = document.getElementById("pasteZone");
const clearBtn = document.getElementById("clearBtn");

const nf = new Intl.NumberFormat();

// Tracked explicitly — document.activeElement is unreliable during the blur event.
let inputFocused = false;

// ---------- Counting ----------
// The paste zone covers the box only when it's empty AND not focused (no
// blinking cursor). The clear button shows whenever there's text.
function syncPasteZone() {
  const empty = input.value.length === 0;
  const showZone = empty && !inputFocused;
  pasteZone.classList.toggle("paste-zone--hidden", !showZone);
  clearBtn.classList.toggle("clear-btn--hidden", empty);
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

function updateCounts() {
  charCountEl.textContent = nf.format(input.value.length);
  syncPasteZone();
}

// Grow the box downward to fit its content, but only until its bottom reaches
// the padded bottom of the screen — past that, scroll inside the box instead.
function autoGrow() {
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
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      input.value = text;
      updateCounts();
      autoGrow();
    }
  } catch (e) {
    // Clipboard read was blocked — focus the box so the user can paste manually.
  }
  input.focus();
  inputFocused = true;
  syncPasteZone();
}

pasteZone.addEventListener("click", doPaste);
pasteZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    doPaste();
  }
});

// Typing anywhere on the page starts typing in the box and captures the key.
document.addEventListener("keydown", (e) => {
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

// ---------- Clear ----------
clearBtn.addEventListener("click", () => {
  input.value = "";
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
updateCounts();
autoGrow();
renderIcon();

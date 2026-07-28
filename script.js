// ---------- Shared elements and editor state ----------
const app = document.querySelector(".app");
const editorsEl = document.querySelector(".editors");
const filterBtn = document.getElementById("filterBtn");
const filterMenu = document.getElementById("filterMenu");
const compareAddBtn = document.querySelector(".compare-action--add");
const compareRemoveBtn = document.querySelector(".compare-action--remove");

const nf = new Intl.NumberFormat();
const LARGE_TEXT_THRESHOLD = 100_000;
const COUNT_UPDATE_DELAY = 250;
const MARKDOWN_UPDATE_DELAY = 500;
const WORKER_UPDATE_DELAY = 250;
const TEXT_SAVE_DELAY = 250;
const EDITOR_HEIGHT_STORAGE_KEY = "editorHeight";
const MIN_EDITOR_HEIGHT = 240;
const AVERAGE_CHARACTERS_PER_WORD = 6;
const SPEAKING_SPEED_WORDS_PER_MINUTE = 150;

const editors = [...document.querySelectorAll("[data-editor]")].map((root) => ({
  id: root.dataset.editor,
  root,
  input: root.querySelector(".input"),
  statsEl: root.querySelector(".stats"),
  copyBtn: root.querySelector(".copy-btn"),
  copyIcon: root.querySelector(".copy-btn__icon"),
  clearBtn: root.querySelector(".clear-btn"),
  replaceBtn: root.querySelector(".replace-btn"),
  preview: root.querySelector(".preview"),
  previewBtn: root.querySelector(".preview-btn"),
  previewIcon: root.querySelector(".preview-btn .pill-btn__icon"),
  box: root.querySelector(".box"),
  resizeHandle: root.querySelector(".resize-handle"),
  // The comparison is intentionally temporary: closing it or reloading the
  // page should make the next added canvas empty.
  storageKey: root.dataset.editor === "primary" ? "editorText" : null,
  revision: 0,
  inputFocused: false,
  previewMode: false,
  clipboardMatchesInput: false,
  textSaveTimer: 0,
  statsUpdateTimer: 0,
  markdownUpdateTimer: 0,
  workerUpdateTimer: 0,
  copyFeedbackTimer: 0,
  counts: null,
  statsHtmlFull: "",
  statsHtmlShort: "",
  renderedStatsHtml: "",
}));

const primaryEditor = editors.find((editor) => editor.id === "primary");
const comparisonEditor = editors.find((editor) => editor.id === "comparison");

let activeEditor = primaryEditor;
let compareMode = false;
let knownClipboard = null;
let textAnalysisWorker = null;

function isEditorVisible(editor) {
  return !editor.root.classList.contains("editor--hidden");
}

// ---------- Canvas height ----------
function setEditorHeight(height, persist = false) {
  const nextHeight = Math.max(MIN_EDITOR_HEIGHT, Math.round(height));

  editors.forEach((editor) => {
    editor.box.style.height = `${nextHeight}px`;
    editor.resizeHandle.setAttribute("aria-valuenow", String(nextHeight));
  });

  if (persist) {
    try {
      localStorage.setItem(EDITOR_HEIGHT_STORAGE_KEY, String(nextHeight));
    } catch (e) {}
  }
}

function restoreEditorHeight() {
  try {
    const storedHeight = Number(localStorage.getItem(EDITOR_HEIGHT_STORAGE_KEY));
    if (Number.isFinite(storedHeight) && storedHeight >= MIN_EDITOR_HEIGHT) {
      setEditorHeight(storedHeight);
      return;
    }
  } catch (e) {}

  const height = String(Math.round(primaryEditor.box.getBoundingClientRect().height));
  editors.forEach((editor) => {
    editor.resizeHandle.setAttribute("aria-valuenow", height);
  });
}

let resizeState = null;

function finishResize(e) {
  if (!resizeState || e.pointerId !== resizeState.pointerId) return;
  resizeState = null;
  editors.forEach((editor) => {
    editor.resizeHandle.classList.remove("resize-handle--active");
  });
  setEditorHeight(primaryEditor.box.getBoundingClientRect().height, true);
}

editors.forEach((editor) => {
  const handle = editor.resizeHandle;

  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resizeState = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight: editor.box.getBoundingClientRect().height,
    };
    handle.setPointerCapture(e.pointerId);
    editors.forEach((item) => {
      item.resizeHandle.classList.add("resize-handle--active");
    });
  });

  handle.addEventListener("pointermove", (e) => {
    if (!resizeState || e.pointerId !== resizeState.pointerId) return;
    if (e.pointerType === "mouse" && !(e.buttons & 1)) {
      finishResize(e);
      return;
    }
    setEditorHeight(resizeState.startHeight + e.clientY - resizeState.startY);
  });

  handle.addEventListener("pointerup", finishResize);
  handle.addEventListener("pointercancel", finishResize);
  handle.addEventListener("lostpointercapture", finishResize);

  handle.addEventListener("dblclick", () => {
    editors.forEach((item) => {
      item.box.style.height = "";
    });
    try {
      localStorage.removeItem(EDITOR_HEIGHT_STORAGE_KEY);
    } catch (e) {}
    const height = String(Math.round(primaryEditor.box.getBoundingClientRect().height));
    editors.forEach((item) => {
      item.resizeHandle.setAttribute("aria-valuenow", height);
    });
  });

  handle.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const direction = e.key === "ArrowDown" ? 1 : -1;
    const step = e.shiftKey ? 64 : 16;
    setEditorHeight(editor.box.getBoundingClientRect().height + direction * step, true);
  });
});

// ---------- Text persistence ----------
function restoreText(editor) {
  if (!editor.storageKey) return;
  try {
    const storedText = localStorage.getItem(editor.storageKey);
    if (storedText !== null) editor.input.value = storedText;
  } catch (e) {}
}

function saveText(editor) {
  clearTimeout(editor.textSaveTimer);
  editor.textSaveTimer = 0;

  if (!editor.storageKey) return;

  try {
    if (editor.input.value) localStorage.setItem(editor.storageKey, editor.input.value);
    else localStorage.removeItem(editor.storageKey);
  } catch (e) {}
}

function scheduleTextSave(editor) {
  if (!editor.storageKey) return;
  clearTimeout(editor.textSaveTimer);
  editor.textSaveTimer = window.setTimeout(() => saveText(editor), TEXT_SAVE_DELAY);
}

window.addEventListener("pagehide", () => {
  editors.forEach((editor) => {
    if (editor.textSaveTimer) saveText(editor);
  });
});

// ---------- Empty state ----------
function syncEditorTools(editor, textLength = editor.input.textLength) {
  const empty = textLength === 0;
  const replaceNoop = knownClipboard !== null && editor.clipboardMatchesInput;

  editor.copyBtn.disabled = empty;
  editor.clearBtn.disabled = empty;
  editor.replaceBtn.disabled = replaceNoop;
  editor.replaceBtn.dataset.tooltip = empty ? "Paste" : "Paste & Replace";
  editor.replaceBtn.setAttribute(
    "aria-label",
    empty
      ? editor === comparisonEditor
        ? "Paste comparison text from clipboard"
        : "Paste from clipboard"
      : editor === comparisonEditor
        ? "Replace the comparison text with the clipboard"
        : "Replace the current text with the clipboard"
  );
}

const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const COPIED_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;

function renderCopyButton(editor, copied = false) {
  editor.copyIcon.innerHTML = copied ? COPIED_ICON : COPY_ICON;
  editor.copyBtn.dataset.tooltip = copied ? "Copied" : "Copy";
  editor.copyBtn.setAttribute(
    "aria-label",
    copied
      ? "Text copied"
      : editor === comparisonEditor
        ? "Copy comparison text"
        : "Copy text"
  );
}

function resetCopyFeedback(editor) {
  clearTimeout(editor.copyFeedbackTimer);
  editor.copyFeedbackTimer = 0;
  renderCopyButton(editor);
}

editors.forEach((editor) => {
  editor.input.addEventListener("focus", () => {
    activeEditor = editor;
    editor.inputFocused = true;
  });

  editor.input.addEventListener("blur", () => {
    editor.inputFocused = false;
  });
});

window.addEventListener("blur", () => {
  editors.forEach((editor) => {
    if (document.activeElement === editor.input) editor.input.blur();
  });
});

// ---------- Markdown preview ----------
const PREVIEW_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const PREVIEW_EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.3 3.2M6.2 6.2A17 17 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 5.8-1.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></svg>`;

function renderPreviewBtn(editor) {
  editor.previewIcon.innerHTML = editor.previewMode ? PREVIEW_EYE_OFF : PREVIEW_EYE;
  editor.previewBtn.dataset.tooltip = editor.previewMode
    ? "Markdown off"
    : "Markdown";
  editor.previewBtn.setAttribute(
    "aria-label",
    editor.previewMode ? "Turn off Markdown rendering" : "View Markdown rendering"
  );
}

function exitPreview(editor) {
  editor.previewMode = false;
  editor.preview.classList.add("preview--hidden");
  editor.preview.innerHTML = "";
  editor.input.style.display = "";
  renderPreviewBtn(editor);
}

function applyMarkdownState(editor, isMarkdown, value = null) {
  editor.previewBtn.disabled = !isMarkdown;
  if (!isMarkdown && editor.previewMode) exitPreview(editor);
  else if (editor.previewMode) {
    editor.preview.innerHTML = window.renderMarkdown(
      value === null ? editor.input.value : value
    );
  }
}

function syncMarkdown(editor) {
  const value = editor.input.value;
  applyMarkdownState(editor, window.looksLikeMarkdown(value), value);
}

function scheduleMarkdownUpdate(editor, textLength) {
  clearTimeout(editor.markdownUpdateTimer);
  editor.markdownUpdateTimer = 0;

  if (textLength <= LARGE_TEXT_THRESHOLD) {
    syncMarkdown(editor);
    return;
  }

  editor.markdownUpdateTimer = window.setTimeout(() => {
    editor.markdownUpdateTimer = 0;
    syncMarkdown(editor);
  }, MARKDOWN_UPDATE_DELAY);
}

function enterPreview(editor) {
  clearTimeout(editor.markdownUpdateTimer);
  editor.markdownUpdateTimer = 0;
  editor.previewMode = true;
  editor.preview.innerHTML = window.renderMarkdown(editor.input.value);
  editor.preview.classList.remove("preview--hidden");
  editor.input.style.display = "none";
  renderPreviewBtn(editor);
}

editors.forEach((editor) => {
  editor.previewBtn.addEventListener("click", () => {
    activeEditor = editor;
    if (editor.previewMode) exitPreview(editor);
    else enterPreview(editor);
  });

  editor.preview.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    exitPreview(editor);
    activeEditor = editor;
    editor.input.focus();
  });
});

// ---------- Stats ----------
const STATS = [
  { key: "characters", label: "characters", short: "chars" },
  {
    key: "charactersRaw",
    label: "characters (raw)",
    short: "raw",
    menuLabel: "Characters (raw)",
    menuHint: "Includes leading & trailing spaces",
  },
  { key: "words", label: "words" },
  { key: "lines", label: "lines" },
  { key: "paragraphs", label: "paragraphs", short: "paras" },
  {
    key: "tokens",
    label: "tokens",
    menuHint: "Rough estimate, varies by model",
  },
  {
    key: "speechTime",
    label: "speech time",
    short: "speech",
    menuLabel: "Speech time",
    menuHint: "6 characters/word at 150 words/minute",
    format: formatSpeechDuration,
  },
];

function formatSpeechDuration(seconds) {
  const totalSeconds = seconds > 0 ? Math.max(1, Math.round(seconds)) : 0;

  if (totalSeconds < 60) return `${totalSeconds}s`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  // Keep the counter compact: seconds + minutes below an hour, then hours +
  // minutes. The underlying estimate retains its full precision for deltas.
  if (hours) {
    return minutes ? `${nf.format(hours)}h ${minutes}m` : `${nf.format(hours)}h`;
  }
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

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

function tokenCostPerCodeUnit(code) {
  if (code < 0x0080) {
    if (code >= 0x30 && code <= 0x39) return 1 / 3;
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      return 0.25;
    }
    if (code >= 0x21 && code <= 0x7e) return 1 / 1.5;
    return 0.25;
  }
  if (
    (code >= 0x0e00 && code <= 0x10ff) ||
    (code >= 0x1200 && code <= 0x139f) ||
    (code >= 0x1780 && code <= 0x17ff) ||
    (code >= 0xd800 && code <= 0xdfff)
  ) {
    return 1;
  }
  if (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7ff) ||
    (code >= 0xf900 && code <= 0xfaff)
  ) {
    return 1 / 1.5;
  }
  if (
    (code >= 0x0370 && code <= 0x1fff) ||
    (code >= 0xfb50 && code <= 0xfdff) ||
    (code >= 0xfe70 && code <= 0xfefe)
  ) {
    return 0.4;
  }
  return 0.25;
}

function analyzeText(value) {
  let firstNonWhitespace = -1;
  let lastNonWhitespace = -1;
  let words = 0;
  let newlines = 0;
  let trimmedNewlines = 0;
  let whitespaceNewlines = 0;
  let paragraphs = 0;
  let previousWasWhitespace = true;
  let estimatedTokens = 0;

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const whitespace = isWhitespaceCodeUnit(code);

    if (code === 0x000a && firstNonWhitespace !== -1) {
      newlines++;
      whitespaceNewlines++;
    }

    if (whitespace) {
      estimatedTokens += 0.25;
      previousWasWhitespace = true;
      continue;
    }

    estimatedTokens += tokenCostPerCodeUnit(code);

    if (firstNonWhitespace === -1) {
      firstNonWhitespace = i;
      paragraphs = 1;
    } else if (whitespaceNewlines >= 2) {
      paragraphs++;
    }

    if (previousWasWhitespace) words++;

    previousWasWhitespace = false;
    whitespaceNewlines = 0;
    lastNonWhitespace = i;
    trimmedNewlines = newlines;
  }

  const characters =
    firstNonWhitespace === -1 ? 0 : lastNonWhitespace - firstNonWhitespace + 1;

  return {
    characters,
    charactersRaw: value.length,
    words,
    lines: characters ? trimmedNewlines + 1 : 0,
    paragraphs,
    tokens: value.length
      ? Math.max(Math.ceil(estimatedTokens), Math.ceil(words / 0.75))
      : 0,
    speechTime:
      (characters * 60) /
      (AVERAGE_CHARACTERS_PER_WORD * SPEAKING_SPEED_WORDS_PER_MINUTE),
  };
}

function createTextAnalysisWorker() {
  if (!("Worker" in window) || !("Blob" in window) || !("URL" in window)) {
    return null;
  }

  try {
    const source = `
      "use strict";
      ${isWhitespaceCodeUnit.toString()}
      ${tokenCostPerCodeUnit.toString()}
      const AVERAGE_CHARACTERS_PER_WORD = ${AVERAGE_CHARACTERS_PER_WORD};
      const SPEAKING_SPEED_WORDS_PER_MINUTE = ${SPEAKING_SPEED_WORDS_PER_MINUTE};
      ${analyzeText.toString()}
      const looksLikeMarkdown = ${window.looksLikeMarkdown.toString()};

      self.addEventListener("message", (event) => {
        const { editorId, revision, value } = event.data;
        self.postMessage({
          editorId,
          revision,
          counts: analyzeText(value),
          isMarkdown: looksLikeMarkdown(value),
        });
      });
    `;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(url);
    const releaseUrl = () => URL.revokeObjectURL(url);
    worker.addEventListener("message", releaseUrl, { once: true });
    worker.addEventListener("error", releaseUrl, { once: true });
    return worker;
  } catch (e) {
    return null;
  }
}

const DEFAULT_VISIBLE = ["characters", "words", "tokens"];

function visibleStats() {
  try {
    const raw = JSON.parse(localStorage.getItem("visibleStats"));
    if (Array.isArray(raw)) {
      return raw.filter((key) => STATS.some((stat) => stat.key === key));
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

function renderStats(editor, precomputedCounts = null, syncPeer = true) {
  const shown = STATS.filter((stat) => selectedStatKeys.includes(stat.key));
  const value = precomputedCounts ? null : editor.input.value;
  const counts =
    precomputedCounts ||
    (shown.length === 1 && shown[0].key === "characters"
      ? { characters: value.trim().length }
      : shown.length
        ? analyzeText(value)
        : {});
  editor.counts = counts;
  const formatted = shown.map((stat) => ({
    stat,
    rawValue: counts[stat.key],
    value: stat.format ? stat.format(counts[stat.key]) : nf.format(counts[stat.key]),
  }));
  const buildDelta = (stat, count) => {
    if (!compareMode) return "";

    const peer = editor === primaryEditor ? comparisonEditor : primaryEditor;
    const peerCount = peer.counts && peer.counts[stat.key];
    if (!Number.isFinite(peerCount) || !Number.isFinite(count)) return "";

    const difference = count - peerCount;
    const kind = difference > 0 ? "positive" : difference < 0 ? "negative" : "same";
    const formattedDifference = stat.format
      ? stat.format(Math.abs(difference))
      : nf.format(Math.abs(difference));
    const visibleDifference =
      difference > 0
        ? `+${formattedDifference}`
        : difference < 0
          ? `−${formattedDifference}`
          : "±0";
    const spokenDifference =
      difference > 0
        ? `${formattedDifference} more than the other text`
        : difference < 0
          ? `${formattedDifference} fewer than the other text`
          : "Same as the other text";

    return `<span class="stats__delta stats__delta--${kind}" aria-label="${spokenDifference}">${visibleDifference}</span>`;
  };
  const build = (useShort) =>
    formatted
      .map(
        ({ stat, rawValue, value: count }) =>
          `<span class="stats__item"><span class="stats__value">${count}</span> ${
            useShort ? stat.short || stat.label : stat.label
          }${buildDelta(stat, rawValue)}</span>`
      )
      .join("");
  const nextFull = build(false);
  const nextShort = build(true);

  if (nextFull === editor.statsHtmlFull && nextShort === editor.statsHtmlShort) return;

  editor.statsHtmlFull = nextFull;
  editor.statsHtmlShort = nextShort;
  fitStats(editor);

  // Each side describes itself relative to the other, so editing either text
  // refreshes the already-computed counters on its peer too.
  if (syncPeer && compareMode) {
    const peer = editor === primaryEditor ? comparisonEditor : primaryEditor;
    if (peer.counts) renderStats(peer, peer.counts, false);
  }
}

const STATS_SHRINK_STEPS = [0.9, 0.8, 0.7];

function fitStats(editor) {
  const statsEl = editor.statsEl;
  statsEl.style.removeProperty("--stats-scale");
  if (editor.renderedStatsHtml !== editor.statsHtmlFull) {
    statsEl.innerHTML = editor.statsHtmlFull;
    editor.renderedStatsHtml = editor.statsHtmlFull;
  }

  if (!isEditorVisible(editor) || statsEl.scrollWidth <= statsEl.clientWidth + 1) return;

  if (editor.renderedStatsHtml !== editor.statsHtmlShort) {
    statsEl.innerHTML = editor.statsHtmlShort;
    editor.renderedStatsHtml = editor.statsHtmlShort;
  }
  for (const scale of STATS_SHRINK_STEPS) {
    if (statsEl.scrollWidth <= statsEl.clientWidth + 1) return;
    statsEl.style.setProperty("--stats-scale", String(scale));
  }
}

function scheduleStatsUpdate(editor, textLength) {
  clearTimeout(editor.statsUpdateTimer);
  editor.statsUpdateTimer = 0;

  if (textLength <= LARGE_TEXT_THRESHOLD) {
    renderStats(editor);
    return;
  }

  editor.statsUpdateTimer = window.setTimeout(() => {
    editor.statsUpdateTimer = 0;
    renderStats(editor);
  }, COUNT_UPDATE_DELAY);
}

function scheduleTextAnalysis(editor, textLength) {
  clearTimeout(editor.workerUpdateTimer);
  editor.workerUpdateTimer = 0;

  if (textLength > LARGE_TEXT_THRESHOLD && textAnalysisWorker) {
    clearTimeout(editor.statsUpdateTimer);
    editor.statsUpdateTimer = 0;
    clearTimeout(editor.markdownUpdateTimer);
    editor.markdownUpdateTimer = 0;

    const revision = editor.revision;
    editor.workerUpdateTimer = window.setTimeout(() => {
      editor.workerUpdateTimer = 0;
      if (revision !== editor.revision || !textAnalysisWorker) return;
      textAnalysisWorker.postMessage({
        editorId: editor.id,
        revision,
        value: editor.input.value,
      });
    }, WORKER_UPDATE_DELAY);
    return;
  }

  scheduleStatsUpdate(editor, textLength);
  scheduleMarkdownUpdate(editor, textLength);
}

textAnalysisWorker = createTextAnalysisWorker();

if (textAnalysisWorker) {
  textAnalysisWorker.addEventListener("message", (event) => {
    const { editorId, revision, counts, isMarkdown } = event.data;
    const editor = editors.find((item) => item.id === editorId);
    if (!editor || revision !== editor.revision) return;
    renderStats(editor, counts);
    applyMarkdownState(editor, isMarkdown);
  });

  textAnalysisWorker.addEventListener("error", () => {
    textAnalysisWorker.terminate();
    textAnalysisWorker = null;
    editors.forEach((editor) => {
      if (editor.input.textLength > LARGE_TEXT_THRESHOLD) {
        scheduleStatsUpdate(editor, editor.input.textLength);
        scheduleMarkdownUpdate(editor, editor.input.textLength);
      }
    });
  });
}

function buildFilterMenu() {
  filterMenu.innerHTML = STATS.map(
    (stat) => `<label class="filter-menu__item">
      <input type="checkbox" value="${stat.key}" ${selectedStatKeys.includes(stat.key) ? "checked" : ""} />
      <span class="filter-menu__text">
        <span class="filter-menu__label">${stat.menuLabel || stat.label.charAt(0).toUpperCase() + stat.label.slice(1)}</span>
        ${stat.menuHint ? `<span class="filter-menu__hint">${stat.menuHint}</span>` : ""}
      </span>
      <span class="filter-menu__check" aria-hidden="true">
        <svg class="filter-menu__check-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>
        <svg class="filter-menu__check-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h12"></path></svg>
      </span>
    </label>`
  ).join("");
}

filterMenu.addEventListener("change", () => {
  selectedStatKeys = [...filterMenu.querySelectorAll("input:checked")].map(
    (checkbox) => checkbox.value
  );
  setVisibleStats(selectedStatKeys);
  editors.forEach((editor) => scheduleTextAnalysis(editor, editor.input.textLength));
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

document.addEventListener("click", (e) => {
  if (
    !filterMenu.classList.contains("filter-menu--hidden") &&
    !e.target.closest(".stats-filter")
  ) {
    toggleFilterMenu(false);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") toggleFilterMenu(false);
});

function updateEditor(editor, { persist = true } = {}) {
  resetCopyFeedback(editor);
  const textLength = editor.input.textLength;
  editor.revision++;
  syncEditorTools(editor, textLength);
  scheduleTextAnalysis(editor, textLength);
  if (persist) scheduleTextSave(editor);
}

editors.forEach((editor) => {
  editor.input.addEventListener("input", () => {
    editor.clipboardMatchesInput = false;
    updateEditor(editor);
    if (editor.input.selectionEnd === editor.input.textLength) {
      editor.input.scrollTop = editor.input.scrollHeight;
    }
  });
});

let resizeFrame = 0;
window.addEventListener("resize", () => {
  if (resizeFrame) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    editors.forEach((editor) => fitStats(editor));
  });
});

// ---------- Compare mode ----------
function renderCompareButton() {
  compareAddBtn.disabled = compareMode;
  compareAddBtn.setAttribute("aria-expanded", String(compareMode));
}

function setCompareMode(enabled) {
  compareMode = enabled;

  if (enabled) {
    comparisonEditor.root.classList.remove("editor--hidden");
  } else {
    comparisonEditor.root.classList.add("editor--hidden");
  }

  editorsEl.classList.toggle("editors--compare", enabled);
  app.classList.toggle("app--compare", enabled);
  renderCompareButton();

  if (!enabled) {
    if (comparisonEditor.previewMode) exitPreview(comparisonEditor);
    comparisonEditor.input.value = "";
    comparisonEditor.inputFocused = false;
    comparisonEditor.input.blur();
    comparisonEditor.clipboardMatchesInput = knownClipboard === "";
    activeEditor = primaryEditor;
    updateEditor(comparisonEditor, { persist: false });
    // The primary text did not change, but its comparison-only deltas must be
    // removed immediately instead of waiting for a later counter update.
    if (primaryEditor.counts) renderStats(primaryEditor, primaryEditor.counts, false);
  }

  if (enabled) updateEditor(comparisonEditor, { persist: false });

  window.requestAnimationFrame(() => {
    editors.forEach((editor) => fitStats(editor));
  });
}

compareAddBtn.addEventListener("click", () => setCompareMode(true));
compareRemoveBtn.addEventListener("click", () => setCompareMode(false));

// ---------- Paste / type ----------
function refreshClipboardMatches() {
  if (knownClipboard === null) return;
  editors.forEach((editor) => {
    editor.clipboardMatchesInput =
      knownClipboard.length === editor.input.textLength &&
      knownClipboard === editor.input.value;
    syncEditorTools(editor);
  });
}

function fallbackCopyText(text) {
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  helper.style.pointerEvents = "none";
  document.body.appendChild(helper);
  helper.select();
  helper.setSelectionRange(0, helper.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (e) {}
  helper.remove();
  return copied;
}

async function copyEditorText(editor) {
  const text = editor.input.value;
  if (!text) return;

  activeEditor = editor;
  let copied = false;
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (e) {
    copied = fallbackCopyText(text);
  }

  if (!copied) return;

  knownClipboard = text;
  refreshClipboardMatches();
  clearTimeout(editor.copyFeedbackTimer);
  renderCopyButton(editor, true);
  editor.copyFeedbackTimer = window.setTimeout(() => {
    editor.copyFeedbackTimer = 0;
    renderCopyButton(editor);
  }, 1400);
}

editors.forEach((editor) => {
  editor.copyBtn.addEventListener("click", () => copyEditorText(editor));
});

async function doPaste(editor) {
  activeEditor = editor;
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch (e) {
    return;
  }

  knownClipboard = text;
  if (text) {
    editor.input.value = text;
    updateEditor(editor);
  }
  refreshClipboardMatches();
  editor.input.focus();
}

editors.forEach((editor) => {
  editor.replaceBtn.addEventListener("click", () => doPaste(editor));
});

document.addEventListener("keydown", (e) => {
  if (editors.some((editor) => editor.inputFocused)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.length !== 1 || e.key === " ") return;

  const target = isEditorVisible(activeEditor) ? activeEditor : primaryEditor;
  if (target.previewMode) return;

  e.preventDefault();
  target.input.focus();
  const end = target.input.textLength;
  target.input.setRangeText(e.key, end, end, "end");
  target.clipboardMatchesInput = false;
  updateEditor(target);
});

document.addEventListener("paste", (e) => {
  const text = e.clipboardData && e.clipboardData.getData("text/plain");
  if (typeof text === "string") knownClipboard = text;

  const target = isEditorVisible(activeEditor) ? activeEditor : primaryEditor;
  if (target.previewMode) return;

  if (target.inputFocused) {
    setTimeout(refreshClipboardMatches, 0);
    return;
  }
  if (!text) return;

  e.preventDefault();
  const end = target.input.textLength;
  target.input.setRangeText(text, end, end, "end");
  target.input.focus();
  updateEditor(target);
  refreshClipboardMatches();
});

function trackCopy(e) {
  const editor = editors.find((item) => e.target === item.input);
  const selectionStart = editor ? editor.input.selectionStart : 0;
  const selectionEnd = editor ? editor.input.selectionEnd : 0;
  const selection = editor
    ? editor.input.value.slice(selectionStart, selectionEnd)
    : String(window.getSelection());

  if (selection) {
    knownClipboard = selection;
    setTimeout(refreshClipboardMatches, 0);
  }
}

document.addEventListener("copy", trackCopy);
document.addEventListener("cut", trackCopy);

// ---------- Clear ----------
editors.forEach((editor) => {
  editor.clearBtn.addEventListener("click", () => {
    editor.input.value = "";
    editor.clipboardMatchesInput = knownClipboard === "";
    if (editor.previewMode) exitPreview(editor);
    editor.inputFocused = false;
    editor.input.blur();
    activeEditor = editor;
    updateEditor(editor);
  });
});

// ---------- Reference copy ----------
// Ships collapsed: the canvas keeps the first screen, and scrolling never
// lands you in prose you didn't ask for.
const aboutEl = document.getElementById("about");
const aboutToggle = document.getElementById("aboutToggle");
const aboutClose = document.getElementById("aboutClose");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function scrollBehavior() {
  return reducedMotion.matches ? "auto" : "smooth";
}

// Tracks whether the reader has actually travelled into the copy, so the
// scroll back to the top can close it again without the opening scroll
// (which starts at the top) closing it immediately.
let leftTopWhileOpen = false;

function openAbout() {
  aboutEl.hidden = false;
  aboutToggle.setAttribute("aria-expanded", "true");
  leftTopWhileOpen = false;
  aboutEl.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
}

function closeAbout({ focus = true } = {}) {
  // Hiding shrinks the document back to a single screen, so the browser
  // clamps the scroll to the top on its own. No animation to chase and no
  // timer that a long smooth scroll could outlast.
  aboutEl.hidden = true;
  aboutToggle.setAttribute("aria-expanded", "false");
  leftTopWhileOpen = false;
  if (focus) aboutToggle.focus();
}

aboutToggle.addEventListener("click", () => {
  if (aboutEl.hidden) openAbout();
  else closeAbout();
});

aboutClose.addEventListener("click", () => closeAbout());

// Scrolling back to the counter puts the page away again, so the canvas
// can't be scrolled off by accident without asking for the copy first.
window.addEventListener(
  "scroll",
  () => {
    if (aboutEl.hidden) return;
    if (window.scrollY > 40) leftTopWhileOpen = true;
    else if (leftTopWhileOpen) closeAbout({ focus: false });
  },
  { passive: true }
);

// ---------- Init ----------
restoreEditorHeight();
try {
  localStorage.removeItem("comparisonEditorText");
} catch (e) {}
editors.forEach(restoreText);
buildFilterMenu();
editors.forEach(renderPreviewBtn);
renderCompareButton();
editors.forEach((editor) => updateEditor(editor, { persist: false }));

// ---------- Theme ----------
// Shared by the counter and the reference pages: one toggle, one storage key,
// one set of icons, so a page you arrive at from the footer never disagrees
// with the one you left about which mode you are in.
const themeToggle = document.getElementById("themeToggle");
const themeIcon = themeToggle.querySelector(".theme-toggle__icon");

const SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.3a8.4 8.4 0 0 1-10.8-10.8A8.5 8.5 0 1 0 20.5 14.3Z"/></svg>`;

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function storedTheme() {
  try {
    const theme = localStorage.getItem("theme");
    return theme === "light" || theme === "dark" ? theme : null;
  } catch (e) {
    return null;
  }
}

function effectiveTheme() {
  return storedTheme() || (systemDark.matches ? "dark" : "light");
}

function renderIcon() {
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

systemDark.addEventListener("change", () => {
  if (!storedTheme()) renderIcon();
});

renderIcon();

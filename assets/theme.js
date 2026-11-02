// Runs before the page paints, so a saved light or dark choice never flashes the wrong theme.
// Without a saved choice, the CSS follows the visitor's system setting.
(function () {
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  } catch (e) {
    /* storage blocked: follow the system setting */
  }
})();

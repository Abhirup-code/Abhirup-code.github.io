// Runs before the page paints, so a saved light or dark choice never flashes the wrong theme.
// Without a saved choice the site opens in dark mode, black space with stars; the toggle switches to light.
(function () {
  try {
    var saved = localStorage.getItem("theme");
    document.documentElement.setAttribute("data-theme", saved === "light" ? "light" : "dark");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark"); /* storage blocked: still dark */
  }
})();

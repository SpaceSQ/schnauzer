(function () {
  var root = document.documentElement;
  var saved = localStorage.getItem("scr-lang");
  if (saved === "en" || saved === "zh") root.setAttribute("data-lang", saved);

  function setLang(lang) {
    root.setAttribute("data-lang", lang);
    localStorage.setItem("scr-lang", lang);
    document.querySelectorAll(".lang button").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-lang") === lang ? "true" : "false");
    });
  }

  document.querySelectorAll(".lang button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setLang(btn.getAttribute("data-lang"));
    });
  });
  setLang(root.getAttribute("data-lang") || "zh");
})();

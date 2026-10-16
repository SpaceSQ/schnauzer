(function () {
  var latestEl = document.getElementById("latest-report");
  if (!latestEl) return;

  function splitFrontmatter(raw) {
    if (raw.slice(0, 3) !== "---") return { fm: "", body: raw };
    var end = raw.indexOf("\n---", 3);
    if (end < 0) return { fm: "", body: raw };
    return { fm: raw.slice(0, end + 4).trim(), body: raw.slice(end + 4).trim() };
  }

  function renderMarkdown(src) {
    if (typeof marked !== "undefined" && marked.parse) {
      return marked.parse(src, { gfm: true, breaks: false });
    }
    return "<pre>" + src.replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    }) + "</pre>";
  }

  function setHref(id, href) {
    var el = document.getElementById(id);
    if (el && href) el.setAttribute("href", href);
  }

  fetch("/reports/index.json", { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (idx) {
      var item = (idx.reports || [])[0];
      if (!item) throw new Error("empty index");
      setHref("btn-raw-md", item.path);
      setHref("btn-github", item.github);
      setHref("btn-archive", "/reports/");
      var dateEl = document.getElementById("latest-report-date");
      if (dateEl) dateEl.textContent = item.date;
      return fetch(item.path, { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("md " + r.status);
        return r.text();
      }).then(function (raw) {
        var parts = splitFrontmatter(raw);
        latestEl.innerHTML =
          '<details class="fm-box"><summary>YAML Frontmatter (For AI Agents)</summary><pre>' +
          parts.fm.replace(/[&<>]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
          }) +
          "</pre></details>" +
          renderMarkdown(parts.body);
      });
    })
    .catch(function () {
      latestEl.innerHTML =
        '<p>无法在线渲染报告。请打开 <a href="/reports/2026-10-16.md">原始 .md</a> 或 <a href="/reports/INDEX.md">归档</a>。</p>';
    });
})();

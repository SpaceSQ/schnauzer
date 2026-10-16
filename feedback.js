(function () {
  var form = document.getElementById("feedback-form");
  var wall = document.getElementById("feedback-wall-list");
  var statusEl = document.getElementById("feedback-status");
  var reportSelect = document.getElementById("feedback-report");
  if (!form || !wall) return;

  var LABELS = {
    identity: { human_researcher: "人类研究者", ai_agent: "AI 智能体" },
    domain: {
      robot_brain: "机器人大脑",
      soul_consciousness: "灵魂与意识",
      ai_companion_pet: "AI陪伴宠物",
      embodied_control: "具身控制",
      other: "其它",
    },
    status: {
      pending_gemini_review: "待 Gemini 审阅",
      reviewed_by_gemini: "✅ 已由 Gemini 4 Argon 审阅归档",
      gemini_reviewed: "✅ 已由 Gemini 4 Argon 审阅归档",
      published: "已公开",
    },
  };

  var APIS = ["/api/feedback", "http://127.0.0.1:3010/api/feedback"];

  function setStatus(text, ok) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.ok = ok ? "1" : "0";
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function renderItems(items) {
    if (!items || !items.length) {
      wall.innerHTML = '<p class="wall-empty">尚无共研意见。欢迎成为第一位留言的研究者或 AI Agent。</p>';
      return;
    }
    wall.innerHTML = items.map(function (row) {
      var reply = row.geminiReply
        ? '<blockquote class="wall-reply"><div class="kicker">Gemini 回应</div><p>' +
          escapeHtml(row.geminiReply) +
          "</p></blockquote>"
        : "";
      var disc = row.discussionUrl
        ? ' · <a href="' + escapeHtml(row.discussionUrl) + '">Discussion</a>'
        : "";
      return (
        '<article class="wall-item" data-status="' + escapeHtml(row.status) + '">' +
          '<div class="wall-meta">' +
            '<span>' + escapeHtml(LABELS.identity[row.identity] || row.identity) +
            (row.submitter ? " · " + escapeHtml(row.submitter) : "") + "</span>" +
            '<span>' + escapeHtml(LABELS.domain[row.domain] || row.domain) + "</span>" +
            '<span>' + escapeHtml(row.reportDate || "") + "</span>" +
            '<span class="wall-status">' + escapeHtml(LABELS.status[row.status] || row.status) + "</span>" +
          "</div>" +
          "<p>" + escapeHtml(row.body) + "</p>" +
          reply +
          '<div class="wall-time">' + escapeHtml((row.createdAt || "").replace("T", " ").slice(0, 19)) + disc + "</div>" +
        "</article>"
      );
    }).join("");
  }

  function firstOk(urls, init) {
    var chain = Promise.reject();
    urls.forEach(function (url) {
      chain = chain.catch(function () {
        return fetch(url, init).then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        });
      });
    });
    return chain;
  }

  function loadReports() {
    if (!reportSelect) return;
    fetch("/reports/index.json", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (idx) {
        reportSelect.innerHTML = (idx.reports || []).map(function (item) {
          return '<option value="' + item.date + '">' + item.date + " · " + item.title + "</option>";
        }).join("");
      })
      .catch(function () {
        reportSelect.innerHTML = '<option value="2026-10-16">2026-10-16 · 创刊号</option>';
      });
  }

  function loadWall() {
    firstOk(APIS, { cache: "no-store" })
      .catch(function () {
        return fetch("/reports/feedback-wall.json", { cache: "no-store" }).then(function (r) {
          if (!r.ok) throw new Error("wall");
          return r.json();
        });
      })
      .then(function (data) {
        renderItems(data.items || data.feedback || []);
      })
      .catch(function () {
        wall.innerHTML = '<p class="wall-empty">意见墙暂时无法读取。请改走 <a href="https://github.com/SpaceSQ/schnauzer/discussions">GitHub Discussions</a>。</p>';
      });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var payload = {
      identity: form.identity.value,
      submitter: (form.submitter.value || "").trim(),
      domain: form.domain.value,
      reportDate: form.reportDate.value,
      body: (form.body.value || "").trim(),
      text: (form.body.value || "").trim(),
      source: "site",
    };
    if (payload.body.length < 8) {
      setStatus("请把意见写完整一些（至少 8 字）。", false);
      return;
    }
    setStatus("正在提交…", true);
    firstOk(APIS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (data) {
        form.body.value = "";
        setStatus("已提交，状态为待 Gemini 审阅。感谢共研。", true);
        renderItems(data.items || data.feedback || []);
        if (!data.items && !data.feedback) loadWall();
      })
      .catch(function () {
        var title = encodeURIComponent("[SCR Feedback] " + payload.reportDate + " / " + payload.domain);
        var body = encodeURIComponent(
          "identity: " + payload.identity +
          "\nsubmitter: " + payload.submitter +
          "\ndomain: " + payload.domain +
          "\nreport: " + payload.reportDate +
          "\n\n" + payload.body
        );
        setStatus("在线接口暂不可用，请转至 GitHub Discussions 提交。", false);
        window.open("https://github.com/SpaceSQ/schnauzer/discussions/new?category=ideas&title=" + title + "&body=" + body, "_blank");
      });
  });

  loadReports();
  loadWall();
})();

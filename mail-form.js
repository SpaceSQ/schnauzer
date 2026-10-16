(function () {
  document.querySelectorAll("form[data-mailto]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var to = form.getAttribute("data-mailto") || "xiangmiles@gmail.com";
      var prefix = form.getAttribute("data-subject") || "";
      var data = new FormData(form);
      var lines = [];
      data.forEach(function (value, key) {
        lines.push(key + "：" + String(value || "").trim());
      });
      var org = String(data.get("机构") || "").trim();
      var subject = encodeURIComponent(prefix + (org ? " · " + org : ""));
      var body = encodeURIComponent(lines.join("\n"));
      var href = "mailto:" + to + "?subject=" + subject + "&body=" + body;
      var status = form.querySelector(".form-status");
      if (status) {
        status.textContent = "正在打开邮件客户端，收件人 " + to;
        status.dataset.ok = "1";
      }
      window.location.href = href;
    });
  });
})();

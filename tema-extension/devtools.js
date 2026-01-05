const CHECK_TSOFT_META_SCRIPT = `(function () {
  try {
    var meta = document.querySelector('meta[name="copyright"]');
    if (!meta) {
      return false;
    }
    var content = meta.getAttribute("content") || "";
    return content.toLowerCase().includes("t-soft");
  } catch (error) {
    return false;
  }
})();`;

chrome.devtools.inspectedWindow.eval(
  CHECK_TSOFT_META_SCRIPT,
  (result, isException) => {
    if (isException) {
      console.warn("Tema paneli kontrolü yapılırken hata oluştu.", isException);
      return;
    }

    if (!result) {
      console.info("T-Soft meta etiketi bulunamadı, tema paneli açılmadı.");
      return;
    }

    chrome.devtools.panels.create(
      "T-Soft Devtools",
      "icons/icon48.png",
      "panel.html",
      function (panel) {
        console.log("Theme Panel created");
      }
    );
  }
);

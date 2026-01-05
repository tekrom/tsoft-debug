const activePageEl = document.getElementById("activePage");
const translationStatusEl = document.getElementById("translationStatus");
const translationsContainerEl = document.getElementById("translationsContainer");
const refreshTranslationsBtn = document.getElementById("refreshTranslations");
const translationSearchInput = document.getElementById("translationSearch");
const debugWarningEl = document.getElementById("debugWarning");
const variablesSectionEl = document.getElementById("variablesSection");
const globalVarsStatusEl = document.getElementById("globalVarsStatus");
const globalVarsContainerEl = document.getElementById("globalVarsContainer");
const refreshGlobalVarsBtn = document.getElementById("refreshGlobalVars");
const blockVarsStatusEl = document.getElementById("blockVarsStatus");
const blockVarsContainerEl = document.getElementById("blockVarsContainer");
const refreshBlockVarsBtn = document.getElementById("refreshBlockVars");
const globalVarsSearchInput = document.getElementById("globalVarsSearch");
const blockVarsSearchInput = document.getElementById("blockVarsSearch");
const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");
const THEME_STORAGE_KEY = "tsoft_devtools_theme";
const themeToggleBtn = document.getElementById("themeToggle");
const themeIconEl = document.getElementById("themeIcon");
const themeLabelEl = document.getElementById("themeLabel");

let translationsStore = {};
let currentSearchQuery = "";
let navigationRefreshTimer = null;
let isDebugModeEnabled = false;
let globalVarsStore = null;
let blockVarsStore = null;
let globalVarsSearchQuery = "";
let blockVarsSearchQuery = "";
const MAX_FETCH_RETRY = 5;
const FETCH_RETRY_DELAY = 500;
const ACTIVE_PAGE_EVAL_SCRIPT = `(function () {
  try {
    return window.location && window.location.href
      ? window.location.href
      : document.location && document.location.href
      ? document.location.href
      : "";
  } catch (error) {
    return "";
  }
})();`;

const DEBUG_MODE_EVAL_SCRIPT = `(function () {
  try {
    var flag = typeof TSOFT_DEBUG_MODE !== "undefined" ? TSOFT_DEBUG_MODE : undefined;
    if (typeof flag === "undefined") {
      return JSON.stringify({ status: "missing" });
    }

    var enabled =
      flag === true ||
      flag === "true" ||
      flag === 1 ||
      flag === "1" ||
      flag === "on";

    return JSON.stringify({
      status: enabled ? "enabled" : "disabled"
    });
  } catch (error) {
    return JSON.stringify({ status: "error" });
  }
})();`;

const TRANSLATIONS_EVAL_SCRIPT = `(function () {
  try {
    if (typeof TRANSLATES === "undefined") {
      return JSON.stringify({ status: "missing" });
    }

    return JSON.stringify({
      status: "ok",
      payload: TRANSLATES
    });
  } catch (error) {
    return JSON.stringify({
      status: "error",
      message: error && error.message ? error.message : "Bilinmeyen hata"
    });
  }
})();`;

const GLOBAL_VARS_EVAL_SCRIPT = `(function () {
  try {
    if (typeof TSOFT_GLOBAL_VARS === "undefined") {
      return JSON.stringify({ status: "missing" });
    }

    return JSON.stringify({
      status: "ok",
      payload: TSOFT_GLOBAL_VARS
    });
  } catch (error) {
    return JSON.stringify({
      status: "error",
      message: error && error.message ? error.message : "Bilinmeyen hata"
    });
  }
})();`;

const BLOCK_VARS_EVAL_SCRIPT = `(function () {
  try {
    if (typeof TSOFT_BLOCK_VARS === "undefined") {
      return JSON.stringify({ status: "missing" });
    }

    return JSON.stringify({
      status: "ok",
      payload: TSOFT_BLOCK_VARS
    });
  } catch (error) {
    return JSON.stringify({
      status: "error",
      message: error && error.message ? error.message : "Bilinmeyen hata"
    });
  }
})();`;

const hasDevtools = !!(chrome?.devtools?.inspectedWindow);

function setStatus(message, tone = "info") {
  if (!translationStatusEl) {
    return;
  }

  translationStatusEl.textContent = message;
  translationStatusEl.classList.remove("success", "error", "info");
  translationStatusEl.classList.add(tone);
}

function setGlobalStatus(message, tone = "info") {
  if (!globalVarsStatusEl) {
    return;
  }

  globalVarsStatusEl.textContent = message;
  globalVarsStatusEl.classList.remove("success", "error", "info");
  globalVarsStatusEl.classList.add(tone);
}

function setBlockStatus(message, tone = "info") {
  if (!blockVarsStatusEl) {
    return;
  }

  blockVarsStatusEl.textContent = message;
  blockVarsStatusEl.classList.remove("success", "error", "info");
  blockVarsStatusEl.classList.add(tone);
}

function setDebugWarningVisibility(isVisible) {
  if (!debugWarningEl) {
    return;
  }
  debugWarningEl.classList.toggle("visible", Boolean(isVisible));
  variablesSectionEl?.classList.toggle("hidden", Boolean(isVisible));
}

function applyDebugModeState(enabled) {
  isDebugModeEnabled = enabled;
  if (!enabled) {
    translationsContainerEl.innerHTML = "";
    setStatus("Yetkilendirme bekleniyor...", "info");
    globalVarsStore = null;
    if (globalVarsContainerEl) {
      globalVarsContainerEl.innerHTML = "";
    }
    setGlobalStatus("Yetkilendirme bekleniyor...", "info");
    blockVarsStore = null;
    if (blockVarsContainerEl) {
      blockVarsContainerEl.innerHTML = "";
    }
    setBlockStatus("Yetkilendirme bekleniyor...", "info");
  }
  setDebugWarningVisibility(!enabled);
}

function verifyDebugMode(retryAttempt = 0, callback) {
  if (!hasDevtools) {
    applyDebugModeState(false);
    callback?.(false);
    return;
  }
  chrome.devtools.inspectedWindow.eval(
    DEBUG_MODE_EVAL_SCRIPT,
    (result, isException) => {
      if (isException || !result) {
        if (retryAttempt < MAX_FETCH_RETRY) {
          setTimeout(() => verifyDebugMode(retryAttempt + 1, callback), FETCH_RETRY_DELAY);
        } else {
          applyDebugModeState(false);
          callback?.(false);
        }
        return;
      }

      let payload;
      try {
        payload = JSON.parse(result);
      } catch (error) {
        applyDebugModeState(false);
        callback?.(false);
        return;
      }

      const isEnabled = payload.status === "enabled";
      applyDebugModeState(isEnabled);

      callback?.(isEnabled);
    }
  );
}

function updateActivePage(retryAttempt = 0) {
  if (!activePageEl) {
    return;
  }

  if (!hasDevtools) {
    activePageEl.textContent = "Devtools bağlamı yok.";
    activePageEl.title = "";
    return;
  }

  if (retryAttempt === 0) {
    activePageEl.textContent = "Sayfa bilgisi alınıyor...";
    activePageEl.title = "";
  }

  chrome.devtools.inspectedWindow.eval(
    ACTIVE_PAGE_EVAL_SCRIPT,
    (result, isException) => {
      if (!isException && result) {
        activePageEl.textContent = result;
        activePageEl.title = result;
        return;
      }

      if (retryAttempt < MAX_FETCH_RETRY) {
        setTimeout(() => updateActivePage(retryAttempt + 1), FETCH_RETRY_DELAY);
      } else {
        activePageEl.textContent = "Aktif sayfa okunamadı.";
        activePageEl.title = "";
      }
    }
  );
}

function createCopyButton(getText) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copy-btn";
  btn.innerHTML = "📋";
  btn.title = "Kopyala";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    let text = "";
    try { text = getText(); } catch (_) { }
    if (!text) return;
    const finalizeSuccess = () => {
      btn.classList.add("copied");
      btn.innerHTML = "✓";
      btn.title = "Kopyalandı";
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.innerHTML = "📋";
        btn.title = "Kopyala";
      }, 1200);
    };
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        finalizeSuccess();
      } catch (_) { }
    };
    const isDevtools = location.protocol === "devtools:";
    if (!isDevtools && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(finalizeSuccess)
        .catch(fallback);
    } else {
      fallback();
    }
  });
  return btn;
}

function renderTranslations(filterText = "") {
  const translations = translationsStore || {};
  translationsContainerEl.innerHTML = "";

  const groupKeys = Object.keys(translations);
  if (!groupKeys.length) {
    setStatus("Dil değişkeni bulunamadı.", "info");
    return;
  }

  const normalizedFilter = filterText.trim().toLowerCase();
  let visibleGroupCount = 0;

  groupKeys.forEach((groupKey) => {
    const groupValue = translations[groupKey] || {};
    const entryKeys = Object.keys(groupValue);
    if (!entryKeys.length) {
      return;
    }

    const filteredEntries = entryKeys.filter((key) => {
      if (!normalizedFilter) {
        return true;
      }

      const value = groupValue[key];
      const valueStr =
        typeof value === "string" ? value : JSON.stringify(value, null, 0);

      return (
        key.toLowerCase().includes(normalizedFilter) ||
        valueStr.toLowerCase().includes(normalizedFilter)
      );
    });

    if (!filteredEntries.length) {
      return;
    }

    const groupEl = document.createElement("div");
    groupEl.className = "translation-group";

    const titleEl = document.createElement("h3");
    titleEl.textContent = groupKey;
    groupEl.appendChild(titleEl);

    const tableEl = document.createElement("table");
    const tbodyEl = document.createElement("tbody");

    filteredEntries.forEach((key) => {
      const rowEl = document.createElement("tr");
      const keyCell = document.createElement("th");
      const value = groupValue[key];
      // KEY kopyalanacak (span içeriği)
      const copyBtn = createCopyButton(() => key);
      keyCell.appendChild(copyBtn);
      const keyLabelSpan = document.createElement("span");
      keyLabelSpan.textContent = " " + key; // space after icon
      keyCell.appendChild(keyLabelSpan);
      const valueCell = document.createElement("td");
      if (typeof value === "string") { valueCell.textContent = value; } else { valueCell.textContent = JSON.stringify(value, null, 0); }
      rowEl.appendChild(keyCell);
      rowEl.appendChild(valueCell);
      tbodyEl.appendChild(rowEl);
    });

    tableEl.appendChild(tbodyEl);
    groupEl.appendChild(tableEl);
    translationsContainerEl.appendChild(groupEl);
    visibleGroupCount += 1;
  });

  if (!visibleGroupCount) {
    const emptyMessage = normalizedFilter
      ? "Aramanızla eşleşen dil değişkeni bulunamadı."
      : "Dil değişkeni bulunamadı.";
    setStatus(emptyMessage, "info");
    return;
  }

  setStatus(`${visibleGroupCount} dil grubu listelendi.`, "success");
}

function formatValue(value) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 0);
  } catch (error) {
    return String(value);
  }
}

function createValueElement(value) {
  if (Array.isArray(value)) {
    if (!value.length) {
      const emptyArrayEl = document.createElement("span");
      emptyArrayEl.textContent = "[]";
      return emptyArrayEl;
    }
    value = value[0];
  }

  if (value !== null && typeof value === "object") {
    const preEl = document.createElement("pre");
    try {
      preEl.textContent = JSON.stringify(value, null, 2);
    } catch (error) {
      preEl.textContent = String(value);
    }
    return preEl;
  }
  const spanEl = document.createElement("span");
  spanEl.textContent = formatValue(value);
  return spanEl;
}

function renderGlobalVars(data, filterText = "") {
  if (!globalVarsContainerEl) {
    return;
  }

  globalVarsContainerEl.innerHTML = "";

  const entries = [];

  if (Array.isArray(data)) {
    data.forEach((value, index) => {
      entries.push([String(index), value]);
    });
  } else if (data && typeof data === "object") {
    Object.keys(data).forEach((key) => {
      entries.push([key, data[key]]);
    });
  } else if (typeof data !== "undefined" && data !== null) {
    entries.push(["deger", data]);
  }

  if (!entries.length) {
    setGlobalStatus("Global değişken bulunamadı.", "info");
    return;
  }

  const normalizedFilter = filterText.trim().toLowerCase();
  const filteredEntries = normalizedFilter
    ? entries.filter(([keyLabel, value]) => {
      const valueStr = typeof value === "string" ? value : formatValue(value);
      return (
        keyLabel.toLowerCase().includes(normalizedFilter) ||
        valueStr.toLowerCase().includes(normalizedFilter)
      );
    })
    : entries;

  if (!filteredEntries.length) {
    setGlobalStatus("Arama ile eşleşen global değişken yok.", "info");
    return;
  }

  const tableEl = document.createElement("table");
  const tbodyEl = document.createElement("tbody");

  filteredEntries.forEach(([keyLabel, value]) => {
    const rowEl = document.createElement("tr");
    const keyCell = document.createElement("th");
    const copyBtn = createCopyButton(() => keyLabel); // KEY kopyala
    keyCell.appendChild(copyBtn);
    const keySpan = document.createElement("span");
    keySpan.textContent = " " + keyLabel;
    keyCell.appendChild(keySpan);
    const valueCell = document.createElement("td");
    valueCell.appendChild(createValueElement(value));
    rowEl.appendChild(keyCell);
    rowEl.appendChild(valueCell);
    tbodyEl.appendChild(rowEl);
  });

  tableEl.appendChild(tbodyEl);

  const containerEl = document.createElement("div");
  containerEl.className = "translation-group";
  containerEl.appendChild(tableEl);
  globalVarsContainerEl.appendChild(containerEl);

  setGlobalStatus(`${filteredEntries.length} global değer listelendi.`, "success");
}

function renderBlockVars(data, filterText = "") {
  if (!blockVarsContainerEl) {
    return;
  }

  blockVarsContainerEl.innerHTML = "";

  if (!Array.isArray(data) || !data.length) {
    setBlockStatus("Blok değişkeni bulunamadı.", "info");
    return;
  }

  const normalizedFilter = filterText.trim().toLowerCase();
  let renderedCount = 0;

  data.forEach((blockItem, index) => {
    if (!blockItem) {
      return;
    }

    const { name, vars } = blockItem;
    const blockName = name || `Blok ${index + 1}`;
    const entryList = [];

    if (Array.isArray(vars)) {
      vars.forEach((value, idx) => entryList.push([String(idx), value]));
    } else if (vars && typeof vars === "object") {
      Object.keys(vars).forEach((key) => entryList.push([key, vars[key]]));
    } else if (typeof vars !== "undefined") {
      entryList.push(["vars", vars]);
    }

    const filteredEntries = normalizedFilter
      ? entryList.filter(([keyLabel, value]) => {
        const valueStr = typeof value === "string" ? value : formatValue(value);
        return (
          keyLabel.toLowerCase().includes(normalizedFilter) ||
          valueStr.toLowerCase().includes(normalizedFilter) ||
          blockName.toLowerCase().includes(normalizedFilter)
        );
      })
      : entryList;

    if (normalizedFilter && !filteredEntries.length && !blockName.toLowerCase().includes(normalizedFilter)) {
      return;
    }

    const groupEl = document.createElement("div");
    groupEl.className = "translation-group";

    const titleEl = document.createElement("h3");
    titleEl.textContent = blockName;
    groupEl.appendChild(titleEl);

    if (!filteredEntries.length) {
      const emptyEl = document.createElement("p");
      emptyEl.className = "section-help";
      emptyEl.textContent = "Bu blok için tanımlı değişken yok.";
      groupEl.appendChild(emptyEl);
      blockVarsContainerEl.appendChild(groupEl);
      renderedCount += 1;
      return;
    }

    const tableEl = document.createElement("table");
    const tbodyEl = document.createElement("tbody");

    filteredEntries.forEach(([keyLabel, value]) => {
      const rowEl = document.createElement("tr");
      const keyCell = document.createElement("th");
      const copyBtn = createCopyButton(() => keyLabel); // KEY kopyala
      keyCell.appendChild(copyBtn);
      const keySpan = document.createElement("span");
      keySpan.textContent = " " + keyLabel;
      keyCell.appendChild(keySpan);
      const valueCell = document.createElement("td");
      valueCell.appendChild(createValueElement(value));
      rowEl.appendChild(keyCell);
      rowEl.appendChild(valueCell);
      tbodyEl.appendChild(rowEl);
    });

    tableEl.appendChild(tbodyEl);
    groupEl.appendChild(tableEl);
    blockVarsContainerEl.appendChild(groupEl);
    renderedCount += 1;
  });

  if (!renderedCount) {
    setBlockStatus("Arama ile eşleşen blok bulunamadı.", "info");
    return;
  }

  setBlockStatus(`${renderedCount} blok listelendi.`, "success");
}

function fetchTranslations(options = {}) {
  if (!hasDevtools) {
    return;
  }
  const { retryAttempt = 0, silent = false } = options;
  if (!isDebugModeEnabled) {
    return;
  }

  if (!silent || retryAttempt === 0) {
    setStatus("Dil verileri yükleniyor...", "info");
    translationsContainerEl.innerHTML = "";
  }

  chrome.devtools.inspectedWindow.eval(
    TRANSLATIONS_EVAL_SCRIPT,
    (result, isException) => {
      if (isException) {
        if (retryAttempt < MAX_FETCH_RETRY) {
          setTimeout(() => {
            fetchTranslations({ retryAttempt: retryAttempt + 1, silent: true });
          }, FETCH_RETRY_DELAY);
          return;
        }

        setStatus("Dil verileri okunurken hata oluştu.", "error");
        return;
      }

      if (!result) {
        setStatus("Dil verileri bulunamadı.", "info");
        return;
      }

      let payload;
      try {
        payload = JSON.parse(result);
      } catch (error) {
        setStatus("Dil verileri çözümlenemedi.", "error");
        return;
      }

      if (payload.status === "error") {
        setStatus(`Dil verileri okunamadı: ${payload.message}`, "error");
        return;
      }

      if (payload.status === "missing") {
        setStatus("TRANSLATES tanımlı değil.", "info");
        return;
      }

      translationsStore = payload.payload || {};
      renderTranslations(currentSearchQuery);
    }
  );
}

function fetchGlobalVars(options = {}) {
  if (!hasDevtools) {
    return;
  }
  const { retryAttempt = 0, silent = false } = options;
  if (!isDebugModeEnabled || !globalVarsContainerEl) {
    return;
  }

  if (!silent || retryAttempt === 0) {
    setGlobalStatus("Global veriler yükleniyor...", "info");
    globalVarsContainerEl.innerHTML = "";
  }

  chrome.devtools.inspectedWindow.eval(
    GLOBAL_VARS_EVAL_SCRIPT,
    (result, isException) => {
      if (isException) {
        if (retryAttempt < MAX_FETCH_RETRY) {
          setTimeout(() => {
            fetchGlobalVars({ retryAttempt: retryAttempt + 1, silent: true });
          }, FETCH_RETRY_DELAY);
          return;
        }

        setGlobalStatus("Global veriler okunurken hata oluştu.", "error");
        return;
      }

      if (!result) {
        setGlobalStatus("Global veriler bulunamadı.", "info");
        return;
      }

      let payload;
      try {
        payload = JSON.parse(result);
      } catch (error) {
        setGlobalStatus("Global veriler çözümlenemedi.", "error");
        return;
      }

      if (payload.status === "error") {
        setGlobalStatus(
          `Global veriler okunamadı: ${payload.message || "Bilinmeyen hata"}`,
          "error"
        );
        return;
      }

      if (payload.status === "missing") {
        setGlobalStatus("TSOFT_GLOBAL_VARS tanımlı değil.", "info");
        return;
      }

      globalVarsStore = payload.payload;
      renderGlobalVars(globalVarsStore, globalVarsSearchQuery);
    }
  );
}

function fetchBlockVars(options = {}) {
  if (!hasDevtools) {
    return;
  }
  const { retryAttempt = 0, silent = false } = options;
  if (!isDebugModeEnabled || !blockVarsContainerEl) {
    return;
  }

  if (!silent || retryAttempt === 0) {
    setBlockStatus("Blok verileri yükleniyor...", "info");
    blockVarsContainerEl.innerHTML = "";
  }

  chrome.devtools.inspectedWindow.eval(
    BLOCK_VARS_EVAL_SCRIPT,
    (result, isException) => {
      if (isException) {
        if (retryAttempt < MAX_FETCH_RETRY) {
          setTimeout(() => {
            fetchBlockVars({ retryAttempt: retryAttempt + 1, silent: true });
          }, FETCH_RETRY_DELAY);
          return;
        }

        setBlockStatus("Blok verileri okunurken hata oluştu.", "error");
        return;
      }

      if (!result) {
        setBlockStatus("Blok verileri bulunamadı.", "info");
        return;
      }

      let payload;
      try {
        payload = JSON.parse(result);
      } catch (error) {
        setBlockStatus("Blok verileri çözümlenemedi.", "error");
        return;
      }

      if (payload.status === "error") {
        setBlockStatus(
          `Blok verileri okunamadı: ${payload.message || "Bilinmeyen hata"}`,
          "error"
        );
        return;
      }

      if (payload.status === "missing") {
        setBlockStatus("TSOFT_BLOCK_VARS tanımlı değil.", "info");
        return;
      }

      blockVarsStore = payload.payload;
      renderBlockVars(blockVarsStore, blockVarsSearchQuery);
    }
  );
}

function activateTab(tabKey) {
  tabButtons.forEach((button) => {
    const isActive = button.getAttribute("data-tab") === tabKey;
    button.classList.toggle("active", isActive);
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.getAttribute("data-tab-panel") === tabKey;
    panel.classList.toggle("active", isActive);
  });
}

refreshTranslationsBtn?.addEventListener("click", fetchTranslations);
refreshGlobalVarsBtn?.addEventListener("click", fetchGlobalVars);
refreshBlockVarsBtn?.addEventListener("click", fetchBlockVars);
translationSearchInput?.addEventListener("input", (event) => {
  currentSearchQuery = event.target.value || "";
  renderTranslations(currentSearchQuery);
});

if (globalVarsSearchInput) {
  globalVarsSearchInput.addEventListener("input", (e) => {
    globalVarsSearchQuery = e.target.value || "";
    renderGlobalVars(globalVarsStore, globalVarsSearchQuery);
  });
}

if (blockVarsSearchInput) {
  blockVarsSearchInput.addEventListener("input", (e) => {
    blockVarsSearchQuery = e.target.value || "";
    renderBlockVars(blockVarsStore, blockVarsSearchQuery);
  });
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tabKey = button.getAttribute("data-tab");
    if (tabKey) {
      activateTab(tabKey);
    }
  });
});

if (hasDevtools) {
  verifyDebugMode(0, (enabled) => {
    updateActivePage();
    if (enabled) {
      fetchTranslations();
      fetchGlobalVars();
      fetchBlockVars();
    }
  });
} else {
  updateActivePage();
}

if (hasDevtools && chrome?.devtools?.network?.onNavigated) {
  chrome.devtools.network.onNavigated.addListener(() => {
    if (navigationRefreshTimer) {
      clearTimeout(navigationRefreshTimer);
    }
    navigationRefreshTimer = setTimeout(() => {
      verifyDebugMode(0, (enabled) => {
        updateActivePage();
        if (enabled) {
          fetchTranslations();
          fetchGlobalVars();
          fetchBlockVars();
        }
      });
      navigationRefreshTimer = null;
    }, 700);
  });
}

function computeDefaultTheme() {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? "light" : "dark";
}

function applyTheme(theme) {
  if (theme === "dark") {
    document.body.setAttribute("data-theme", "dark");
    if (themeIconEl) themeIconEl.textContent = "🌙";
    if (themeLabelEl) themeLabelEl.textContent = "Koyu Tema";
  } else {
    document.body.removeAttribute("data-theme");
    if (themeIconEl) themeIconEl.textContent = "🌞";
    if (themeLabelEl) themeLabelEl.textContent = "Açık Tema";
  }
}

function readStoredTheme(callback) {
  try {
    if (chrome?.storage?.local) {
      chrome.storage.local.get([THEME_STORAGE_KEY], (result) => {
        callback(result[THEME_STORAGE_KEY] || null);
      });
    } else {
      callback(localStorage.getItem(THEME_STORAGE_KEY));
    }
  } catch (e) {
    callback(null);
  }
}

function storeTheme(theme) {
  try {
    if (chrome?.storage?.local) {
      const data = {};
      data[THEME_STORAGE_KEY] = theme;
      chrome.storage.local.set(data);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch (e) {
    // yoksay
  }
}

function initTheme() {
  readStoredTheme((saved) => {
    const theme = saved || computeDefaultTheme();
    applyTheme(theme);
  });
}

function toggleTheme() {
  const isDark = document.body.getAttribute("data-theme") === "dark";
  const next = isDark ? "light" : "dark";
  applyTheme(next);
  storeTheme(next);
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", toggleTheme);
}

initTheme();

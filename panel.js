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
const toggleAllTranslationsBtn = document.getElementById("toggleAllTranslations");
const toggleAllBlockVarsBtn = document.getElementById("toggleAllBlockVars");
const translationSearchPrev = document.getElementById("translationSearchPrev");
const translationSearchNext = document.getElementById("translationSearchNext");
const translationMatchCounter = document.getElementById("translationMatchCounter");
const blockVarsSearchPrev = document.getElementById("blockVarsSearchPrev");
const blockVarsSearchNext = document.getElementById("blockVarsSearchNext");
const blockVarsMatchCounter = document.getElementById("blockVarsMatchCounter");
const globalVarsSearchPrev = document.getElementById("globalVarsSearchPrev");
const globalVarsSearchNext = document.getElementById("globalVarsSearchNext");
const globalVarsMatchCounter = document.getElementById("globalVarsMatchCounter");

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

function createToggleAllButton(container, labelPrefix = "") {
  const btn = document.createElement("button");
  btn.className = "toggle-all-btn all-closed";
  btn.type = "button";
  btn.textContent = "Tümünü Aç";
  let allOpen = false;
  
  btn.addEventListener("click", () => {
    allOpen = !allOpen;
    toggleAllAccordions(container, allOpen);
    btn.textContent = allOpen ? "Tümünü Kapat" : "Tümünü Aç";
    btn.classList.toggle("all-closed", !allOpen);
  });
  
  return btn;
}

function highlightText(text, query) {
  if (!query || typeof text !== 'string') {
    return text;
  }
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<span class="highlight" data-search-match>$1</span>');
}

function createSearchNavigator(config) {
  const { container, searchInput, prevBtn, nextBtn, counterEl } = config;
  let matches = [];
  let currentIndex = -1;

  function collectMatches() {
    if (!container || !searchInput) return [];
    const q = (searchInput.value || "").trim();
    if (!q) return [];
    const list = container.querySelectorAll("[data-search-match]");
    return Array.from(list);
  }

  function expandAncestorDetails(el) {
    let node = el;
    while (node && node !== container) {
      if (node.tagName === "DETAILS") {
        node.open = true;
      }
      node = node.parentElement;
    }
  }

  function goToMatch(index) {
    matches.forEach((m, i) => {
      m.classList.toggle("highlight-current", i === index);
    });
    currentIndex = index;
    if (index >= 0 && matches[index]) {
      const el = matches[index];
      expandAncestorDetails(el);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    updateUI();
  }

  function updateUI() {
    if (!counterEl) return;
    const q = (searchInput?.value || "").trim();
    const total = matches.length;
    if (!q || total === 0) {
      counterEl.textContent = "";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }
    const idx = currentIndex < 0 ? 0 : currentIndex;
    counterEl.textContent = `${idx + 1} / ${total}`;
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
  }

  function update() {
    matches = collectMatches();
    currentIndex = matches.length > 0 ? 0 : -1;
    matches.forEach((m, i) => m.classList.toggle("highlight-current", i === 0));
    if (matches.length > 0 && matches[0]) {
      expandAncestorDetails(matches[0]);
      matches[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
    updateUI();
  }

  function next() {
    if (matches.length === 0) return;
    const idx = (currentIndex + 1) % matches.length;
    goToMatch(idx);
  }

  function prev() {
    if (matches.length === 0) return;
    const idx = currentIndex <= 0 ? matches.length - 1 : currentIndex - 1;
    goToMatch(idx);
  }

  if (prevBtn) prevBtn.addEventListener("click", prev);
  if (nextBtn) nextBtn.addEventListener("click", next);

  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) prev();
        else next();
      }
    });
  }

  return { update, next, prev };
}

function toggleAllAccordions(container, open) {
  if (!container) return;
  const allDetails = container.querySelectorAll('details');
  allDetails.forEach(details => {
    details.open = open;
  });
}

function getSelectedText() {
  const selection = window.getSelection();
  return selection ? selection.toString().trim() : '';
}

function showTooltip(element, text, duration = 1500) {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.textContent = text;
  document.body.appendChild(tooltip);
  
  const rect = element.getBoundingClientRect();
  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - 10}px`;
  tooltip.style.transform = 'translate(-50%, -100%)';
  
  requestAnimationFrame(() => {
    tooltip.classList.add('visible');
  });
  
  setTimeout(() => {
    tooltip.classList.remove('visible');
    setTimeout(() => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }, 200);
  }, duration);
}

function copyTextToClipboard(text, onSuccess) {
  if (!text) return;
  
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "-1000px";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const success = document.execCommand("copy");
    document.body.removeChild(ta);
    if (success) {
      onSuccess?.();
    }
  } catch (error) {
    console.error("Kopyalama hatası:", error);
  }
}

function createSmartCopyButton(getFullText, getCellElement) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copy-btn";
  btn.innerHTML = "📋";
  btn.title = "Kopyala";
  
  let tooltipTimeout;
  
  btn.addEventListener("mouseenter", () => {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
      const selectedText = getSelectedText();
      const tooltipText = selectedText 
        ? "Seçili metni kopyala" 
        : "Tümünü kopyala (veya metin seç)";
      showTooltip(btn, tooltipText, 2000);
    }, 500);
  });
  
  btn.addEventListener("mouseleave", () => {
    clearTimeout(tooltipTimeout);
  });
  
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearTimeout(tooltipTimeout);
    
    const selectedText = getSelectedText();
    const textToCopy = selectedText || getFullText();
    
    if (!textToCopy) return;
    
    copyTextToClipboard(textToCopy, () => {
      btn.classList.add("copied");
      const originalIcon = btn.innerHTML;
      btn.innerHTML = "✓";
      
      const cell = getCellElement?.();
      if (cell) {
        cell.classList.add('cell-copied-flash');
        setTimeout(() => cell.classList.remove('cell-copied-flash'), 500);
      }
      
      const copyMsg = selectedText 
        ? `Seçili metin kopyalandı! (${selectedText.length} karakter)` 
        : `Kopyalandı! (${textToCopy.length} karakter)`;
      showTooltip(btn, copyMsg, 1500);
      
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.innerHTML = originalIcon;
      }, 1500);
    });
  });
  
  return btn;
}

function addValueCellCopyFeature(cell, valueText) {
  return;
}
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
  return createSmartCopyButton(getText, null);
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

    const detailsEl = document.createElement("details");
    if (normalizedFilter) {
      detailsEl.open = true;
    }

    const summaryEl = document.createElement("summary");
    summaryEl.textContent = groupKey;
    detailsEl.appendChild(summaryEl);

    const contentDiv = document.createElement("div");
    contentDiv.className = "translation-group-content";

    const tableEl = document.createElement("table");
    const tbodyEl = document.createElement("tbody");

    filteredEntries.forEach((key) => {
      const rowEl = document.createElement("tr");
      
      const keyCell = document.createElement("th");
      const keyCellContent = document.createElement("div");
      keyCellContent.className = "cell-content";
      
      const keyCopyBtn = createSmartCopyButton(() => key, () => keyCell);
      keyCellContent.appendChild(keyCopyBtn);
      
      const keyTextSpan = document.createElement("span");
      keyTextSpan.className = "cell-text";
      const value = groupValue[key];
      
      if (normalizedFilter && key.toLowerCase().includes(normalizedFilter)) {
        keyTextSpan.innerHTML = highlightText(key, normalizedFilter);
      } else {
        keyTextSpan.textContent = key;
      }
      keyCellContent.appendChild(keyTextSpan);
      keyCell.appendChild(keyCellContent);
      
      const valueCell = document.createElement("td");
      const valueCellContent = document.createElement("div");
      valueCellContent.className = "cell-content";
      
      let displayValue = "";
      if (typeof value === "string") { 
        displayValue = value;
      } else { 
        displayValue = JSON.stringify(value, null, 2);
      }
      
      const valueCopyBtn = createSmartCopyButton(() => displayValue, () => valueCell);
      valueCellContent.appendChild(valueCopyBtn);
      
      const valueTextSpan = document.createElement("span");
      valueTextSpan.className = "cell-text";
      
      if (value !== null && typeof value === "object") {
        const jsonEl = createCollapsibleJsonElement(value, normalizedFilter);
        valueTextSpan.appendChild(jsonEl);
      } else {
        if (normalizedFilter) {
          valueTextSpan.innerHTML = highlightText(displayValue, normalizedFilter);
        } else {
          valueTextSpan.textContent = displayValue;
        }
      }
      valueCellContent.appendChild(valueTextSpan);
      valueCell.appendChild(valueCellContent);
      
      rowEl.appendChild(keyCell);
      rowEl.appendChild(valueCell);
      tbodyEl.appendChild(rowEl);
    });

    tableEl.appendChild(tbodyEl);
    contentDiv.appendChild(tableEl);
    detailsEl.appendChild(contentDiv);
    groupEl.appendChild(detailsEl);
    
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

function createValueElement(value, highlightQuery = "") {
  if (Array.isArray(value)) {
    if (!value.length) {
      const emptyArrayEl = document.createElement("span");
      emptyArrayEl.textContent = "[]";
      return emptyArrayEl;
    }
    value = value[0];
  }

  if (value !== null && typeof value === "object") {
    return createCollapsibleJsonElement(value, highlightQuery);
  }
  const spanEl = document.createElement("span");
  const formattedValue = formatValue(value);
  if (highlightQuery) {
    spanEl.innerHTML = highlightText(formattedValue, highlightQuery);
  } else {
    spanEl.textContent = formattedValue;
  }
  spanEl.dataset.rawValue = formattedValue;
  return spanEl;
}

function previewKeys(obj) {
  const keys = Object.keys(obj);
  if (keys.length <= 3) return keys.join(", ");
  return keys.slice(0, 2).join(", ") + ", …";
}

function createCollapsibleJsonElement(value, highlightQuery = "") {
  if (value === null) {
    const span = document.createElement("span");
    span.textContent = "null";
    return span;
  }
  if (Array.isArray(value)) {
    const details = document.createElement("details");
    details.className = "json-collapse";
    details.open = true;
    const summary = document.createElement("summary");
    summary.className = "json-collapse-summary";
    summary.textContent = value.length === 0 ? "[]" : `[ ${value.length} öğe ]`;
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "json-collapse-body";
    value.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "json-row";
      const keySpan = document.createElement("span");
      keySpan.className = "json-key";
      keySpan.textContent = String(i);
      row.appendChild(keySpan);
      row.appendChild(document.createTextNode(": "));
      const valEl = createCollapsibleJsonElement(item, highlightQuery);
      if (valEl.nodeType === 1 && valEl.tagName === "DETAILS") {
        valEl.classList.add("json-nested");
      }
      row.appendChild(valEl);
      body.appendChild(row);
    });
    details.appendChild(body);
    return details;
  }
  if (typeof value === "object") {
    const details = document.createElement("details");
    details.className = "json-collapse";
    details.open = true;
    const summary = document.createElement("summary");
    summary.className = "json-collapse-summary";
    summary.textContent = "{ " + previewKeys(value) + " }";
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "json-collapse-body";
    Object.keys(value).forEach((key) => {
      const row = document.createElement("div");
      row.className = "json-row";
      const keySpan = document.createElement("span");
      keySpan.className = "json-key";
      if (highlightQuery && key.toLowerCase().includes(highlightQuery)) {
        keySpan.innerHTML = highlightText(key, highlightQuery);
      } else {
        keySpan.textContent = key;
      }
      row.appendChild(keySpan);
      row.appendChild(document.createTextNode(": "));
      const v = value[key];
      if (v !== null && typeof v === "object") {
        const valEl = createCollapsibleJsonElement(v, highlightQuery);
        valEl.classList.add("json-nested");
        row.appendChild(valEl);
      } else {
        const valSpan = document.createElement("span");
        valSpan.className = "json-value";
        const formatted = typeof v === "string" ? JSON.stringify(v) : formatValue(v);
        if (highlightQuery) {
          valSpan.innerHTML = highlightText(formatted, highlightQuery);
        } else {
          valSpan.textContent = formatted;
        }
        row.appendChild(valSpan);
      }
      body.appendChild(row);
    });
    details.appendChild(body);
    return details;
  }
  const span = document.createElement("span");
  span.className = "json-value";
  const formatted = formatValue(value);
  if (highlightQuery) {
    span.innerHTML = highlightText(formatted, highlightQuery);
  } else {
    span.textContent = formatted;
  }
  return span;
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
    const keyCellContent = document.createElement("div");
    keyCellContent.className = "cell-content";
    
    const keyCopyBtn = createSmartCopyButton(() => keyLabel, () => keyCell);
    keyCellContent.appendChild(keyCopyBtn);
    
    const keySpan = document.createElement("span");
    keySpan.className = "cell-text";
    if (normalizedFilter && keyLabel.toLowerCase().includes(normalizedFilter)) {
      keySpan.innerHTML = highlightText(keyLabel, normalizedFilter);
    } else {
      keySpan.textContent = keyLabel;
    }
    keyCellContent.appendChild(keySpan);
    keyCell.appendChild(keyCellContent);
    
    const valueCell = document.createElement("td");
    const valueCellContent = document.createElement("div");
    valueCellContent.className = "cell-content";
    
    const valueStr = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    const valueCopyBtn = createSmartCopyButton(() => valueStr, () => valueCell);
    valueCellContent.appendChild(valueCopyBtn);
    
    const valueTextSpan = document.createElement("span");
    valueTextSpan.className = "cell-text";
    
    if (value !== null && typeof value === "object") {
      const jsonEl = createCollapsibleJsonElement(value, normalizedFilter);
      valueTextSpan.appendChild(jsonEl);
    } else {
      if (normalizedFilter) {
        valueTextSpan.innerHTML = highlightText(valueStr, normalizedFilter);
      } else {
        valueTextSpan.textContent = valueStr;
      }
    }
    
    valueCellContent.appendChild(valueTextSpan);
    valueCell.appendChild(valueCellContent);
    
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

    const detailsEl = document.createElement("details");
    if (normalizedFilter) {
      detailsEl.open = true;
    }

    const summaryEl = document.createElement("summary");
    summaryEl.textContent = blockName;
    detailsEl.appendChild(summaryEl);

    const contentDiv = document.createElement("div");
    contentDiv.className = "translation-group-content";

    if (!filteredEntries.length) {
      const emptyEl = document.createElement("p");
      emptyEl.className = "section-help";
      emptyEl.textContent = "Bu blok için tanımlı değişken yok.";
      contentDiv.appendChild(emptyEl);
      detailsEl.appendChild(contentDiv);
      groupEl.appendChild(detailsEl);
      
      blockVarsContainerEl.appendChild(groupEl);
      renderedCount += 1;
      return;
    }

    const tableEl = document.createElement("table");
    const tbodyEl = document.createElement("tbody");

    filteredEntries.forEach(([keyLabel, value]) => {
      const rowEl = document.createElement("tr");
      
      const keyCell = document.createElement("th");
      const keyCellContent = document.createElement("div");
      keyCellContent.className = "cell-content";
      
      const keyCopyBtn = createSmartCopyButton(() => keyLabel, () => keyCell);
      keyCellContent.appendChild(keyCopyBtn);
      
      const keySpan = document.createElement("span");
      keySpan.className = "cell-text";
      if (normalizedFilter && keyLabel.toLowerCase().includes(normalizedFilter)) {
        keySpan.innerHTML = highlightText(keyLabel, normalizedFilter);
      } else {
        keySpan.textContent = keyLabel;
      }
      keyCellContent.appendChild(keySpan);
      keyCell.appendChild(keyCellContent);
      
      const valueCell = document.createElement("td");
      const valueCellContent = document.createElement("div");
      valueCellContent.className = "cell-content";
      
      const valueStr = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      const valueCopyBtn = createSmartCopyButton(() => valueStr, () => valueCell);
      valueCellContent.appendChild(valueCopyBtn);
      
      const valueTextSpan = document.createElement("span");
      valueTextSpan.className = "cell-text";
      
      if (value !== null && typeof value === "object") {
        const jsonEl = createCollapsibleJsonElement(value, normalizedFilter);
        valueTextSpan.appendChild(jsonEl);
      } else {
        if (normalizedFilter) {
          valueTextSpan.innerHTML = highlightText(valueStr, normalizedFilter);
        } else {
          valueTextSpan.textContent = valueStr;
        }
      }
      
      valueCellContent.appendChild(valueTextSpan);
      valueCell.appendChild(valueCellContent);
      
      rowEl.appendChild(keyCell);
      rowEl.appendChild(valueCell);
      tbodyEl.appendChild(rowEl);
    });

    tableEl.appendChild(tbodyEl);
    contentDiv.appendChild(tableEl);
    detailsEl.appendChild(contentDiv);
    groupEl.appendChild(detailsEl);
    
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
      translationSearchNav?.update();
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
      globalVarsSearchNav?.update();
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
      blockVarsSearchNav?.update();
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

let translationSearchNav;
let globalVarsSearchNav;
let blockVarsSearchNav;

refreshTranslationsBtn?.addEventListener("click", fetchTranslations);
refreshGlobalVarsBtn?.addEventListener("click", fetchGlobalVars);
refreshBlockVarsBtn?.addEventListener("click", fetchBlockVars);
translationSearchInput?.addEventListener("input", (event) => {
  currentSearchQuery = event.target.value || "";
  renderTranslations(currentSearchQuery);
  translationSearchNav?.update();
});

if (globalVarsSearchInput) {
  globalVarsSearchInput.addEventListener("input", (e) => {
    globalVarsSearchQuery = e.target.value || "";
    renderGlobalVars(globalVarsStore, globalVarsSearchQuery);
    globalVarsSearchNav?.update();
  });
}

if (blockVarsSearchInput) {
  blockVarsSearchInput.addEventListener("input", (e) => {
    blockVarsSearchQuery = e.target.value || "";
    renderBlockVars(blockVarsStore, blockVarsSearchQuery);
    blockVarsSearchNav?.update();
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

if (toggleAllTranslationsBtn) {
  let allTranslationsOpen = false;
  toggleAllTranslationsBtn.addEventListener("click", () => {
    allTranslationsOpen = !allTranslationsOpen;
    toggleAllAccordions(translationsContainerEl, allTranslationsOpen);
    toggleAllTranslationsBtn.textContent = allTranslationsOpen ? "Tümünü Kapat" : "Tümünü Aç";
    toggleAllTranslationsBtn.classList.toggle("all-closed", !allTranslationsOpen);
  });
}

if (toggleAllBlockVarsBtn) {
  let allBlockVarsOpen = false;
  toggleAllBlockVarsBtn.addEventListener("click", () => {
    allBlockVarsOpen = !allBlockVarsOpen;
    toggleAllAccordions(blockVarsContainerEl, allBlockVarsOpen);
    toggleAllBlockVarsBtn.textContent = allBlockVarsOpen ? "Tümünü Kapat" : "Tümünü Aç";
    toggleAllBlockVarsBtn.classList.toggle("all-closed", !allBlockVarsOpen);
  });
}

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

translationSearchNav = createSearchNavigator({
  container: translationsContainerEl,
  searchInput: translationSearchInput,
  prevBtn: translationSearchPrev,
  nextBtn: translationSearchNext,
  counterEl: translationMatchCounter
});

globalVarsSearchNav = createSearchNavigator({
  container: globalVarsContainerEl,
  searchInput: globalVarsSearchInput,
  prevBtn: globalVarsSearchPrev,
  nextBtn: globalVarsSearchNext,
  counterEl: globalVarsMatchCounter
});

blockVarsSearchNav = createSearchNavigator({
  container: blockVarsContainerEl,
  searchInput: blockVarsSearchInput,
  prevBtn: blockVarsSearchPrev,
  nextBtn: blockVarsSearchNext,
  counterEl: blockVarsMatchCounter
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    const activePanel = document.querySelector(".tab-panel.active");
    const searchInput = activePanel?.querySelector("input[type='search']");
    if (searchInput) {
      const sel = getSelectedText();
      if (sel) searchInput.value = sel;
      searchInput.focus();
      searchInput.select();
      if (sel) {
        const ev = new Event("input", { bubbles: true });
        searchInput.dispatchEvent(ev);
      }
    }
  }
});

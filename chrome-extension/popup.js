/**
 * EVA Bridge v3.1 - Popup: status de conexão IDE (localhost) e aba AI Studio.
 * Prioriza AI Studio; fallback para Gemini se necessário.
 */
(function () {
  const STORAGE_KEYS = { IDE_TAB_ID: "eva_ide_tab_id", AI_STUDIO_TAB_ID: "eva_aistudio_tab_id", GEMINI_TAB_ID: "eva_gemini_tab_id" };

  const ideEl = document.getElementById("ide-status");
  const aistudioEl = document.getElementById("aistudio-status");

  function setStatus(el, connected) {
    if (!el || !document.body || !document.contains(el)) return;
    el.textContent = connected ? "Online" : "Offline";
    el.className = "status " + (connected ? "online" : "offline");
  }

  async function refresh() {
    try {
      const stored = await chrome.storage.local.get([STORAGE_KEYS.IDE_TAB_ID, STORAGE_KEYS.AI_STUDIO_TAB_ID, STORAGE_KEYS.GEMINI_TAB_ID]);
      const ideTabId = stored[STORAGE_KEYS.IDE_TAB_ID];
      const aistudioTabId = stored[STORAGE_KEYS.AI_STUDIO_TAB_ID];
      const geminiTabId = stored[STORAGE_KEYS.GEMINI_TAB_ID];

      let ideOk = false;
      let aistudioOk = false;

      if (ideTabId) {
        try {
          const tab = await chrome.tabs.get(ideTabId);
          ideOk = !!tab && (tab.url?.startsWith("http://localhost:3000") || tab.url?.startsWith("http://localhost:3001") || tab.url?.startsWith("http://127.0.0.1:3000") || tab.url?.startsWith("http://127.0.0.1:3001"));
        } catch (_) {}
      }
      if (aistudioTabId) {
        try {
          const tab = await chrome.tabs.get(aistudioTabId);
          aistudioOk = !!tab && tab.url && tab.url.includes("aistudio.google.com");
        } catch (_) {}
      }
      if (!aistudioOk) {
        try {
          const tabs = await chrome.tabs.query({ url: ["https://aistudio.google.com/*", "https://www.aistudio.google.com/*"] });
          aistudioOk = tabs.length > 0;
        } catch (_) {}
      }
      if (!aistudioOk && geminiTabId) {
        try {
          const tab = await chrome.tabs.get(geminiTabId);
          aistudioOk = !!tab && tab.url && tab.url.includes("gemini.google.com");
        } catch (_) {}
      }
      if (!aistudioOk) {
        try {
          const tabs = await chrome.tabs.query({ url: ["https://gemini.google.com/*", "https://www.gemini.google.com/*"] });
          aistudioOk = tabs.length > 0;
        } catch (_) {}
      }

      setStatus(ideEl, ideOk);
      setStatus(aistudioEl, aistudioOk);
    } catch (err) {
      setStatus(ideEl, false);
      setStatus(aistudioEl, false);
    }
  }

  refresh();
})();

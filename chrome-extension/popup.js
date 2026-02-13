/**
 * EVA Bridge v3.0 - Popup: status de conexão IDE (localhost) e aba Gemini.
 * Apenas um refresh ao abrir; sem setInterval (popup pode fechar a qualquer momento).
 */
(function () {
  const STORAGE_KEYS = { IDE_TAB_ID: "eva_ide_tab_id", GEMINI_TAB_ID: "eva_gemini_tab_id" };

  const ideEl = document.getElementById("ide-status");
  const geminiEl = document.getElementById("gemini-status");

  function setStatus(el, connected) {
    if (!el || !document.body || !document.contains(el)) return;
    el.textContent = connected ? "Online" : "Offline";
    el.className = "status " + (connected ? "online" : "offline");
  }

  async function refresh() {
    try {
      const stored = await chrome.storage.local.get([STORAGE_KEYS.IDE_TAB_ID, STORAGE_KEYS.GEMINI_TAB_ID]);
      const ideTabId = stored[STORAGE_KEYS.IDE_TAB_ID];
      const geminiTabId = stored[STORAGE_KEYS.GEMINI_TAB_ID];

      let ideOk = false;
      let geminiOk = false;

      if (ideTabId) {
        try {
          const tab = await chrome.tabs.get(ideTabId);
          ideOk = !!tab && (tab.url?.startsWith("http://localhost:3000") || tab.url?.startsWith("http://localhost:3001") || tab.url?.startsWith("http://127.0.0.1:3000") || tab.url?.startsWith("http://127.0.0.1:3001"));
        } catch (_) {}
      }
      if (geminiTabId) {
        try {
          const tab = await chrome.tabs.get(geminiTabId);
          geminiOk = !!tab && tab.url && (tab.url.includes("gemini.google.com"));
        } catch (_) {}
      }
      if (!geminiOk) {
        try {
          const tabs = await chrome.tabs.query({ url: ["https://gemini.google.com/*", "https://www.gemini.google.com/*"] });
          geminiOk = tabs.length > 0;
        } catch (_) {}
      }

      setStatus(ideEl, ideOk);
      setStatus(geminiEl, geminiOk);
    } catch (err) {
      setStatus(ideEl, false);
      setStatus(geminiEl, false);
    }
  }

  refresh();
})();

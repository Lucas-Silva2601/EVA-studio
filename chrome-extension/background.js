/**
 * EVA Studio Bridge v2.0 - Background Service Worker (Manifest V3)
 * Roteia mensagens entre a aba da IDE (localhost:3000) e a aba do Google Gemini (gemini.google.com).
 * Protocolo: EVA_PROMPT_SEND (IDE -> Extensão), EVA_CODE_RETURNED (Extensão -> IDE).
 */
console.log("EVA Bridge v2.0 Service Worker Ativo");

const STORAGE_KEYS = {
  IDE_TAB_ID: "eva_ide_tab_id",
  GEMINI_TAB_ID: "eva_gemini_tab_id",
};

async function getIdeTabId() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.IDE_TAB_ID);
  return out[STORAGE_KEYS.IDE_TAB_ID];
}

function setIdeTabId(tabId) {
  return chrome.storage.local.set({ [STORAGE_KEYS.IDE_TAB_ID]: tabId });
}

async function getGeminiTabId() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.GEMINI_TAB_ID);
  return out[STORAGE_KEYS.GEMINI_TAB_ID];
}

function setGeminiTabId(tabId) {
  return chrome.storage.local.set({ [STORAGE_KEYS.GEMINI_TAB_ID]: tabId });
}

function sendCodeReturnedToIde(payload) {
  getIdeTabId().then((ideTabId) => {
    if (!ideTabId) return;
    chrome.tabs.sendMessage(ideTabId, { type: "EVA_CODE_RETURNED", payload }).catch(() => {});
  });
}

// Mensagens da IDE (content-ide.js)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source !== "eva-content-ide") return false;
  const { type, payload } = message;

  if (type === "REGISTER_IDE_TAB") {
    console.log("[EVA Bridge] Aba da IDE registrada:", sender.tab?.id);
    setIdeTabId(sender.tab?.id).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (type === "EVA_PROMPT_SEND") {
    console.log("[EVA Bridge] EVA_PROMPT_SEND recebido, procurando aba do Gemini...");
    getGeminiTabId().then(async (geminiTabId) => {
      let tabIdToUse = geminiTabId;
      if (!tabIdToUse) {
        const tabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
        if (tabs.length > 0) {
          tabIdToUse = tabs[0].id;
          await setGeminiTabId(tabIdToUse);
          console.log("[EVA Bridge] Aba do Gemini descoberta e registrada:", tabIdToUse);
        }
      }
      if (!tabIdToUse) {
        console.warn("[EVA Bridge] Nenhuma aba do Gemini encontrada.");
        sendCodeReturnedToIde({ error: "Abra o Google Gemini (gemini.google.com) em uma aba primeiro." });
        sendResponse({ ok: false });
        return;
      }
      chrome.tabs.sendMessage(tabIdToUse, { type: "EVA_PROMPT_INJECT", payload: { prompt: payload?.prompt ?? "" } })
        .then(() => {
          console.log("[EVA Bridge] EVA_PROMPT_INJECT enviado ao Gemini.");
          sendResponse({ ok: true });
        })
        .catch((err) => {
          console.warn("[EVA Bridge] Falha ao enviar ao Gemini.", err?.message || err);
          sendCodeReturnedToIde({ error: "Aba do Gemini fechada ou indisponível. Mantenha gemini.google.com aberto." });
          sendResponse({ ok: false });
        });
    });
    return true;
  }
  return false;
});

// Mensagens do Gemini (content-gemini.js)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source !== "eva-content-gemini") return false;
  const { type, payload } = message;

  if (type === "REGISTER_GEMINI_TAB") {
    console.log("[EVA Bridge] Aba do Gemini registrada:", sender.tab?.id);
    setGeminiTabId(sender.tab?.id).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (type === "EVA_CODE_CAPTURED") {
    console.log("[EVA Bridge] EVA_CODE_CAPTURED recebido do Gemini, repassando à IDE.");
    sendCodeReturnedToIde(payload ?? {});
    sendResponse({ ok: true });
    return true;
  }

  if (type === "EVA_ERROR") {
    sendCodeReturnedToIde({ error: payload?.message ?? "Erro no Gemini." });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

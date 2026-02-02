/**
 * EVA Studio Bridge - Background Service Worker (Manifest V3)
 * Roteia mensagens entre a aba da IDE (localhost:3000) e a aba do Google AI Studio.
 * Usa apenas APIs chrome.* (sem window/document).
 */
console.log("EVA Bridge Service Worker Ativo");

const STORAGE_KEYS = { IDE_TAB_ID: "eva_ide_tab_id", AI_STUDIO_TAB_ID: "eva_ai_studio_tab_id" };

async function getIdeTabId() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.IDE_TAB_ID);
  return out[STORAGE_KEYS.IDE_TAB_ID];
}

function setIdeTabId(tabId) {
  return chrome.storage.local.set({ [STORAGE_KEYS.IDE_TAB_ID]: tabId });
}

async function getAiStudioTabId() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.AI_STUDIO_TAB_ID);
  return out[STORAGE_KEYS.AI_STUDIO_TAB_ID];
}

function setAiStudioTabId(tabId) {
  return chrome.storage.local.set({ [STORAGE_KEYS.AI_STUDIO_TAB_ID]: tabId });
}

function sendCodeReturnedToIde(payload) {
  getIdeTabId().then((ideTabId) => {
    if (!ideTabId) return;
    chrome.tabs.sendMessage(ideTabId, { type: "EVA_CODE_RETURNED", payload }).catch(() => {});
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source !== "eva-content-ide") return false;
  const { type, payload } = message;

  if (type === "REGISTER_IDE_TAB") {
    console.log("[BACKGROUND] Aba da IDE registrada:", sender.tab?.id);
    setIdeTabId(sender.tab?.id).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (type === "EVA_PROMPT_SEND") {
    console.log("[BACKGROUND] Recebi do Content-IDE, procurando aba do AI Studio...");
    getAiStudioTabId().then(async (aiTabId) => {
      let tabIdToUse = aiTabId;
      if (!tabIdToUse) {
        const tabs = await chrome.tabs.query({ url: "*://aistudio.google.com/*" });
        console.log("[EVA DEBUG] Abas encontradas:", tabs.length);
        if (tabs.length > 0) {
          tabIdToUse = tabs[0].id;
          await setAiStudioTabId(tabIdToUse);
          console.log("[BACKGROUND] Aba do AI Studio descoberta e registrada:", tabIdToUse);
        }
      }
      if (!tabIdToUse) {
        console.warn("[BACKGROUND] AI Studio tab não registrada e nenhuma aba encontrada.");
        sendCodeReturnedToIde({ error: "Abra o Google AI Studio em uma aba primeiro." });
        sendResponse({ ok: false });
        return;
      }
      chrome.tabs.sendMessage(tabIdToUse, { type: "EVA_PROMPT_INJECT", payload: { prompt: payload?.prompt ?? "" } })
        .then(() => {
          console.log("[BACKGROUND] EVA_PROMPT_INJECT enviado com sucesso para a aba do AI Studio.");
          sendResponse({ ok: true });
        })
        .catch((err) => {
          console.warn("[BACKGROUND] Falha ao enviar para AI Studio.", err?.message || err);
          sendCodeReturnedToIde({ error: "Aba do AI Studio fechada ou indisponível. Mantenha a aba do Google AI Studio aberta." });
          sendResponse({ ok: false });
        });
    });
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source !== "eva-content-ai-studio") return false;
  const { type, payload } = message;

  if (type === "REGISTER_AI_STUDIO_TAB") {
    console.log("[BACKGROUND] Aba do AI Studio registrada:", sender.tab?.id);
    setAiStudioTabId(sender.tab?.id).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (type === "EVA_CODE_CAPTURED") {
    console.log("[BACKGROUND] EVA_CODE_CAPTURED recebido do Content-AI, repassando à IDE.");
    sendCodeReturnedToIde(payload ?? {});
    sendResponse({ ok: true });
    return true;
  }

  if (type === "EVA_ERROR") {
    sendCodeReturnedToIde({ error: payload?.message ?? "Erro no AI Studio." });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

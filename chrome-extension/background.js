/**
 * EVA Studio Bridge v3.1 - Background Service Worker (Manifest V3)
 * Roteia mensagens entre a IDE (localhost:3000) e o Google AI Studio (aistudio.google.com) ou Gemini (gemini.google.com).
 * AI Studio é o alvo principal; Gemini é alternativa.
 * Protocolo: EVA_PROMPT_SEND (IDE -> Extensão), EVA_CODE_RETURNED (Extensão -> IDE).
 */
console.log("EVA Bridge v3.1 Service Worker Ativo");

const STORAGE_KEYS = {
  IDE_TAB_ID: "eva_ide_tab_id",
  AI_STUDIO_TAB_ID: "eva_aistudio_tab_id",
  GEMINI_TAB_ID: "eva_gemini_tab_id",
};

async function getIdeTabId() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.IDE_TAB_ID);
  return out[STORAGE_KEYS.IDE_TAB_ID];
}

function setIdeTabId(tabId) {
  return chrome.storage.local.set({ [STORAGE_KEYS.IDE_TAB_ID]: tabId });
}

const AI_STUDIO_URL_PATTERNS = ["https://aistudio.google.com/*", "https://www.aistudio.google.com/*"];
const GEMINI_URL_PATTERNS = ["https://gemini.google.com/*"];

async function getAIStudioTabId() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.AI_STUDIO_TAB_ID);
  return out[STORAGE_KEYS.AI_STUDIO_TAB_ID];
}

function setAIStudioTabId(tabId) {
  return chrome.storage.local.set({ [STORAGE_KEYS.AI_STUDIO_TAB_ID]: tabId });
}

async function getGeminiTabId() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.GEMINI_TAB_ID);
  return out[STORAGE_KEYS.GEMINI_TAB_ID];
}

function setGeminiTabId(tabId) {
  return chrome.storage.local.set({ [STORAGE_KEYS.GEMINI_TAB_ID]: tabId });
}

/**
 * Encontra aba válida: prioriza aba ativa (seja AI studio ou Gemini), depois AI Studio armazenado, depois Gemini armazenado.
 */
async function findValidProgrammerTab() {
  // 1. Prioridade: Aba ativa e focada (o que o usuario está olhando)
  const activeTabsAI = await chrome.tabs.query({ url: AI_STUDIO_URL_PATTERNS, active: true, lastFocusedWindow: true });
  if (activeTabsAI.length > 0) {
    const tabId = activeTabsAI[0].id;
    await setAIStudioTabId(tabId);
    console.log("[EVA Bridge] Aba AI Studio ATIVA descoberta:", tabId);
    return { tabId, source: "aistudio", script: "content-aistudio.js" };
  }

  const activeTabsGemini = await chrome.tabs.query({ url: GEMINI_URL_PATTERNS, active: true, lastFocusedWindow: true });
  if (activeTabsGemini.length > 0) {
    const tabId = activeTabsGemini[0].id;
    await setGeminiTabId(tabId);
    console.log("[EVA Bridge] Aba Gemini ATIVA descoberta:", tabId);
    return { tabId, source: "gemini", script: "content-gemini.js" };
  }

  // 2. Verificar armazenados ou abertos em background (Prioridade: AI Studio > Gemini)
  // AI Studio
  const storedAI = await getAIStudioTabId();
  if (storedAI) {
    try {
      const tab = await chrome.tabs.get(storedAI);
      if (tab && tab.url && tab.url.includes("aistudio.google.com")) {
        return { tabId: tab.id, source: "aistudio", script: "content-aistudio.js" };
      }
    } catch (_) { }
  }
  const openAI = await chrome.tabs.query({ url: AI_STUDIO_URL_PATTERNS });
  if (openAI.length > 0) {
    const tabId = openAI[0].id;
    await setAIStudioTabId(tabId);
    return { tabId, source: "aistudio", script: "content-aistudio.js" };
  }

  // Gemini
  const storedGemini = await getGeminiTabId();
  if (storedGemini) {
    try {
      const tab = await chrome.tabs.get(storedGemini);
      if (tab && tab.url && tab.url.includes("gemini.google.com")) {
        return { tabId: tab.id, source: "gemini", script: "content-gemini.js" };
      }
    } catch (_) { }
  }
  const openGemini = await chrome.tabs.query({ url: GEMINI_URL_PATTERNS });
  if (openGemini.length > 0) {
    const tabId = openGemini[0].id;
    await setGeminiTabId(tabId);
    return { tabId, source: "gemini", script: "content-gemini.js" };
  }

  return null;
}

function sendCodeReturnedToIde(payload) {
  getIdeTabId().then((ideTabId) => {
    if (!ideTabId) return;
    chrome.tabs.sendMessage(ideTabId, { type: "EVA_CODE_RETURNED", payload }).catch(() => { });
  });
}

// Mensagens da IDE (content-ide.js)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source === "eva-content-ide") {
    const type = message.type;
    const payload = message.payload != null && typeof message.payload === "object" ? message.payload : undefined;

    if (type === "REGISTER_IDE_TAB") {
      console.log("[EVA Bridge] Aba da IDE registrada:", sender.tab?.id);
      setIdeTabId(sender.tab?.id)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          console.warn("[EVA Bridge] Falha ao registrar aba IDE.", err);
          try { sendResponse({ ok: false }); } catch (_) { }
        });
      return true;
    }

    if (type === "EVA_PROMPT_SEND") {
      console.log("[EVA Bridge] EVA_PROMPT_SEND recebido, buscando programador (AI Studio ou Gemini)...");
      let responded = false;
      function safeSendResponse(value) {
        if (responded) return;
        responded = true;
        try { sendResponse(value); } catch (_) { }
      }

      const trySend = async (tabId) => {
        const { prompt, images } = payload;
        return chrome.tabs.sendMessage(tabId, { type: "EVA_PROMPT_INJECT", payload: { prompt, images } });
      };

      const isReceivingEndError = (err) => {
        const msg = (err?.message || "").toLowerCase();
        return (msg.includes("receiving end") || msg.includes("could not establish connection"));
      };

      const tryInjectAndSend = async (tabId, scriptFile) => {
        try {
          await trySend(tabId);
          return true;
        } catch (err) {
          if (!isReceivingEndError(err)) throw err;
          console.log("[EVA Bridge] Injetando script manualmente:", scriptFile);
          await chrome.scripting.executeScript({ target: { tabId }, files: [scriptFile] });
          await new Promise(r => setTimeout(r, 1500));
          try {
            await trySend(tabId);
            return true;
          } catch (retryErr) {
            if (!isReceivingEndError(retryErr)) throw retryErr;
            return false;
          }
        }
      };

      (async () => {
        const found = await findValidProgrammerTab();
        if (!found) {
          sendCodeReturnedToIde({ error: "Nenhuma aba do AI Studio ou Gemini encontrada. Abra aistudio.google.com ou gemini.google.com." });
          safeSendResponse({ ok: false });
          return;
        }

        const ok = await tryInjectAndSend(found.tabId, found.script);
        if (ok) {
          console.log(`[EVA Bridge] Prompt enviado para ${found.source} (tab ${found.tabId})`);
          safeSendResponse({ ok: true });
        } else {
          sendCodeReturnedToIde({ error: `Falha ao comunicar com ${found.source}. Recarregue a aba (F5).` });
          safeSendResponse({ ok: false });
        }
      })();
      return true;
    }
    return false;
  }

  // Mensagens do Programador (AI Studio ou Gemini)
  if (message.source === "eva-content-aistudio" || message.source === "eva-content-gemini") {
    const type = message.type;
    const payload = message.payload;
    const isGemini = message.source === "eva-content-gemini";

    if (type === "REGISTER_AISTUDIO_TAB") {
      setAIStudioTabId(sender.tab?.id);
      sendResponse({ ok: true });
      return true;
    }
    if (type === "REGISTER_GEMINI_TAB") {
      setGeminiTabId(sender.tab?.id);
      sendResponse({ ok: true });
      return true;
    }

    if (type === "EVA_CODE_CAPTURED") {
      console.log(`[EVA Bridge] Código capturado de ${isGemini ? "Gemini" : "AI Studio"}`);
      sendCodeReturnedToIde(payload);
      sendResponse({ ok: true });
      return true;
    }

    if (type === "EVA_ERROR") {
      const msg = payload?.message || "Erro desconhecido";
      console.warn(`[EVA Bridge] Erro em ${isGemini ? "Gemini" : "AI Studio"}:`, msg);
      sendCodeReturnedToIde({ error: msg });
      sendResponse({ ok: true });
      return true;
    }
  }

  return false;
});

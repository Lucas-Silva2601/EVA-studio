/**
 * EVA Studio Bridge v3.1 - Background Service Worker (Manifest V3)
 * Roteia mensagens entre a IDE (localhost:3000) e o Google AI Studio (aistudio.google.com).
 * AI Studio é o alvo principal; Gemini é fallback.
 * Protocolo: EVA_PROMPT_SEND (IDE -> Extensão), EVA_CODE_RETURNED (Extensão -> IDE).
 */
console.log("EVA Bridge v3.1 Service Worker Ativo");

const STORAGE_KEYS = {
  IDE_TAB_ID: "eva_ide_tab_id",
  AI_STUDIO_TAB_ID: "eva_aistudio_tab_id",
};

async function getIdeTabId() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.IDE_TAB_ID);
  return out[STORAGE_KEYS.IDE_TAB_ID];
}

function setIdeTabId(tabId) {
  return chrome.storage.local.set({ [STORAGE_KEYS.IDE_TAB_ID]: tabId });
}

const AI_STUDIO_URL_PATTERNS = ["https://aistudio.google.com/*", "https://www.aistudio.google.com/*"];

async function getAIStudioTabId() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.AI_STUDIO_TAB_ID);
  return out[STORAGE_KEYS.AI_STUDIO_TAB_ID];
}

function setAIStudioTabId(tabId) {
  return chrome.storage.local.set({ [STORAGE_KEYS.AI_STUDIO_TAB_ID]: tabId });
}



/**
 * Encontra aba válida: prioriza AI Studio, fallback para Gemini.
 */
async function findValidProgrammerTab() {
  const storedAI = await getAIStudioTabId();
  if (storedAI) {
    try {
      const tab = await chrome.tabs.get(storedAI);
      if (tab?.url && tab.url.includes("aistudio.google.com")) return { tabId: tab.id, source: "aistudio", script: "content-aistudio.js" };
    } catch (_) { }
  }
  // Tenta encontrar a aba ativa e focada primeiro
  const activeTabs = await chrome.tabs.query({ url: AI_STUDIO_URL_PATTERNS, active: true, lastFocusedWindow: true });
  if (activeTabs.length > 0) {
    const tabId = activeTabs[0].id;
    await setAIStudioTabId(tabId);
    console.log("[EVA Bridge] Aba do AI Studio ATIVA descoberta:", tabId);
    return { tabId, source: "aistudio", script: "content-aistudio.js" };
  }

  // Se não, pega qualquer aba do AI Studio aberta
  const aistudioTabs = await chrome.tabs.query({ url: AI_STUDIO_URL_PATTERNS });
  if (aistudioTabs.length > 0) {
    const tabId = aistudioTabs[0].id;
    await setAIStudioTabId(tabId);
    console.log("[EVA Bridge] Aba do AI Studio descoberta (background):", tabId);
    return { tabId, source: "aistudio", script: "content-aistudio.js" };
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
  if (message.source !== "eva-content-ide") return false;
  const type = message.type;
  const payload = message.payload != null && typeof message.payload === "object" ? message.payload : undefined;

  if (type === "REGISTER_IDE_TAB") {
    console.log("[EVA Bridge] Aba da IDE registrada:", sender.tab?.id);
    setIdeTabId(sender.tab?.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.warn("[EVA Bridge] Falha ao registrar aba IDE. tabId:", sender.tab?.id, "err:", err?.message);
        try { sendResponse({ ok: false }); } catch (_) { }
      });
    return true;
  }

  if (type === "EVA_PROMPT_SEND") {
    console.log("[EVA Bridge] EVA_PROMPT_SEND recebido, procurando aba do AI Studio...");
    const prompt = payload?.prompt ?? "";
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
      return (
        msg.includes("receiving end") ||
        msg.includes("could not establish connection") ||
        msg.includes("não foi possível estabelecer")
      );
    };
    const tryInjectAndSend = async (tabId, scriptFile) => {
      try {
        await trySend(tabId);
        return true;
      } catch (err) {
        if (!isReceivingEndError(err)) throw err;
        console.log("[EVA Bridge] Content script ausente, injetando programaticamente...");
        const injectTargets = [{ tabId }, { tabId, allFrames: true }];
        const RETRY_DELAYS_MS = [500, 1000, 2000];
        const MAX_INJECT_ATTEMPTS = 3;
        for (let i = 0; i < injectTargets.length; i++) {
          const target = injectTargets[i];
          try {
            await chrome.scripting.executeScript({
              target,
              files: [scriptFile],
            });
            for (let attempt = 0; attempt < MAX_INJECT_ATTEMPTS; attempt++) {
              const delayMs = RETRY_DELAYS_MS[attempt] ?? 2000;
              await new Promise((r) => setTimeout(r, delayMs));
              try {
                await trySend(tabId);
                return true;
              } catch (retryErr) {
                if (!isReceivingEndError(retryErr)) throw retryErr;
              }
            }
          } catch (injectErr) {
            console.warn("[EVA Bridge] Injeção falhou (tentativa " + (i + 1) + "):", injectErr?.message || injectErr);
          }
        }
        return false;
      }
    };
    (async () => {
      let tabIdToUse = null;
      let scriptFile = "content-aistudio.js";
      try {
        const found = await findValidProgrammerTab();
        if (!found) {
          console.warn("[EVA Bridge] Nenhuma aba do AI Studio encontrada.");
          sendCodeReturnedToIde({ error: "Abra o Google AI Studio (aistudio.google.com) em uma aba primeiro." });
          safeSendResponse({ ok: false });
          return;
        }
        tabIdToUse = found.tabId;
        scriptFile = found.script;
        const ok = await tryInjectAndSend(tabIdToUse, scriptFile);
        if (ok) {
          console.log("[EVA Bridge] EVA_PROMPT_INJECT enviado ao " + found.source + ".");
          safeSendResponse({ ok: true });
        } else {
          sendCodeReturnedToIde({
            error: "Content script não disponível. Recarregue a aba em aistudio.google.com (F5) e tente novamente.",
          });
          safeSendResponse({ ok: false });
        }
      } catch (err) {
        console.warn("[EVA Bridge] Falha ao enviar. type:EVA_PROMPT_SEND tabId:", tabIdToUse, "err:", err?.message || err);
        try {
          const retry = await findValidProgrammerTab();
          if (retry && retry.tabId !== tabIdToUse) {
            const ok = await tryInjectAndSend(retry.tabId, retry.script);
            if (ok) {
              console.log("[EVA Bridge] EVA_PROMPT_INJECT enviado (retry).");
              safeSendResponse({ ok: true });
              return;
            }
          }
        } catch (_) { }
        sendCodeReturnedToIde({
          error: "Aba do AI Studio fechada ou indisponível. Recarregue a aba (F5) e tente novamente.",
        });
        safeSendResponse({ ok: false });
      }
    })();
    return true;
  }
  return false;
});

// Mensagens do AI Studio (content-aistudio.js)
function handleProgrammerMessage(source, message, payload, sender, sendResponse) {
  const type = message.type;

  if (type === "REGISTER_AISTUDIO_TAB") {
    console.log("[EVA Bridge] Aba do AI Studio registrada:", sender.tab?.id);
    setAIStudioTabId(sender.tab?.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.warn("[EVA Bridge] Falha ao registrar aba AI Studio. tabId:", sender.tab?.id, "err:", err?.message);
        try { sendResponse({ ok: false }); } catch (_) { }
      });
    return true;
  }



  if (type === "EVA_CODE_CAPTURED") {
    const safePayload = payload ?? {};
    console.log("[EVA Bridge] EVA_CODE_CAPTURED recebido do " + source + ", repassando à IDE.");
    sendCodeReturnedToIde(safePayload);
    sendResponse({ ok: true });
    return true;
  }

  if (type === "EVA_ERROR") {
    const msg = payload && typeof payload.message === "string" ? payload.message : "Erro ao gerar código.";
    sendCodeReturnedToIde({ error: msg });
    sendResponse({ ok: true });
    return true;
  }
  return false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source !== "eva-content-aistudio") return false;
  const payload = message.payload != null && typeof message.payload === "object" ? message.payload : undefined;
  const source = "AI Studio";
  return handleProgrammerMessage(source, message, payload, sender, sendResponse);
});

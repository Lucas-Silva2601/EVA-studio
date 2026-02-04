/**
 * EVA Studio Bridge v3.0 - Background Service Worker (Manifest V3)
 * Roteia mensagens entre a aba da IDE (localhost:3000) e a aba do Google Gemini (gemini.google.com).
 * Protocolo: EVA_PROMPT_SEND (IDE -> Extensão), EVA_CODE_RETURNED (Extensão -> IDE).
 */
console.log("EVA Bridge v3.0 Service Worker Ativo");

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

const GEMINI_URL_PATTERNS = ["https://gemini.google.com/*", "https://www.gemini.google.com/*"];

async function getGeminiTabId() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.GEMINI_TAB_ID);
  return out[STORAGE_KEYS.GEMINI_TAB_ID];
}

function setGeminiTabId(tabId) {
  return chrome.storage.local.set({ [STORAGE_KEYS.GEMINI_TAB_ID]: tabId });
}

/**
 * Encontra uma aba válida do Gemini: valida o ID armazenado ou busca via query.
 * Mais robusto contra storage limpo, extensão reiniciada ou aba fechada/reaberta.
 */
async function findValidGeminiTab() {
  const stored = await getGeminiTabId();
  if (stored) {
    try {
      const tab = await chrome.tabs.get(stored);
      if (tab?.url && (tab.url.includes("gemini.google.com"))) return tab.id;
    } catch (_) {}
  }
  const tabs = await chrome.tabs.query({ url: GEMINI_URL_PATTERNS });
  if (tabs.length > 0) {
    const tabId = tabs[0].id;
    await setGeminiTabId(tabId);
    console.log("[EVA Bridge] Aba do Gemini descoberta via query:", tabId);
    return tabId;
  }
  return null;
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
    (async () => {
      const tabIdToUse = await findValidGeminiTab();
      if (!tabIdToUse) {
        console.warn("[EVA Bridge] Nenhuma aba do Gemini encontrada.");
        sendCodeReturnedToIde({ error: "Abra o Google Gemini (gemini.google.com) em uma aba primeiro." });
        sendResponse({ ok: false });
        return;
      }
      const prompt = payload?.prompt ?? "";
      const trySend = async (tabId) => {
        return chrome.tabs.sendMessage(tabId, { type: "EVA_PROMPT_INJECT", payload: { prompt } });
      };
      const isReceivingEndError = (err) => {
        const msg = (err?.message || "").toLowerCase();
        return (
          msg.includes("receiving end") ||
          msg.includes("could not establish connection") ||
          msg.includes("não foi possível estabelecer")
        );
      };
      const tryInjectAndSend = async (tabId) => {
        try {
          await trySend(tabId);
          return true;
        } catch (err) {
          if (!isReceivingEndError(err)) throw err;
          console.log("[EVA Bridge] Content script ausente, injetando programaticamente...");
          const injectTargets = [{ tabId }, { tabId, allFrames: true }];
          for (let i = 0; i < injectTargets.length; i++) {
            const target = injectTargets[i];
            try {
              await chrome.scripting.executeScript({
                target,
                files: ["content-gemini.js"],
              });
              for (const delayMs of [600, 1200, 2200]) {
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
      try {
        const ok = await tryInjectAndSend(tabIdToUse);
        if (ok) {
          console.log("[EVA Bridge] EVA_PROMPT_INJECT enviado ao Gemini.");
          sendResponse({ ok: true });
        } else {
          sendCodeReturnedToIde({
            error:
              "Content script não disponível na aba do Gemini. Recarregue a aba (F5) em gemini.google.com e tente novamente.",
          });
          sendResponse({ ok: false });
        }
      } catch (err) {
        console.warn("[EVA Bridge] Falha ao enviar ao Gemini:", err?.message || err);
        const retryTabId = await findValidGeminiTab();
        if (retryTabId && retryTabId !== tabIdToUse) {
          try {
            const ok = await tryInjectAndSend(retryTabId);
            if (ok) {
              console.log("[EVA Bridge] EVA_PROMPT_INJECT enviado ao Gemini (retry).");
              sendResponse({ ok: true });
              return;
            }
          } catch (_) {}
        }
        sendCodeReturnedToIde({
          error: "Aba do Gemini fechada ou indisponível. Recarregue a aba do Gemini (F5) e tente novamente.",
        });
        sendResponse({ ok: false });
      }
    })();
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

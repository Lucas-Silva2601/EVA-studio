/**
 * EVA Studio Bridge - Content Script (Página da IDE)
 * Executa em http://localhost:3000/* e http://127.0.0.1:3000/*
 *
 * FUNCIONALIDADE:
 * - Registra esta aba como "aba da IDE" no background
 * - Escuta window.postMessage da aplicação Next.js (EVA_PROMPT_SEND)
 * - Encaminha ao background para rotear ao AI Studio
 * - Recebe EVA_CODE_RETURNED ou erro do background e repassa à página via postMessage
 * - Fallback de conexão: erros (aba fechada, extensão não instalada) chegam como EVA_CODE_RETURNED com payload.error
 *
 * PROTOCOLO IDE <-> PÁGINA (window.postMessage):
 *
 * Página -> Extensão (enviar prompt):
 *   window.postMessage({
 *     type: 'EVA_STUDIO_FROM_PAGE',
 *     payload: { type: 'EVA_PROMPT_SEND', prompt: string }
 *   }, '*');
 *
 * Extensão -> Página (código capturado ou erro):
 *   window.postMessage({
 *     type: 'EVA_STUDIO_TO_PAGE',
 *     payload: { type: 'EVA_CODE_RETURNED', payload: { files?, code?, filename?, language?, error? } }
 *   }, origin);
 *
 * chrome.runtime.onMessage: respostas são síncronas (EVA_CODE_RETURNED é repassado e sendResponse chamado na hora),
 * portanto retornamos false. Para handlers assíncronos seria obrigatório return true e chamar sendResponse depois.
 */

(function () {
  "use strict";

  const SOURCE = "eva-content-ide";

  function sendToBackground(type, payload) {
    chrome.runtime.sendMessage({ source: SOURCE, type, payload }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[CONTENT-IDE] chrome.runtime.lastError ao enviar ao background.", chrome.runtime.lastError.message);
        notifyPage("EVA_CODE_RETURNED", { error: "Extensão não disponível. Verifique se a EVA Studio Bridge está instalada." });
      }
    });
  }

  function notifyPage(type, payload) {
    try {
      window.postMessage(
        { type: "EVA_STUDIO_TO_PAGE", payload: { type: type, payload: payload } },
        window.location.origin
      );
    } catch (e) {}
  }

  // Handshake: apresentar a extensão à IDE assim que o script for injetado
  try {
    window.postMessage({ type: "EVA_EXTENSION_CONNECTED" }, "*");
    console.log("[CONTENT-IDE] Script injetado; EVA_EXTENSION_CONNECTED enviado à página.");
  } catch (e) {
    console.warn("[CONTENT-IDE] Falha ao enviar EVA_EXTENSION_CONNECTED.", e);
  }

  function registerIdeTab() {
    sendToBackground("REGISTER_IDE_TAB", {});
  }
  registerIdeTab();
  console.log("[CONTENT-IDE] Aba da IDE registrada no background.");
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") registerIdeTab();
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    const data = event.data;
    if (data.type !== "EVA_STUDIO_FROM_PAGE" || !data.payload) return;

    const { type, prompt } = data.payload;

    if (type === "EVA_PING") {
      console.log("[CONTENT-IDE] Recebi EVA_PING, respondendo EVA_PONG.");
      notifyPage("EVA_PONG", {});
      return;
    }

    if (type === "EVA_PROMPT_SEND") {
      console.log("[CONTENT-IDE] Recebi postMessage, repassando para background. promptLength:", (prompt ?? "").length);
      sendToBackground("EVA_PROMPT_SEND", { prompt: prompt ?? "" });
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "EVA_CODE_RETURNED") {
      console.log("[CONTENT-IDE] Recebi EVA_CODE_RETURNED do background, repassando à página.", message.payload?.error ? { error: message.payload.error } : "ok");
      notifyPage("EVA_CODE_RETURNED", message.payload ?? {});
      sendResponse({ ok: true });
    }
    return false;
  });
})();

/**
 * EVA Studio Bridge - Content Script (Google AI Studio)
 * Executa em https://aistudio.google.com/*
 *
 * FUNCIONALIDADE:
 * - Registra esta aba como "aba do AI Studio" no background
 * - Recebe prompt do background, insere no input e simula envio
 * - Observa a resposta; quando terminar, extrai blocos de código (pre/code)
 * - Envia EVA_CODE_CAPTURED ao background (código final) ou EVA_ERROR em falha
 *
 * Automação de Interface (DOM Bot): seletores dinâmicos – atualize se o AI Studio mudar.
 * Sincronização de Resposta: debounce após última mutação para streaming terminar.
 * Higienização de Markdown: apenas conteúdo de <pre><code>; texto puro é ignorado.
 *
 * SELETORES (podem mudar com atualizações do AI Studio – inspecione a página):
 * - Input do chat: textarea, contenteditable ou input[type="text"]
 *   Ex.: textarea, [contenteditable="true"], [data-placeholder*="Type"]
 * - Botão de envio: button que envia a mensagem
 *   Ex.: button[type="submit"], button[aria-label*="Send"], [data-testid="send"]
 * - Área de resposta: containers da resposta do modelo
 *   Ex.: pre, code, .markdown pre, [data-message-type="model"]
 */

(function () {
  "use strict";

  const SOURCE = "eva-content-ai-studio";

  function sendToBackground(type, payload) {
    chrome.runtime.sendMessage({ source: SOURCE, type, payload }).catch(() => {});
  }

  // Registrar esta aba como AI Studio
  console.log("[CONTENT-AI] Script injetado no AI Studio; registrando aba.");
  sendToBackground("REGISTER_AI_STUDIO_TAB", {});

  /**
   * Encontra o input do chat (textarea, contenteditable ou input).
   * Atualize os seletores conforme a página do AI Studio.
   */
  function findInput() {
    const selectors = [
      'textarea[placeholder*="Type"]',
      'textarea[placeholder*="Message"]',
      'textarea[aria-label*="message"]',
      "[contenteditable='true'][role='textbox']",
      "textarea",
      'input[type="text"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  /**
   * Encontra o botão de envio.
   */
  function findSendButton() {
    const selectors = [
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Enviar"]',
      '[data-testid="send-button"]',
      'button[data-icon="send"]',
      'form button[type="submit"]',
      'button:has(svg)',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && !el.disabled) return el;
    }
    // Fallback: último botão visível em um form ou toolbar
    const form = document.querySelector("form");
    if (form) {
      const btn = form.querySelector("button:not([disabled])");
      if (btn) return btn;
    }
    return null;
  }

  /**
   * Insere texto no input (textarea ou contenteditable).
   */
  function setInputValue(input, text) {
    if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
      input.focus();
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (input.isContentEditable) {
      input.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
    }
  }

  /**
   * Simula o envio (clique no botão ou submit do form).
   */
  function submitPrompt() {
    const btn = findSendButton();
    if (btn) {
      btn.click();
      return true;
    }
    const form = document.querySelector("form");
    if (form) {
      form.requestSubmit();
      return true;
    }
    return false;
  }

  /**
   * Fase 10: Extrai nome de arquivo da primeira linha (// filename: X, # filename: X, <!-- filename: X -->).
   */
  function parseFilenameFromFirstLine(code) {
    const first = (code || "").split("\n")[0] || "";
    const match = first.match(/^\s*(\/\/|#|<!--)\s*filename\s*:\s*([^\s\n]+)(?:\s*-->)?/i);
    return match ? match[2].trim() : null;
  }

  function stripFilenameLine(code) {
    const lines = (code || "").split("\n");
    if (lines.length > 0 && /^\s*(\/\/|#|<!--)\s*filename\s*:\s*/i.test(lines[0])) {
      return lines.slice(1).join("\n").trimStart();
    }
    return code || "";
  }

  function langToExt(lang) {
    const map = { js: "js", javascript: "js", jsx: "jsx", ts: "ts", typescript: "ts", tsx: "tsx", py: "py", python: "py", html: "html", css: "css", json: "json", md: "md" };
    return map[(lang || "").toLowerCase()] || "txt";
  }

  /**
   * Converte blocos em files (name + content) para payload CODE_RESPONSE (Fase 10).
   */
  function blocksToFiles(blocks) {
    return blocks.map(function (block, i) {
      const nameFromLine = parseFilenameFromFirstLine(block.code);
      const name = nameFromLine || "file_" + i + "." + langToExt(block.language);
      const content = nameFromLine ? stripFilenameLine(block.code) : block.code.trim();
      return { name: name, content: content };
    });
  }

  /**
   * Extrai blocos de código da página (pre, code dentro de pre).
   */
  function extractCodeBlocks() {
    const blocks = [];
    const pres = document.querySelectorAll("pre");
    pres.forEach((pre) => {
      const code = pre.querySelector("code");
      const text = code ? code.textContent : pre.textContent;
      if (text && text.trim()) {
        const lang = code?.className?.match(/language-(\w+)/)?.[1] || "";
        blocks.push({ code: text.trim(), language: lang || undefined });
      }
    });
    if (blocks.length === 0) {
      const codes = document.querySelectorAll("code");
      codes.forEach((code) => {
        const text = code.textContent?.trim();
        if (text && text.length > 20) blocks.push({ code: text, language: undefined });
      });
    }
    return blocks;
  }

  /** Sincronização de Resposta: debounce (ms) após última mutação para considerar streaming encerrado. */
  const STREAMING_DEBOUNCE_MS = 2500;
  const CAPTURE_TIMEOUT_MS = 120000;

  /**
   * MutationObserver + debounce: espera o streaming da IA terminar antes de capturar.
   * Garante que apenas o conteúdo final (blocos <pre><code>) seja extraído.
   */
  function waitForResponseAndExtractCode() {
    return new Promise((resolve) => {
      let debounceTimer = null;
      let timeoutId = null;
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const blocks = extractCodeBlocks();
          if (blocks.length > 0) {
            clearTimeout(timeoutId);
            observer.disconnect();
            resolve(blocks);
          }
        }, STREAMING_DEBOUNCE_MS);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true,
      });

      timeoutId = setTimeout(() => {
        observer.disconnect();
        clearTimeout(debounceTimer);
        resolve(extractCodeBlocks());
      }, CAPTURE_TIMEOUT_MS);
    });
  }

  /**
   * Fluxo: inserir prompt, enviar, aguardar resposta, extrair código, enviar ao background.
   */
  async function handleSendPrompt(payload) {
    const prompt = payload?.prompt ?? "";
    console.log("[CONTENT-AI] Recebi comando, injetando no Google. promptLength:", prompt.length);
    if (!prompt.trim()) {
      sendToBackground("EVA_ERROR", { message: "Prompt vazio." });
      return;
    }

    const input = findInput();
    if (!input) {
      console.warn("[CONTENT-AI] Caixa de texto do chat não encontrada.");
      sendToBackground("EVA_ERROR", { message: "Caixa de texto do chat não encontrada. Atualize os seletores (Automação de Interface) em content-ai-studio.js." });
      return;
    }

    setInputValue(input, prompt);
    await new Promise((r) => setTimeout(r, 300));

    if (!submitPrompt()) {
      console.warn("[CONTENT-AI] Botão de envio não encontrado.");
      sendToBackground("ERROR", { message: "Botão de envio não encontrado. Atualize os seletores." });
      return;
    }

    try {
      const blocks = await waitForResponseAndExtractCode();
      console.log("[CONTENT-AI] Código extraído, blocos:", blocks.length);
      if (blocks.length === 0) {
        sendToBackground("EVA_CODE_CAPTURED", { code: "", language: undefined, filename: undefined, files: [] });
      } else {
        const files = blocksToFiles(blocks);
        if (files.length === 1) {
          sendToBackground("EVA_CODE_CAPTURED", {
            code: files[0].content,
            language: blocks[0].language,
            filename: files[0].name,
            files: files,
          });
        } else {
          sendToBackground("EVA_CODE_CAPTURED", { files: files, blocks: blocks });
        }
      }
    } catch (e) {
      console.warn("[CONTENT-AI] Erro ao extrair código.", e?.message || e);
      sendToBackground("EVA_ERROR", { message: e?.message ?? "Erro ao extrair código." });
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "EVA_PROMPT_INJECT") {
      handleSendPrompt(message.payload).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true; // async response
    }
    return false;
  });
})();

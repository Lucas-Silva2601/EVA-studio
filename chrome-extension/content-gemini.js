/**
 * EVA Studio Bridge v2.0 - Content Script (Google Gemini)
 * Executa em https://gemini.google.com/*
 *
 * FUNCIONALIDADE:
 * - Registra esta aba como "aba do Gemini" no background
 * - Recebe prompt do background (EVA_PROMPT_INJECT), insere no input e envia
 * - MutationObserver avançado: captura resposta apenas quando ícone "Stop" some ou botão "Share" aparece
 * - Extrai blocos de código e FILE: path/filename; envia EVA_CODE_CAPTURED ao background
 *
 * Protocolo: EVA_PROMPT_SEND (IDE -> Extensão), EVA_CODE_RETURNED (Extensão -> IDE).
 * Seletores: atualize conforme mudanças no DOM do Gemini (inspecione a página).
 */
(function () {
  "use strict";

  const SOURCE = "eva-content-gemini";

  function sendToBackground(type, payload) {
    chrome.runtime.sendMessage({ source: SOURCE, type, payload }).catch(() => {});
  }

  console.log("[EVA-Gemini] Script injetado; registrando aba.");
  sendToBackground("REGISTER_GEMINI_TAB", {});

  /**
   * Encontra a caixa de prompt do Gemini (textarea, contenteditable ou role="combobox").
   */
  function findPromptInput() {
    const selectors = [
      '[role="combobox"]',
      'textarea[placeholder*="Enter"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Type"]',
      'textarea[aria-label*="prompt"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
      "textarea",
      'input[type="text"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && (el.offsetWidth > 0 || el.offsetHeight > 0)) return el;
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
      'button[data-icon="send"]',
      '[data-testid="send-button"]',
      'form button[type="submit"]',
      'button[aria-label*="Submit"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && !el.disabled) return el;
    }
    const form = document.querySelector("form");
    if (form) {
      const btn = form.querySelector("button:not([disabled])");
      if (btn) return btn;
    }
    return null;
  }

  /**
   * Detecta se o ícone/botão "Stop" está visível (resposta em streaming).
   */
  function isStopVisible() {
    const stopSelectors = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="Parar"]',
      '[data-icon="stop"]',
      'button:has(svg[aria-label*="Stop"])',
      '[title*="Stop"]',
    ];
    for (const sel of stopSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return true;
    }
    return false;
  }

  /**
   * Detecta se o botão "Share" está visível (resposta finalizada).
   */
  function isShareVisible() {
    const shareSelectors = [
      'button[aria-label*="Share"]',
      'button[aria-label*="Compartilhar"]',
      '[data-icon="share"]',
      '[title*="Share"]',
    ];
    for (const sel of shareSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return true;
    }
    return false;
  }

  function setInputValue(input, text) {
    if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
      input.focus();
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (input.isContentEditable) {
      input.focus();
      try {
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, text);
      } catch (e) {
        input.textContent = text;
        input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
      }
    }
  }

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
   * Extrai path da primeira linha (FILE: path/filename ou // FILE: path).
   */
  function parseFileFromFirstLine(code) {
    const first = (code || "").split("\n")[0] || "";
    const match = first.match(/(?:FILE|filename)\s*:\s*([^\s\n]+)/i);
    return match ? match[1].trim() : null;
  }

  function stripFileLine(code) {
    const lines = (code || "").split("\n");
    if (lines.length > 0 && /(?:FILE|filename)\s*:\s*/i.test(lines[0])) {
      return lines.slice(1).join("\n").trimStart();
    }
    return code || "";
  }

  function langToExt(lang) {
    const map = { js: "js", javascript: "js", jsx: "jsx", ts: "ts", typescript: "ts", tsx: "tsx", py: "py", python: "py", html: "html", css: "css", json: "json", md: "md" };
    return map[(lang || "").toLowerCase()] || "txt";
  }

  /**
   * Converte blocos extraídos em files (name = path, content).
   */
  function blocksToFiles(blocks) {
    return blocks.map(function (block, i) {
      const pathFromLine = parseFileFromFirstLine(block.code);
      const name = pathFromLine || "file_" + i + "." + langToExt(block.language);
      const content = pathFromLine ? stripFileLine(block.code) : block.code.trim();
      return { name, content };
    });
  }

  /**
   * Extrai blocos de código da página (pre/code).
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
      document.querySelectorAll("code").forEach((code) => {
        const text = code.textContent?.trim();
        if (text && text.length > 20) blocks.push({ code: text, language: undefined });
      });
    }
    return blocks;
  }

  const DEBOUNCE_MS = 1500;
  const CAPTURE_TIMEOUT_MS = 120000;

  /**
   * Aguarda: Stop sumir OU Share aparecer; então extrai código (debounce após última mutação).
   */
  function waitForResponseComplete() {
    return new Promise((resolve) => {
      let debounceTimer = null;
      let timeoutId = null;

      function checkAndCapture() {
        if (isStopVisible()) return;
        if (!isShareVisible()) {
          const blocks = extractCodeBlocks();
          if (blocks.length > 0) {
            clearTimeout(timeoutId);
            resolve(blocks);
            return;
          }
        }
        if (isShareVisible()) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            const blocks = extractCodeBlocks();
            clearTimeout(timeoutId);
            resolve(blocks);
          }, DEBOUNCE_MS);
        }
      }

      const observer = new MutationObserver(() => {
        checkAndCapture();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true,
      });

      const interval = setInterval(checkAndCapture, 800);
      timeoutId = setTimeout(() => {
        observer.disconnect();
        clearInterval(interval);
        clearTimeout(debounceTimer);
        resolve(extractCodeBlocks());
      }, CAPTURE_TIMEOUT_MS);
    });
  }

  async function handleSendPrompt(payload) {
    const prompt = payload?.prompt ?? "";
    if (!prompt.trim()) {
      sendToBackground("EVA_ERROR", { message: "Prompt vazio." });
      return;
    }

    const input = findPromptInput();
    if (!input) {
      sendToBackground("EVA_ERROR", { message: "Caixa de prompt do Gemini não encontrada. Atualize os seletores em content-gemini.js." });
      return;
    }

    setInputValue(input, prompt);
    await new Promise((r) => setTimeout(r, 400));

    if (!submitPrompt()) {
      sendToBackground("EVA_ERROR", { message: "Botão de envio não encontrado." });
      return;
    }

    try {
      const blocks = await waitForResponseComplete();
      if (blocks.length === 0) {
        sendToBackground("EVA_CODE_CAPTURED", { code: "", files: [] });
      } else {
        const files = blocksToFiles(blocks);
        if (files.length === 1) {
          sendToBackground("EVA_CODE_CAPTURED", {
            code: files[0].content,
            filename: files[0].name,
            files,
          });
        } else {
          sendToBackground("EVA_CODE_CAPTURED", { files });
        }
      }
    } catch (e) {
      sendToBackground("EVA_ERROR", { message: e?.message ?? "Erro ao extrair código." });
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "EVA_PROMPT_INJECT") {
      handleSendPrompt(message.payload).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    return false;
  });
})();

/**
 * EVA Studio Bridge v3.0 - Content Script (Google Gemini)
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

  function registerTab() {
    sendToBackground("REGISTER_GEMINI_TAB", {});
  }

  console.log("[EVA-Gemini] Script injetado; registrando aba.");
  registerTab();

  /* Re-registro periódico e ao voltar à aba — evita tab ID obsoleto (storage limpo, extensão reiniciada). */
  const REGISTER_INTERVAL_MS = 45000;
  const registerInterval = setInterval(registerTab, REGISTER_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") registerTab();
  });

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

  /**
   * Busca FILE: em todo o bloco (primeiras 10 linhas) — o Gemini pode colocar em qualquer linha inicial.
   */
  function parseFileFromContent(code) {
    const lines = (code || "").split("\n");
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const match = (lines[i] || "").match(/(?:FILE|filename)\s*:\s*([a-zA-Z0-9._\-/]+)/i);
      if (match) return match[1].trim();
    }
    return null;
  }

  /**
   * Infere nome de arquivo com extensão correta a partir do conteúdo (evita file_0.txt).
   * HTML → index.html; Markdown → checklist.md; etc.
   */
  function inferFilenameFromContent(code) {
    const trimmed = (code || "").trim();
    if (!trimmed) return null;
    const first = trimmed.slice(0, 400).toLowerCase();
    if (first.includes("<!doctype") || first.startsWith("<html") || first.startsWith("<!DOCTYPE")) {
      return "index.html";
    }
    const hasBracesAndColon = first.includes("{") && first.includes(":");
    const hasCssHint = first.includes("<style") || first.includes("px") || first.includes("em") || first.includes("rem") ||
      /\d\s*%/.test(first) || first.includes("color:") || first.includes("margin:") || first.includes("padding:") ||
      first.includes("font-size:") || first.includes("width:") || first.includes("height:") ||
      first.includes("background") || first.includes("border:") || first.includes("display:");
    const hasJsHint = first.includes("function ") || first.includes("=>") || first.includes("const ") || first.includes("export ");
    if (hasCssHint && (first.includes("<style") || (hasBracesAndColon && !hasJsHint))) return "style.css";
    if (first.includes("import react") || first.includes('from "react"') || first.includes("from 'react'")) {
      return "App.jsx";
    }
    if (first.includes("function ") || (first.includes("const ") && first.includes("=>")) || first.includes("export ")) {
      return "script.js";
    }
    if (first.includes("def ") || (first.includes("import ") && !first.includes("react"))) {
      return "script.py";
    }
    if (first.startsWith("{") || first.startsWith("[")) return "data.json";
    if (first.startsWith("# ") || first.includes("## ") || first.includes("- [ ]") || first.includes("- [x]")) {
      return "checklist.md";
    }
    return null;
  }

  function stripFileLine(code) {
    const lines = (code || "").split("\n");
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      if (/(?:FILE|filename)\s*:\s*/i.test(lines[i] || "")) {
        return lines.slice(i + 1).join("\n").trimStart();
      }
    }
    return code || "";
  }

  function langToExt(lang) {
    const map = { js: "js", javascript: "js", jsx: "jsx", ts: "ts", typescript: "ts", tsx: "tsx", py: "py", python: "py", html: "html", css: "css", json: "json", md: "md" };
    return map[(lang || "").toLowerCase()] || "";
  }

  /**
   * Converte blocos extraídos em files (name = path, content).
   * Prioridade: FILE: na primeira linha → FILE: em qualquer linha inicial → inferência do conteúdo → language class → file_N.ext (evita .txt genérico).
   */
  function blocksToFiles(blocks) {
    return blocks.map(function (block, i) {
      const pathFromFirstLine = parseFileFromFirstLine(block.code);
      const pathFromContent = pathFromFirstLine || parseFileFromContent(block.code);
      const inferred = inferFilenameFromContent(block.code);
      const ext = langToExt(block.language);
      const name = pathFromContent || inferred || (ext ? "file_" + i + "." + ext : "file_" + i + ".txt");
      const content = pathFromContent ? stripFileLine(block.code) : block.code.trim();
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

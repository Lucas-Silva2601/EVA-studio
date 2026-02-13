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
  let contextInvalidated = false;
  let registerInterval = null;

  function isContextInvalidatedError(err) {
    const msg = (err && err.message) ? String(err.message) : "";
    return /context invalidated|Extension context invalidated/i.test(msg);
  }

  function showReloadBanner() {
    if (document.getElementById("eva-studio-invalidated-banner")) return;
    const banner = document.createElement("div");
    banner.id = "eva-studio-invalidated-banner";
    banner.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;background:#1a1a2e;color:#ff6b6b;padding:10px 14px;border-radius:8px;font-family:system-ui,sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.4);max-width:320px;";
    banner.textContent = "EVA Studio Bridge: a extensão foi atualizada. Recarregue esta página (F5) para reconectar.";
    document.body.appendChild(banner);
  }

  function handleContextInvalidated() {
    if (contextInvalidated) return;
    contextInvalidated = true;
    if (registerInterval) clearInterval(registerInterval);
    registerInterval = null;
    console.warn("[EVA-Gemini] Contexto da extensão invalidado. Recarregue a página do Gemini (F5) para reconectar.");
    showReloadBanner();
  }

  function sendToBackground(type, payload) {
    if (contextInvalidated) return;
    try {
      chrome.runtime.sendMessage({ source: SOURCE, type, payload }).catch(function (err) {
        if (isContextInvalidatedError(err)) handleContextInvalidated();
      });
    } catch (e) {
      if (isContextInvalidatedError(e)) handleContextInvalidated();
    }
  }

  function registerTab() {
    sendToBackground("REGISTER_GEMINI_TAB", {});
  }

  console.log("[EVA-Gemini] Script injetado; registrando aba.");
  registerTab();

  /* Re-registro periódico e ao voltar à aba — evita tab ID obsoleto (storage limpo, extensão reiniciada). */
  const REGISTER_INTERVAL_MS = 45000;
  registerInterval = setInterval(registerTab, REGISTER_INTERVAL_MS);
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
    if (first.includes("getelementbyid") || first.includes("getcontext") || first.includes("queryselector") || first.includes("addeventlistener") || (first.includes("canvas") && first.includes("."))) {
      return "script.js";
    }
    if (first.includes("setinterval") || first.includes("requestanimationframe") || first.includes("addEventListener")) {
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

  /** Mínimo de caracteres para considerar conteúdo como arquivo (evita comandos soltos). */
  const MIN_FILE_CONTENT_LENGTH = 60;
  /** Uma única linha com menos que isso é tratada como snippet/comando (a menos que tenha FILE:). */
  const MIN_SINGLE_LINE_LENGTH = 100;
  /** Padrão: linha que parece comando de shell/terminal (não é código de arquivo). */
  const SINGLE_LINE_COMMAND_REGEX = /^(npm |yarn |pnpm |cd |echo |git |python |node |\.\/|npx |curl |wget |mkdir |cp |mv |cat |ls |chmod |exit |clear |deno |bun )\s*/i;

  /**
   * Retorna true se o conteúdo deve ser ignorado (comando solto, snippet de uma linha, etc.).
   * Blocos com FILE: docs/fase são sempre aceitos (plano em fases).
   */
  function isSnippetOrCommand(content) {
    const trimmed = (content || "").trim();
    if (/^FILE:\s*docs[\\/]fase-/im.test(trimmed) || /^FILE:\s*fase-\d+\.md/im.test(trimmed)) return false;
    if (trimmed.length < MIN_FILE_CONTENT_LENGTH) return true;
    const lines = trimmed.split(/\r?\n/).filter(function (l) { return l.trim().length > 0; });
    if (lines.length === 1) {
      if (trimmed.length < MIN_SINGLE_LINE_LENGTH) return true;
      if (SINGLE_LINE_COMMAND_REGEX.test(trimmed)) return true;
    }
    return false;
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
   * Extrai blocos de código da página. Múltiplas estratégias para compatibilidade com mudanças na UI do Gemini.
   */
  function extractCodeBlocks() {
    const blocks = [];
    const seen = new Set();

    function addBlock(code, language) {
      const key = (code || "").trim().slice(0, 80);
      if (!key || seen.has(key)) return;
      seen.add(key);
      blocks.push({ code: (code || "").trim(), language: language || undefined });
    }

    document.querySelectorAll("pre").forEach((pre) => {
      const code = pre.querySelector("code");
      const text = code ? code.textContent : pre.textContent;
      if (text && text.trim().length > 10) {
        const lang = (code && code.className && code.className.match(/language-(\w+)/)) ? code.className.match(/language-(\w+)/)[1] : "";
        addBlock(text, lang);
      }
    });

    if (blocks.length === 0) {
      document.querySelectorAll("code").forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 20) addBlock(text, undefined);
      });
    }

    if (blocks.length === 0) {
      document.querySelectorAll('[class*="code-block"], [class*="markdown"], [data-code-block]').forEach((el) => {
        const pre = el.querySelector("pre") || el;
        const text = (pre.textContent || el.textContent || "").trim();
        if (text.length > 20) addBlock(text, undefined);
      });
    }

    if (blocks.length === 0) {
      const allPre = document.querySelectorAll("pre");
      allPre.forEach((pre) => {
        const text = (pre.textContent || "").trim();
        if (text.length > 20) addBlock(text, undefined);
      });
    }

    if (blocks.length === 0) {
      const textNodes = document.querySelectorAll("[class*='message'], [class*='response'], [class*='content']");
      textNodes.forEach((el) => {
        const raw = (el.textContent || "").trim();
        const match = raw.match(/```[\w]*\n([\s\S]*?)```/g);
        if (match) {
          match.forEach((m) => {
            const inner = m.replace(/^```[\w]*\n/, "").replace(/```$/, "").trim();
            if (inner.length > 20) addBlock(inner, undefined);
          });
        }
      });
    }

    /* Fallback: resposta em markdown renderizado sem <pre>/<code> — procurar FILE: docs/fase ou FILE: fase-N.md no texto. */
    if (blocks.length === 0) {
      const root = document.querySelector("main") || document.querySelector("[role='main']") || document.body;
      const raw = (root && root.textContent) ? root.textContent : document.body.textContent || "";
      const fileMarker = /FILE:\s*(docs[\\/])?fase-\d+\.md/gi;
      const parts = raw.split(/(?=FILE:\s*(?:docs[\\/])?fase-\d+\.md)/i);
      parts.forEach(function (part) {
        const trimmed = part.trim();
        if (!trimmed || trimmed.length < 15) return;
        const firstLine = trimmed.split(/\r?\n/)[0] || "";
        if (!/FILE:\s*(docs[\\/])?fase-\d+\.md/i.test(firstLine)) return;
        addBlock(trimmed, "markdown");
      });
    }

    return blocks;
  }

  const DEBOUNCE_AFTER_STOP_MS = 350;
  const DEBOUNCE_AFTER_SHARE_MS = 250;
  const CAPTURE_TIMEOUT_MS = 90000;
  const POLL_INTERVAL_MS = 200;

  /**
   * Aguarda fim da resposta: Stop sumir (streaming acabou) OU Share aparecer.
   * Otimizado: poll mais rápido, debounce mínimo, e retry ativo quando Stop já sumiu mas blocos ainda não apareceram no DOM.
   */
  function waitForResponseComplete() {
    return new Promise((resolve) => {
      let debounceTimer = null;
      let timeoutId = null;
      let lastStopVisible = false;
      let resolved = false;
      let observerRef = null;
      let intervalRef = null;

      function captureAndResolve() {
        if (resolved) return;
        resolved = true;
        if (observerRef) observerRef.disconnect();
        if (intervalRef) clearInterval(intervalRef);
        clearTimeout(timeoutId);
        if (debounceTimer) clearTimeout(debounceTimer);
        const blocks = extractCodeBlocks();
        console.log("[EVA-Gemini] Captura concluída: " + blocks.length + " bloco(s) de código.");
        resolve(blocks);
      }

      function scheduleCapture(delayMs) {
        if (resolved) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(captureAndResolve, delayMs);
      }

      function checkAndCapture() {
        if (resolved) return;
        const stopNow = isStopVisible();
        const shareNow = isShareVisible();

        if (stopNow) {
          lastStopVisible = true;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = null;
          return;
        }

        if (shareNow) {
          scheduleCapture(DEBOUNCE_AFTER_SHARE_MS);
          return;
        }

        if (lastStopVisible) {
          const blocks = extractCodeBlocks();
          if (blocks.length > 0) scheduleCapture(DEBOUNCE_AFTER_STOP_MS);
        }
      }

      observerRef = new MutationObserver(() => {
        checkAndCapture();
      });

      observerRef.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true,
      });

      intervalRef = setInterval(checkAndCapture, POLL_INTERVAL_MS);
      timeoutId = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        if (observerRef) observerRef.disconnect();
        if (intervalRef) clearInterval(intervalRef);
        if (debounceTimer) clearTimeout(debounceTimer);
        console.log("[EVA-Gemini] Timeout de captura; extraindo o que houver.");
        resolve(extractCodeBlocks());
      }, CAPTURE_TIMEOUT_MS);
    });
  }

  /**
   * Envia o prompt ao Gemini. Valida payload.prompt como string.
   * Limite de tamanho do prompt: não aplicado aqui; a UI do Gemini pode impor limite próprio.
   */
  async function handleSendPrompt(payload) {
    const raw = payload != null && typeof payload === "object" ? payload.prompt : undefined;
    const prompt = typeof raw === "string" ? raw : "";
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
        console.warn("[EVA-Gemini] Nenhum bloco de código encontrado na página. Enviando resposta vazia à IDE.");
        sendToBackground("EVA_CODE_CAPTURED", { code: "", files: [] });
      } else {
        const allFiles = blocksToFiles(blocks);
        const files = allFiles.filter(function (f) { return !isSnippetOrCommand(f.content); });
        if (files.length === 0) {
          console.warn("[EVA-Gemini] Blocos extraídos foram filtrados (snippet/comando). Enviando resposta vazia.");
          sendToBackground("EVA_CODE_CAPTURED", { code: "", files: [] });
        } else {
          console.log("[EVA-Gemini] Enviando " + files.length + " arquivo(s) à IDE: " + files.map(function (f) { return f.name; }).join(", "));
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
      }
    } catch (e) {
      console.error("[EVA-Gemini] Erro ao capturar código:", e);
      sendToBackground("EVA_ERROR", { message: e?.message ?? "Erro ao extrair código." });
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (contextInvalidated) return false;
    if (message.type !== "EVA_PROMPT_INJECT") return false;
    function safeSendResponse(value) {
      if (contextInvalidated) return;
      try {
        sendResponse(value);
      } catch (e) {
        if (isContextInvalidatedError(e)) handleContextInvalidated();
      }
    }
    handleSendPrompt(message.payload)
      .then(() => safeSendResponse({ ok: true }))
      .catch(() => safeSendResponse({ ok: false }));
    return true;
  });
})();

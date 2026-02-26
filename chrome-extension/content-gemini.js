/**
 * EVA Studio Bridge v3.2 - Content Script (Google Gemini)
 * Executa em https://gemini.google.com/*
 *
 * MELHORIAS v3.2:
 * - Deduplicação robusta: hash do conteúdo completo
 * - Captura do CONTEXTO PRÉ-BLOCO do DOM para detectar nomes de arquivo
 * - inferFilenameFromContent expandida: TypeScript, TSX, YAML, SQL, etc.
 * - langToExt expandida para 20+ formatos
 * - Suporte a @ em paths (TypeScript aliases)
 */
(function () {
  "use strict";

  const SOURCE = "eva-content-gemini";
  let contextInvalidated = false;
  let registerInterval = null;

  /** Seletores do DOM do Gemini (gemini.google.com). Atualize se a UI mudar. */
  const GEMINI_SELECTORS = {
    prompt: [
      'div[contenteditable="true"]',
      '.ql-editor',
      'textarea[placeholder*="Enter a prompt"]',
      'textarea[aria-label*="Prompts"]',
      '[role="textbox"]',
      '.rich-textarea'
    ],
    sendButton: [
      'button[aria-label*="Send"]',
      'button[aria-label*="Enviar"]',
      'button[data-test-id="send-button"]',
      '.send-button',
      'button.submit-button',
      'button[aria-label="Send query"]'
    ],
    stop: [
      '[aria-label*="Stop"]',
      '[aria-label*="Parar"]',
      'button[aria-label*="Stop response"]',
      '.stop-button',
      'button:has(mat-icon[data-mat-icon-name="stop"])',
      'button:has(svg path[d*="M6 6h12v12H6z"])' // Generic stop icon path often used
    ]
  };

  function isContextInvalidatedError(err) {
    const msg = (err && err.message) ? String(err.message) : "";
    return /context invalidated|Extension context invalidated/i.test(msg);
  }

  function showReloadBanner() {
    if (document.getElementById("eva-studio-invalidated-banner")) return;
    const banner = document.createElement("div");
    banner.id = "eva-studio-invalidated-banner";
    banner.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;background:#1a1a2e;color:#ff6b6b;padding:10px 14px;border-radius:8px;font-family:system-ui,sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.4);max-width:320px;";
    banner.textContent = "EVA Studio Bridge: extensão atualizada. Recarregue esta página (F5) para reconectar.";
    document.body.appendChild(banner);
  }

  function handleContextInvalidated() {
    if (contextInvalidated) return;
    contextInvalidated = true;
    if (registerInterval) clearInterval(registerInterval);
    registerInterval = null;
    console.warn("[EVA-Gemini] Contexto invalidado. Recarregue a página (F5).");
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
  const REGISTER_INTERVAL_MS = 45000;
  registerInterval = setInterval(registerTab, REGISTER_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") registerTab();
  });

  function findFirstVisible(selectors, checkDisabled) {
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el && el.offsetParent !== null && (el.offsetWidth > 0 || el.offsetHeight > 0)) {
          if (checkDisabled && el.disabled) continue;
          return el;
        }
      }
    }
    return null;
  }

  function findPromptInput() {
    return findFirstVisible(GEMINI_SELECTORS.prompt, false);
  }

  function findSendButton() {
    return findFirstVisible(GEMINI_SELECTORS.sendButton, true);
  }

  function isGenerating() {
    const stopBtn = findFirstVisible(GEMINI_SELECTORS.stop, false);
    return !!stopBtn;
  }

  function setInputValue(input, text) {
    input.focus();
    if (input.isContentEditable) {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
      // Disparar input event extra
      input.innerText = text;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
    } else {
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function submitPrompt() {
    const btn = findSendButton();
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  /** Regex para caminho com suporte a @, ( e ) */
  const PATH_REGEX = /(?:FILE|filename|Arquivo|Caminho)\s*:\s*([@a-zA-Z0-9._\-/()]+)/i;

  function parseFileFromFirstLine(code) {
    const first = (code || "").split("\n")[0] || "";
    const match = first.match(PATH_REGEX);
    return match ? match[1].trim() : null;
  }

  function parseFileFromContent(code) {
    const lines = (code || "").split("\n");
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const match = (lines[i] || "").match(PATH_REGEX);
      if (match) return match[1].trim();
    }
    return null;
  }

  function extractPathFromPreElement(preElement) {
    const knownExts = new Set([
      "ts", "tsx", "js", "jsx", "mjs", "json", "html", "css", "scss", "sass",
      "py", "rb", "go", "rs", "java", "kt", "md", "mdx", "yaml", "yml",
      "sh", "bash", "sql", "graphql", "prisma", "vue", "svelte", "astro"
    ]);
    function isValidPath(c) {
      if (!c) return false;
      const ext = (c.match(/\.([a-zA-Z0-9]{1,10})$/) || [])[1];
      return ext ? knownExts.has(ext.toLowerCase()) : false;
    }
    let sibling = preElement ? preElement.previousElementSibling : null;
    let count = 0;
    while (sibling && count < 5) {
      const text = (sibling.textContent || "").trim();
      if (text.length > 0 && text.length < 300) {
        const m1 = text.match(/(?:FILE|Arquivo|Caminho|filename)\s*:\s*([@a-zA-Z0-9._\-/()]+)/i);
        if (m1 && isValidPath(m1[1])) return m1[1];
        const m2 = text.match(/`([@a-zA-Z0-9._\-/()]+\.[a-zA-Z0-9]{1,10})`/);
        if (m2 && isValidPath(m2[1])) return m2[1];
        const m3 = text.match(/\*{1,2}([@a-zA-Z0-9._\-/()]+\.[a-zA-Z0-9]{1,10})\*{1,2}/);
        if (m3 && isValidPath(m3[1])) return m3[1];
        const lastLine = text.split(/\n/).pop() || "";
        const m4 = lastLine.match(/^#*\s*([@a-zA-Z0-9._\-/()]+\.[a-zA-Z0-9]{1,10})\s*:?\s*$/);
        if (m4 && isValidPath(m4[1])) return m4[1];
      }
      sibling = sibling.previousElementSibling;
      count++;
    }
    return null;
  }

  function inferFilenameFromContent(code) {
    const trimmed = (code || "").trim();
    if (!trimmed) return null;
    const first = trimmed.slice(0, 800).toLowerCase();
    if (first.includes("<!doctype html") || first.startsWith("<html")) return "index.html";
    const hasReact = first.includes("import react") || first.includes('from "react"') || first.includes("from 'react'");
    const hasTs = first.includes(": string") || first.includes(": number") || first.includes(": boolean") || first.includes("interface ") || first.includes(": void");
    const hasJsx = first.includes("return (") || /<[A-Z]/.test(trimmed.slice(0, 800)) || first.includes("</div>");
    if (hasReact && hasTs) return "App.tsx";
    if (hasReact) return "App.jsx";
    if (hasJsx && hasTs) return "component.tsx";
    if (hasJsx) return "component.jsx";
    if (hasTs && (first.includes("export ") || first.includes("function "))) return "index.ts";
    if (first.includes("@mixin") || first.includes("@include")) return "style.scss";
    const hasCss = first.includes("{") && first.includes(":") && (first.includes("px") || first.includes("color:") || first.includes("margin:"));
    const hasJs = first.includes("function ") || first.includes("=>") || first.includes("export ");
    if (hasCss && !hasJs) return "style.css";
    if (hasJs || first.includes("module.exports")) return "script.js";
    if (first.includes("def ") || first.includes("print(") || first.includes("if __name__")) return "script.py";
    if ((first.startsWith("{") && trimmed.endsWith("}")) || (first.startsWith("[") && trimmed.endsWith("]"))) return "data.json";
    if (/^[\w-]+:\s+\S/.test(first) || first.includes("- name:")) return "config.yaml";
    if (first.startsWith("#!/bin/bash") || first.startsWith("#!/bin/sh")) return "script.sh";
    if (first.includes("select ") && first.includes("from ")) return "query.sql";
    if (first.includes("datasource db") || first.includes("generator client")) return "schema.prisma";
    if (first.startsWith("# ") || first.includes("- [ ]")) return first.includes("- [ ]") ? "checklist.md" : "README.md";
    return null;
  }

  function stripFileLine(code) {
    const lines = (code || "").split("\n");
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      if (/(?:FILE|filename|Arquivo|Caminho)\s*:\s*/i.test(lines[i] || "")) return lines.slice(i + 1).join("\n").trimStart();
    }
    return code || "";
  }

  function langToExt(lang) {
    const map = {
      js: "js", javascript: "js", jsx: "jsx",
      ts: "ts", typescript: "ts", tsx: "tsx",
      py: "py", python: "py",
      html: "html", css: "css", scss: "scss", sass: "scss", less: "less",
      json: "json", md: "md", markdown: "md",
      yaml: "yaml", yml: "yaml",
      sh: "sh", bash: "sh", shell: "sh",
      sql: "sql", graphql: "graphql", gql: "graphql",
      prisma: "prisma", toml: "toml",
      go: "go", rs: "rs", rust: "rs", rb: "rb", java: "java",
      vue: "vue", svelte: "svelte", astro: "astro",
    };
    return map[(lang || "").toLowerCase()] || "";
  }

  const MIN_FILE_CONTENT_LENGTH = 40;
  function isSnippetOrCommand(content) {
    const trimmed = (content || "").trim();
    if (/^FILE:\s*docs[\\/]fase-/im.test(trimmed)) return false;
    if (trimmed.length < MIN_FILE_CONTENT_LENGTH) return true;
    return false;
  }

  function blocksToFiles(blocks) {
    return blocks.map(function (block, i) {
      const fromDom = block.preElement ? extractPathFromPreElement(block.preElement) : null;
      const pathFromFirstLine = parseFileFromFirstLine(block.code);
      const pathFromContent = pathFromFirstLine || parseFileFromContent(block.code);
      const inferred = fromDom || pathFromContent || inferFilenameFromContent(block.code);
      const ext = langToExt(block.language);
      const name = inferred || (ext ? "file_" + i + "." + ext : "file_" + i + ".txt");
      const content = pathFromContent ? stripFileLine(block.code) : block.code.trim();
      return { name, content };
    });
  }

  function extractCodeBlocks() {
    const blocks = [];
    const seen = new Set();
    function hashContent(code) {
      let h = 5381;
      for (let i = 0; i < code.length; i++) {
        h = ((h << 5) + h) ^ code.charCodeAt(i);
        h = h >>> 0;
      }
      return h.toString(36);
    }
    function addBlock(code, language, preElement) {
      const trimmedCode = (code || "").trim();
      if (!trimmedCode || trimmedCode.length < 10) return;
      const key = hashContent(trimmedCode);
      if (seen.has(key)) return;
      seen.add(key);
      blocks.push({ code: trimmedCode, language: language || undefined, preElement: preElement || null });
    }

    // Estratégia 1: pre code (principal)
    document.querySelectorAll("pre").forEach((pre) => {
      const codeEl = pre.querySelector("code");
      const text = codeEl ? codeEl.textContent : pre.textContent;
      if (text && text.trim().length > 10) {
        let lang = "";
        const cls = (codeEl || pre).className || "";
        const langMatch = cls.match(/language-([\w-]+)/);
        if (langMatch) lang = langMatch[1];
        if (!lang) lang = pre.getAttribute("data-language") || codeEl?.getAttribute("data-language") || "";
        addBlock(text, lang, pre);
      }
    });

    // Estratégia 2: code-block, .code-block
    if (blocks.length === 0) {
      document.querySelectorAll("code-block, .code-block").forEach((el) => {
        const text = el.textContent || "";
        let lang = (el.className || "").match(/language-([\w-]+)/)?.[1] || "";
        if (text.trim().length > 10) addBlock(text, lang, el.parentElement);
      });
    }

    // Estratégia 3: Regex no texto do DOM
    if (blocks.length === 0) {
      const root = document.querySelector("main") || document.body;
      const raw = root.innerText || "";
      const fenceRegex = /```([\w-]*)\n([\s\S]*?)```/g;
      let match;
      while ((match = fenceRegex.exec(raw)) !== null) {
        const lang = match[1] || "";
        const code = match[2]?.trim() || "";
        if (code.length > 10) addBlock(code, lang, null);
      }
    }

    return blocks;
  }

  const POLL_INTERVAL_MS = 1000;
  const CAPTURE_TIMEOUT_MS = 600000;

  function waitForResponseComplete() {
    return new Promise((resolve) => {
      let intervalRef = null;
      let timeoutId = null;
      let wasGenerating = false;
      let stableCount = 0;
      let checkCount = 0;

      // Se não começar a gerar em 10 segundos, assume que falhou ou terminou instantâneo
      const START_TIMEOUT_MS = 10000;
      const startTimeoutId = setTimeout(() => {
        if (!wasGenerating) {
          console.warn("[EVA-Gemini] Timeout: Não detectou estado 'gerando' em 10s. Finalizando.");
          finish();
        }
      }, START_TIMEOUT_MS);

      function check() {
        checkCount++;
        const generating = isGenerating();

        if (generating) {
          wasGenerating = true;
          stableCount = 0;
        } else {
          // Se já estava gerando e parou, incrementa contador de estabilidade
          if (wasGenerating) {
            stableCount++;
            // Se ficar estável (sem gerar) por ~2s, considera terminado
            if (stableCount >= 2) {
              finish();
            }
          }
          // Se ainda não começou a gerar, continuamos esperando (até o START_TIMEOUT_MS)
        }
      }

      function finish() {
        if (intervalRef) clearInterval(intervalRef);
        if (timeoutId) clearTimeout(timeoutId);
        if (startTimeoutId) clearTimeout(startTimeoutId);
        resolve(extractCodeBlocks());
      }

      intervalRef = setInterval(check, POLL_INTERVAL_MS);
      // Timeout geral de segurança (caso gere por muito tempo ou trave)
      timeoutId = setTimeout(finish, CAPTURE_TIMEOUT_MS);
    });
  }

  // --- Image Handling ---
  function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  }

  async function pasteImages(input, images) {
    if (!images || images.length === 0) return;
    try {
      const dataTransfer = new DataTransfer();
      for (const img of images) {
        const blob = base64ToBlob(img.base64, img.mimeType);
        const file = new File([blob], "image.png", { type: img.mimeType });
        dataTransfer.items.add(file);
      }
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      });
      input.focus();
      input.dispatchEvent(pasteEvent);
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error("[EVA-Gemini] Erro ao colar imagem:", err);
    }
  }

  async function handleSendPrompt(payload) {
    const { prompt, images } = payload || {};
    if (!prompt?.trim() && (!images || images.length === 0)) {
      sendToBackground("EVA_ERROR", { message: "Prompt vazio." });
      return;
    }

    const input = findPromptInput();
    if (!input) {
      sendToBackground("EVA_ERROR", { message: "Input do Gemini não encontrado. Verifique login." });
      return;
    }

    if (images && images.length > 0) await pasteImages(input, images);
    if (prompt?.trim()) setInputValue(input, prompt);

    await new Promise(r => setTimeout(r, 1000));

    if (!submitPrompt()) {
      sendToBackground("EVA_ERROR", { message: "Botão enviar não encontrado." });
      return;
    }

    try {
      const rawBlocks = await waitForResponseComplete();
      const allFiles = blocksToFiles(rawBlocks);
      const files = allFiles
        .filter(f => !isSnippetOrCommand(f.content))
        .map(f => ({ name: f.name, content: f.content })); // Remove preElement (não serializável)

      console.log("[EVA-Gemini] Arquivos capturados:", files.map(f => f.name));

      sendToBackground("EVA_CODE_CAPTURED", {
        files: files,
        code: files.length === 1 ? files[0].content : ""
      });

    } catch (e) {
      sendToBackground("EVA_ERROR", { message: e.message || "Erro desconhecido." });
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (contextInvalidated) return false;
    if (message.type !== "EVA_PROMPT_INJECT") return false;

    function safeRespond(val) { try { sendResponse(val); } catch (e) { } }

    handleSendPrompt(message.payload)
      .then(() => safeRespond({ ok: true }))
      .catch(() => safeRespond({ ok: false }));
    return true;
  });

})();

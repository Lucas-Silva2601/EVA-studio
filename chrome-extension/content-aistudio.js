/**
 * EVA Studio Bridge v3.2 - Content Script (Google AI Studio)
 * Executa em https://aistudio.google.com/*
 *
 * MELHORIAS v3.2:
 * - Deduplicação robusta: hash MD5 do conteúdo completo (não só os primeiros 80 chars)
 * - Captura do CONTEXTO PRÉ-BLOCO do DOM para detectar nomes de arquivo
 * - inferFilenameFromContent expandida: TypeScript, TSX, YAML, SQL, Shell, Prisma, etc.
 * - langToExt expandida: scss, yaml, sql, sh, bash, prisma, graphql, toml, env, etc.
 * - parseFileFromContent suporta @ em paths (TypeScript aliases)
 * - Charset expandido nas regexes de path: @, (, ) para Next.js route groups
 */
(function () {
  "use strict";

  const SOURCE = "eva-content-aistudio";
  let contextInvalidated = false;
  let registerInterval = null;

  /** Seletores do DOM do AI Studio (aistudio.google.com). Atualize se a UI mudar. */
  const AISTUDIO_SELECTORS = {
    prompt: [
      'textarea[placeholder*="Start typing a prompt"]',
      'textarea[placeholder*="Enter"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Type"]',
      'textarea[placeholder*="Prompt"]',
      'textarea[aria-label*="prompt"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
      "textarea",
      '[role="combobox"]',
      'input[type="text"]',
    ],
    sendButton: [
      'button[aria-label*="Run"]',
      '[aria-label*="Run"]',
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Enviar"]',
      'button[data-icon="send"]',
      '[data-testid="send-button"]',
      'form button[type="submit"]',
      'button[aria-label*="Submit"]',
    ],
    stop: [
      'button[aria-label*="Stop"]',
      'button[aria-label*="Parar"]',
      '[data-icon="stop"]',
      '[title*="Stop"]',
    ],
    share: [
      'button[aria-label*="Share"]',
      'button[aria-label*="Compartilhar"]',
      '[data-icon="share"]',
      '[title*="Share"]',
    ],
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
    console.warn("[EVA-AIStudio] Contexto invalidado. Recarregue a página (F5).");
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
    sendToBackground("REGISTER_AISTUDIO_TAB", {});
  }

  console.log("[EVA-AIStudio] Script injetado v3.2; registrando aba.");
  registerTab();
  const REGISTER_INTERVAL_MS = 45000;
  registerInterval = setInterval(registerTab, REGISTER_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") registerTab();
  });

  function findFirstVisible(selectors, checkDisabled) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && (el.offsetWidth > 0 || el.offsetHeight > 0)) {
        if (checkDisabled && el.disabled) continue;
        return el;
      }
    }
    return null;
  }

  function findPromptInput() {
    return findFirstVisible(AISTUDIO_SELECTORS.prompt, false);
  }

  function findSendButton() {
    const btn = findFirstVisible(AISTUDIO_SELECTORS.sendButton, true);
    if (btn) return btn;
    const allButtons = Array.from(document.querySelectorAll('button:not([disabled])'));
    const runBtn = allButtons.find(b => {
      const txt = (b.textContent || "").trim().toLowerCase();
      return txt === "run" || txt === "executar" || txt === "send" || txt === "enviar";
    });
    if (runBtn) return runBtn;
    const form = document.querySelector("form");
    if (form) {
      const formBtn = form.querySelector("button:not([disabled])");
      if (formBtn) return formBtn;
    }
    return null;
  }

  function isStopVisible() {
    for (const sel of AISTUDIO_SELECTORS.stop) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return true;
    }
    return false;
  }

  function isShareVisible() {
    for (const sel of AISTUDIO_SELECTORS.share) {
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

  // ============================================================
  // UTILITÁRIOS DE EXTRAÇÃO DE NOME DE ARQUIVO (melhorados v3.2)
  // ============================================================

  /** Regex para caminho de arquivo: suporta @, ( e ) para Next.js route groups e TypeScript aliases */
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

  /**
   * Extrai o nome do arquivo a partir do texto ANTES do bloco de código no DOM.
   * Verifica os últimas 3 elementos irmãos (para suportar Gemini em PT-BR).
   * Padrões detectados:
   * - "Aqui está o arquivo `src/main.ts`:"
   * - "**FILE:** src/main.ts"
   * - "### src/main.ts"
   * - "`src/main.ts`:" ou "**src/main.ts**:"
   */
  function extractPathFromPreElement(preElement) {
    // Charset para caminho de arquivo
    const pathPattern = string => {
      const m = string.match(/([@a-zA-Z0-9._\-/()]+\.[a-zA-Z0-9]{1,10})/);
      return m ? m[1] : null;
    };

    const knownExts = new Set([
      "ts", "tsx", "js", "jsx", "mjs", "cjs",
      "json", "html", "css", "scss", "sass", "less",
      "py", "rb", "go", "rs", "java", "kt", "swift",
      "md", "mdx", "txt", "yaml", "yml", "toml", "env",
      "sh", "bash", "zsh", "ps1", "bat", "prisma",
      "sql", "graphql", "proto", "vue", "svelte", "astro",
      "config", "lock"
    ]);

    function isValidPath(candidate) {
      if (!candidate) return false;
      const extMatch = candidate.match(/\.([a-zA-Z0-9]{1,10})$/);
      return extMatch ? knownExts.has(extMatch[1].toLowerCase()) : false;
    }

    // Percorre os elementos anteriores ao <pre> (até 5 elementos acima)
    let sibling = preElement.previousElementSibling;
    let count = 0;
    while (sibling && count < 5) {
      const text = (sibling.textContent || "").trim();
      if (text.length > 0 && text.length < 300) {
        // Padrão 1: FILE: path ou Arquivo: path (direto)
        const fromFileKeyword = text.match(/(?:FILE|Arquivo|Caminho|filename)\s*:\s*([@a-zA-Z0-9._\-/()]+)/i);
        if (fromFileKeyword && isValidPath(fromFileKeyword[1])) return fromFileKeyword[1];

        // Padrão 2: Backtick `path.ext`
        const fromBacktick = text.match(/`([@a-zA-Z0-9._\-/()]+\.[a-zA-Z0-9]{1,10})`/);
        if (fromBacktick && isValidPath(fromBacktick[1])) return fromBacktick[1];

        // Padrão 3: **path.ext** (bold markdown renderizado)
        const fromBold = text.match(/\*{1,2}([@a-zA-Z0-9._\-/()]+\.[a-zA-Z0-9]{1,10})\*{1,2}/);
        if (fromBold && isValidPath(fromBold[1])) return fromBold[1];

        // Padrão 4: Heading ou linha com apenas o caminho (ex: "### src/index.ts" ou "src/index.ts:")
        const lastLine = text.split(/\n/).pop() || "";
        const headingMatch = lastLine.match(/^#*\s*([@a-zA-Z0-9._\-/()]+\.[a-zA-Z0-9]{1,10})\s*:?\s*$/);
        if (headingMatch && isValidPath(headingMatch[1])) return headingMatch[1];

        // Padrão 5: Frase natural PT-BR "...arquivo src/..." ou "...file src/..."
        const naturalMatch = text.match(/(?:arquivo|file|ficheiro|here is|aqui está o?)\s+[`"']?([@a-zA-Z0-9._\-/()]+\.[a-zA-Z0-9]{1,10})[`"']?\s*:?/i);
        if (naturalMatch && isValidPath(naturalMatch[1])) return naturalMatch[1];
      }
      sibling = sibling.previousElementSibling;
      count++;
    }

    // Também verifica o nó de texto imediatamente antes (sem ser elemento)
    let node = preElement.previousSibling;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").trim();
      if (text.length > 0 && text.length < 200) {
        const m = text.match(/([@a-zA-Z0-9._\-/()]+\.[a-zA-Z0-9]{1,10})\s*:?\s*$/);
        if (m && isValidPath(m[1])) return m[1];
      }
    }

    return null;
  }

  /**
   * Infere nome de arquivo com extensão correta a partir do conteúdo.
   * Suporta: HTML, CSS, SCSS, TypeScript, TSX, JSX, Python, JSON, YAML,
   * Markdown, Shell Script, SQL, Prisma, e outros formatos comuns.
   */
  function inferFilenameFromContent(code) {
    const trimmed = (code || "").trim();
    if (!trimmed) return null;
    const first = trimmed.slice(0, 800).toLowerCase();

    // HTML
    if (first.includes("<!doctype html") || first.startsWith("<html") || first.startsWith("<!doctype")) {
      return "index.html";
    }

    // TSX / JSX com React
    const hasReactImport = first.includes("import react") || first.includes('from "react"') || first.includes("from 'react'");
    const hasTypescript =
      first.includes(": string") || first.includes(": number") || first.includes(": boolean") ||
      first.includes("interface ") || /(:\s*\w+(\[\])?)/.test(first) ||
      first.includes(": void") || first.includes("readonly ");
    const hasJsx =
      first.includes("return (") || first.includes("return(") ||
      /<[A-Z][A-Za-z]+/.test(trimmed.slice(0, 800)) ||
      first.includes("</div>") || first.includes("</span>") || first.includes("</p>");

    if (hasReactImport && hasTypescript) return "App.tsx";
    if (hasReactImport) return "App.jsx";
    if (hasJsx && hasTypescript) return "component.tsx";
    if (hasJsx) return "component.jsx";

    // TypeScript puro (sem React)
    if (hasTypescript && (first.includes("export ") || first.includes("function ") || first.includes("const "))) {
      return "index.ts";
    }

    // SCSS / Sass
    if (first.includes("@mixin") || first.includes("@include") || first.includes("@extend")) {
      return "style.scss";
    }

    // CSS
    const hasBracesAndColon = first.includes("{") && first.includes(":");
    const hasCssHint = first.includes("px") || first.includes("em") || first.includes("rem") ||
      /\d\s*%/.test(first) || first.includes("color:") || first.includes("margin:") ||
      first.includes("padding:") || first.includes("font-size:") || first.includes("width:") ||
      first.includes("height:") || first.includes("background") || first.includes("border:") || first.includes("display:");
    const hasJsHint = first.includes("function ") || first.includes("=>") || first.includes("const ") || first.includes("export ");
    if (hasCssHint && hasBracesAndColon && !hasJsHint) return "style.css";

    // JavaScript puro
    if (first.includes("function ") || (first.includes("const ") && first.includes("=>")) || first.includes("export ") || first.includes("module.exports")) {
      return "script.js";
    }

    // Python
    if (first.includes("def ") || first.includes("import ") || first.includes("print(") || first.includes("if __name__")) {
      return "script.py";
    }

    // JSON
    if ((first.startsWith("{") && trimmed.endsWith("}")) || (first.startsWith("[") && trimmed.endsWith("]"))) {
      return "data.json";
    }

    // YAML
    if (/^[\w-]+:\s+\S/.test(first) || first.includes("- name:") || first.includes("version:")) {
      return "config.yaml";
    }

    // Shell Script
    if (first.startsWith("#!/bin/bash") || first.startsWith("#!/bin/sh") || first.startsWith("#!/usr/bin/env bash")) {
      return "script.sh";
    }

    // SQL
    if ((first.includes("select ") && first.includes("from ")) || first.includes("create table") || first.includes("insert into")) {
      return "query.sql";
    }

    // Prisma schema
    if (first.includes("datasource db") || first.includes("generator client") || (first.includes("model ") && first.includes("@@"))) {
      return "schema.prisma";
    }

    // Markdown
    if (first.startsWith("# ") || first.includes("\n## ") || first.includes("- [ ]") || first.includes("- [x]")) {
      return first.includes("- [ ]") ? "checklist.md" : "README.md";
    }

    return null;
  }

  function stripFileLine(code) {
    const lines = (code || "").split("\n");
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      if (/(?:FILE|filename|Arquivo|Caminho)\s*:\s*/i.test(lines[i] || "")) {
        return lines.slice(i + 1).join("\n").trimStart();
      }
    }
    return code || "";
  }

  /** Mapeia linguagem de código para extensão de arquivo (expandido v3.2) */
  function langToExt(lang) {
    const map = {
      js: "js", javascript: "js",
      jsx: "jsx",
      ts: "ts", typescript: "ts",
      tsx: "tsx",
      py: "py", python: "py",
      html: "html",
      css: "css",
      scss: "scss", sass: "scss",
      less: "less",
      json: "json",
      md: "md", markdown: "md",
      yaml: "yaml", yml: "yaml",
      sh: "sh", bash: "sh", shell: "sh",
      sql: "sql",
      graphql: "graphql", gql: "graphql",
      prisma: "prisma",
      toml: "toml",
      go: "go", golang: "go",
      rs: "rs", rust: "rs",
      rb: "rb", ruby: "rb",
      java: "java",
      kt: "kt", kotlin: "kt",
      swift: "swift",
      vue: "vue",
      svelte: "svelte",
      astro: "astro",
      xml: "xml",
      dockerfile: "dockerfile",
    };
    return map[(lang || "").toLowerCase()] || "";
  }

  const MIN_FILE_CONTENT_LENGTH = 60;
  const MIN_SINGLE_LINE_LENGTH = 100;
  const SINGLE_LINE_COMMAND_REGEX = /^(npm |yarn |pnpm |cd |echo |git |python |node |\.\/|npx |curl |wget |mkdir |cp |mv |cat |ls |chmod |exit |clear |deno |bun )\s*/i;

  function isSnippetOrCommand(content) {
    const trimmed = (content || "").trim();
    // Exceção: arquivos de documentação markdown (checklist, docs)
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
   * Converte um array de blocos de código em arquivos.
   * Cada bloco pode ter um `preElement` associado para buscar o nome no DOM.
   */
  function blocksToFiles(blocks) {
    return blocks.map(function (block, i) {
      // Prioridade 1: Detecta nome no contexto PRÉ-BLOCO do DOM
      const fromDomContext = block.preElement ? extractPathFromPreElement(block.preElement) : null;
      // Prioridade 2: Detecta FILE: dentro do código (primeiras linhas)
      const pathFromFirstLine = parseFileFromFirstLine(block.code);
      const pathFromContent = pathFromFirstLine || parseFileFromContent(block.code);
      // Prioridade 3: Inferência pelo conteúdo
      const inferred = fromDomContext || pathFromContent || inferFilenameFromContent(block.code);
      // Prioridade 4: Usa extensão da linguagem como fallback
      const ext = langToExt(block.language);
      const name = inferred || (ext ? "file_" + i + "." + ext : "file_" + i + ".txt");
      // Remove o comentário FILE: do conteúdo se o nome veio de dentro do bloco
      const content = pathFromContent ? stripFileLine(block.code) : block.code.trim();
      return { name, content };
    });
  }

  /**
   * Extrai blocos de código do DOM do AI Studio.
   *
   * MELHORIAS v3.2:
   * - Deduplicação por hash do CONTEÚDO COMPLETO (não só os primeiros 80 chars)
   * - Preserva referência ao `preElement` para buscar o nome no DOM
   * - Seletores mais abrangentes para diferentes formatos de UI
   */
  function extractCodeBlocks() {
    const blocks = [];
    // Hash simples do conteúdo completo para deduplicação robusta
    const seen = new Set();
    function hashContent(code) {
      // djb2 hash simples — suficiente para deduplicação de texto
      let h = 5381;
      for (let i = 0; i < code.length; i++) {
        h = ((h << 5) + h) ^ code.charCodeAt(i);
        h = h >>> 0; // converte para unsigned 32-bit
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

    // Estratégia 1 (principal): Busca todos os <pre> com seus <code> e detecta linguagem
    const preElements = document.querySelectorAll("pre");
    preElements.forEach((pre) => {
      const codeEl = pre.querySelector("code");
      const text = codeEl ? codeEl.textContent : pre.textContent;
      if (text && text.trim().length > 10) {
        let lang = "";
        if (codeEl && codeEl.className) {
          // Detecta linguagem pelo className (ex: "language-typescript", "language-python")
          const langMatch = codeEl.className.match(/language-([\w-]+)/);
          if (langMatch) lang = langMatch[1];
        }
        // Se não achou no <code>, tenta no <pre>
        if (!lang && pre.className) {
          const langMatch = pre.className.match(/language-([\w-]+)/);
          if (langMatch) lang = langMatch[1];
        }
        // Também verifica atributo data-language
        if (!lang) {
          lang = pre.getAttribute("data-language") || codeEl?.getAttribute("data-language") || "";
        }
        addBlock(text, lang, pre);
      }
    });

    // Estratégia 2: <code> inline (se não há <pre>)
    if (blocks.length === 0) {
      document.querySelectorAll("code").forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 20) addBlock(text, undefined, el.parentElement);
      });
    }

    // Estratégia 3: Containers de código por classe
    if (blocks.length === 0) {
      document.querySelectorAll('[class*="code-block"], [class*="markdown"], [data-code-block]').forEach((el) => {
        const pre = el.querySelector("pre") || el;
        const text = (pre.textContent || el.textContent || "").trim();
        if (text.length > 20) addBlock(text, undefined, pre);
      });
    }

    // Estratégia 4: Regex no texto do DOM (último recurso)
    if (blocks.length === 0) {
      const root = document.querySelector("main") || document.querySelector("[role='main']") || document.body;
      const rawText = (root && root.textContent) ? root.textContent : document.body.textContent || "";
      const fenceRegex = /```([\w-]*)\n([\s\S]*?)```/g;
      let match;
      while ((match = fenceRegex.exec(rawText)) !== null) {
        const lang = match[1] || "";
        const code = match[2]?.trim() || "";
        if (code.length > 10) addBlock(code, lang, null);
      }
    }

    return blocks;
  }

  const DEBOUNCE_AFTER_STOP_MS = 200;
  const DEBOUNCE_AFTER_SHARE_MS = 150;
  const CAPTURE_TIMEOUT_MS = 600000; // 10 minutos
  const POLL_INTERVAL_MS = 200;

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
        resolve(extractCodeBlocks());
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
          const blks = extractCodeBlocks();
          if (blks.length > 0) scheduleCapture(DEBOUNCE_AFTER_STOP_MS);
        }
      }
      observerRef = new MutationObserver(checkAndCapture);
      observerRef.observe(document.body, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
      intervalRef = setInterval(checkAndCapture, POLL_INTERVAL_MS);
      timeoutId = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        if (observerRef) observerRef.disconnect();
        if (intervalRef) clearInterval(intervalRef);
        if (debounceTimer) clearTimeout(debounceTimer);
        resolve(extractCodeBlocks());
      }, CAPTURE_TIMEOUT_MS);
    });
  }

  function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
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
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error("[EVA-AIStudio] Erro ao colar imagem:", err);
    }
  }

  async function handleSendPrompt(payload) {
    const raw = payload != null && typeof payload === "object" ? payload.prompt : undefined;
    const images = payload != null && typeof payload === "object" ? payload.images : undefined;
    const prompt = typeof raw === "string" ? raw : "";

    if (!prompt.trim() && (!images || images.length === 0)) {
      sendToBackground("EVA_ERROR", { message: "Prompt vazio e sem imagens." });
      return;
    }
    const input = findPromptInput();
    if (!input) {
      sendToBackground("EVA_ERROR", { message: "Caixa de prompt do AI Studio não encontrada. Atualize os seletores em content-aistudio.js." });
      return;
    }

    if (images && images.length > 0) {
      await pasteImages(input, images);
    }

    if (prompt.trim()) {
      setInputValue(input, prompt);
    }

    await new Promise((r) => setTimeout(r, 800));

    if (!submitPrompt()) {
      sendToBackground("EVA_ERROR", { message: "Botão de envio não encontrado." });
      return;
    }
    try {
      const rawBlocks = await waitForResponseComplete();
      if (rawBlocks.length === 0) {
        sendToBackground("EVA_CODE_CAPTURED", { code: "", files: [] });
      } else {
        // Converte blocos em arquivos (usando referências ao DOM para detectar nome)
        const allFiles = blocksToFiles(rawBlocks);
        // Remove o campo preElement antes de enviar (não é serializável)
        const files = allFiles
          .filter(function (f) { return !isSnippetOrCommand(f.content); })
          .map(function (f) { return { name: f.name, content: f.content }; });

        console.log("[EVA-AIStudio] Arquivos capturados:", files.map(f => f.name));

        if (files.length === 0) {
          sendToBackground("EVA_CODE_CAPTURED", { code: "", files: [] });
        } else if (files.length === 1) {
          sendToBackground("EVA_CODE_CAPTURED", { code: files[0].content, filename: files[0].name, files });
        } else {
          sendToBackground("EVA_CODE_CAPTURED", { files });
        }
      }
    } catch (e) {
      sendToBackground("EVA_ERROR", { message: e?.message ?? "Erro ao extrair código." });
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (contextInvalidated) return false;
    if (message.type !== "EVA_PROMPT_INJECT") return false;
    function safeSendResponse(value) {
      if (contextInvalidated) return;
      try { sendResponse(value); } catch (e) { if (isContextInvalidatedError(e)) handleContextInvalidated(); }
    }
    handleSendPrompt(message.payload).then(() => safeSendResponse({ ok: true })).catch(() => safeSendResponse({ ok: false }));
    return true;
  });
})();

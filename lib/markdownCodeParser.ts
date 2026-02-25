/**
 * Fase 10: Parser de Markdown para extrair múltiplos blocos de código
 * e identificar nome de arquivo por convenção (comentário, contexto pré-bloco ou info string).
 *
 * Melhorias v2:
 * - Detecção do nome do arquivo no TEXTO ANTES do bloco (padrão mais comum do Gemini)
 * - Charset expandido: suporte a `@` (path aliases TypeScript), `(`, `)`
 * - Novos padrões: **FILE:**, `### path.ext`, `` `path.ext` ``, "Aqui está o arquivo X:"
 * - Reutilizado centralmente por normalizeExtensionPayload e ChatSidebar
 */

export interface ParsedCodeFile {
  name: string;
  content: string;
}

// Charset padrão para caminhos de arquivo (inclui @, parênteses para Next.js route groups)
const PATH_CHARSET = `[a-zA-Z0-9._\\-/@()]+`;

/** Regex rigoroso: FILE: ou // FILE: seguido de caminho/nome.ext (inclui @ e parênteses). */
const FILENAME_COMMENT_REGEX = /^\s*(?:\/\/|#|<!--|\/\*)?\s*(?:filename|FILE|Arquivo|Caminho)\s*:\s*([@a-zA-Z0-9._\-/()]+)(?:\s*-->|\s*\*\/)?/im;

/** Regex robusto: FILE: ou Caminho: ou Arquivo: path em qualquer lugar do texto. */
export const FILE_PATH_FULL_TEXT_REGEX = /(?:FILE|Caminho|Arquivo|filename)\s*:\s*([@a-zA-Z0-9._\-/()]+)/gi;

/** Extrai path procurando FILE: em TODO o texto (primeira ocorrência). Evita arquivos .txt genéricos. */
export function extractFilePathFromFullText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(FILE_PATH_FULL_TEXT_REGEX);
  if (match && match[0]) {
    const first = match[0];
    const pathMatch = first.match(/(?:FILE|Caminho|Arquivo|filename)\s*:\s*([@a-zA-Z0-9._\-/()]+)/i);
    if (pathMatch) return pathMatch[1].trim();
  }
  return null;
}

/** Regex robusto para primeira/segunda linha: FILE: ou filename: path. */
export const FILE_PATH_FIRST_LINES_REGEX = /(?:FILE|filename|Caminho|Arquivo)\s*:\s*([@a-zA-Z0-9._\-/()]+)/i;

/** Extrai path da primeira ou segunda linha com FILE: (ex.: FILE: index.html). Usado pelo listener da extensão. */
export function extractFilePathFromFirstTwoLines(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lines = trimmed.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 2); i++) {
    const line = lines[i] ?? "";
    const match = line.match(FILE_PATH_FIRST_LINES_REGEX);
    if (match) return match[1].trim();
  }
  return null;
}

/** Procura FILE: em todo o texto primeiro; depois nas primeiras linhas. */
export function extractFilePathStrict(text: string): string | null {
  const fromFull = extractFilePathFromFullText(text);
  if (fromFull) return fromFull;
  const fromFirstTwo = extractFilePathFromFirstTwoLines(text);
  if (fromFirstTwo) return fromFirstTwo;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lines = trimmed.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i]?.trim() ?? "";
    const match = line.match(/^(?:\/\/|#|--|\/)?\s*(?:FILE|filename|Caminho|Arquivo)\s*:\s*(.+?)(?:\s*\*\/)?$/i);
    if (match) return match[1].trim();
  }
  return null;
}

/**
 * Extrai o caminho de arquivo a partir do contexto de texto ANTERIOR a um bloco de código.
 * Suporta os padrões mais comuns que o Gemini usa em PT-BR e EN:
 *
 * - `FILE: path/to/file.ts`
 * - `**FILE:** path/to/file.ts`
 * - `Arquivo: path/to/file.ts`
 * - `` `path/to/file.ts` `` (referência com backtick)
 * - `**path/to/file.ts**` (bold)
 * - `### src/index.ts` (heading com apenas o caminho)
 * - `Aqui está o arquivo path/to/file.ts:` (verso PT-BR natural)
 * - `Here is the file path/to/file.ts:` (verso EN natural)
 * - `path/to/file.ts:` (linha que termina com `:`)
 */
export function extractPathFromPreBlockContext(contextText: string): string | null {
  if (!contextText?.trim()) return null;

  // Analisamos apenas as últimas 5 linhas não-vazias antes do bloco
  const lines = contextText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const lastLines = lines.slice(-5);

  // Regex para validar se algo é realmente um caminho de arquivo (deve ter extensão)
  const pathPattern = `([@a-zA-Z0-9._\\-/()]+\\.[a-zA-Z0-9]{1,5})`;

  const patterns: RegExp[] = [
    // FILE: path (com ou sem bold/asterisco)
    new RegExp(`(?:\\*{1,2})?\\s*(?:FILE|Arquivo|Caminho|filename)\\s*:\\s*(?:\\*{1,2})?\\s*${pathPattern}`, "i"),
    // Backtick: `path.ext`
    new RegExp(`\`${pathPattern}\`\\s*:?\\s*$`),
    // **path.ext** (bold)
    new RegExp(`\\*{1,2}${pathPattern}\\*{1,2}\\s*:?\\s*$`),
    // ### path.ext (heading com apenas o caminho)
    new RegExp(`^#{1,4}\\s+${pathPattern}\\s*$`),
    // "Aqui está o arquivo X:" / "Here is/the file X:"  — frase natural
    new RegExp(`(?:arquivo|file|ficheiro|código de|conteúdo de|aqui está o|here is(?:\\s+the)?)\\s+['\`]?${pathPattern}['\`]?\\s*:?\\s*$`, "i"),
    // Linha que termina com "pathx/y/z.ext:" (só o caminho e dois pontos)
    new RegExp(`^${pathPattern}\\s*:\\s*$`),
  ];

  for (let i = lastLines.length - 1; i >= 0; i--) {
    const line = lastLines[i];
    for (const regex of patterns) {
      const match = line.match(regex);
      if (match) {
        // Captura o primeiro grupo que parece um caminho válido
        const candidate = match[1]?.trim();
        if (candidate && isValidFilePath(candidate)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

/** Valida se a string é um caminho de arquivo plausível (tem extensão, não é só uma palavra). */
function isValidFilePath(candidate: string): boolean {
  if (!candidate) return false;
  // Deve ter extensão razoável (1-5 chars após o último ponto)
  const extMatch = candidate.match(/\.([a-zA-Z0-9]{1,5})$/);
  if (!extMatch) return false;
  const ext = extMatch[1].toLowerCase();
  // Extensões conhecidas (whitelist básica)
  const knownExts = new Set([
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "json", "html", "css", "scss", "sass", "less",
    "py", "rb", "go", "rs", "java", "kt", "swift",
    "md", "mdx", "txt", "yaml", "yml", "toml", "env",
    "sh", "bash", "zsh", "ps1", "bat", "cmd",
    "sql", "graphql", "prisma", "proto",
    "vue", "svelte", "astro",
    "config", "lock",
  ]);
  return knownExts.has(ext);
}

/**
 * Infere nome de arquivo com extensão correta a partir do conteúdo (evita file_0.txt).
 * Suporta: HTML, CSS, SCSS, TypeScript, TSX, JavaScript, JSX, Python, JSON, YAML,
 * Markdown, Shell Script, SQL, Prisma, e outros formatos comuns.
 */
export function inferFilenameFromContent(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const first = trimmed.slice(0, 800);
  const firstLower = first.toLowerCase();

  // HTML
  if (firstLower.includes("<!doctype html") || firstLower.startsWith("<html") || firstLower.startsWith("<!doctype")) {
    return "index.html";
  }

  // TSX / JSX com React — ANTES do check genérico de TS/JS
  const hasReactImport =
    firstLower.includes("import react") ||
    firstLower.includes("from \"react\"") ||
    firstLower.includes("from 'react'");
  const hasTypescript =
    firstLower.includes(": string") ||
    firstLower.includes(": number") ||
    firstLower.includes(": boolean") ||
    firstLower.includes("interface ") ||
    firstLower.includes("type ") ||
    firstLower.includes(": void") ||
    firstLower.includes("readonly ") ||
    firstLower.includes("<t>") ||
    /:\s*\w+(\[\])?(\s*\|)?/.test(first);
  const hasJsx =
    firstLower.includes("return (") ||
    firstLower.includes("return(") ||
    /<[A-Z][A-Za-z]+/.test(first) || // JSX component (<MyComp)
    firstLower.includes("</div>") ||
    firstLower.includes("</span>") ||
    firstLower.includes("</p>");

  if (hasReactImport && hasTypescript) return "App.tsx";
  if (hasReactImport) return "App.jsx";
  if (hasJsx && hasTypescript) return "component.tsx";
  if (hasJsx) return "component.jsx";

  // TypeScript puro (sem React)
  if (hasTypescript && (firstLower.includes("export ") || firstLower.includes("function ") || firstLower.includes("const "))) {
    return "index.ts";
  }

  // SCSS / Sass
  if (firstLower.includes("@mixin") || firstLower.includes("@include") || firstLower.includes("@extend") || firstLower.includes("$") && firstLower.includes("{")) {
    return "style.scss";
  }

  // CSS
  const hasBracesAndColon = firstLower.includes("{") && firstLower.includes(":");
  const hasCssHint =
    firstLower.includes("px") || firstLower.includes("em") || firstLower.includes("rem") ||
    /\d\s*%/.test(firstLower) || firstLower.includes("color:") || firstLower.includes("margin:") ||
    firstLower.includes("padding:") || firstLower.includes("font-size:") || firstLower.includes("width:") ||
    firstLower.includes("height:") || firstLower.includes("background") || firstLower.includes("border:") ||
    firstLower.includes("display:");
  const hasJsHint =
    firstLower.includes("function ") || firstLower.includes("=>") ||
    firstLower.includes("const ") || firstLower.includes("export ");
  if (hasCssHint && hasBracesAndColon && !hasJsHint) return "style.css";

  // JavaScript puro
  if (firstLower.includes("function ") || (firstLower.includes("const ") && firstLower.includes("=>")) || firstLower.includes("export ") || firstLower.includes("module.exports")) {
    return "script.js";
  }

  // Python
  if (
    firstLower.includes("def ") ||
    firstLower.includes("import ") ||
    firstLower.includes("class ") && firstLower.includes(":") ||
    firstLower.includes("print(") ||
    firstLower.includes("if __name__")
  ) {
    return "script.py";
  }

  // JSON
  if (
    (firstLower.startsWith("{") && trimmed.endsWith("}")) ||
    (firstLower.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return "data.json";
  }

  // YAML
  if (firstLower.match(/^[\w-]+:\s+\S/) || firstLower.includes("- name:") || firstLower.includes("version:")) {
    return "config.yaml";
  }

  // Shell Script
  if (firstLower.startsWith("#!/bin/bash") || firstLower.startsWith("#!/bin/sh") || firstLower.startsWith("#!/usr/bin/env bash")) {
    return "script.sh";
  }

  // SQL
  if (firstLower.includes("select ") && firstLower.includes("from ") || firstLower.includes("create table") || firstLower.includes("insert into")) {
    return "query.sql";
  }

  // Prisma schema
  if (firstLower.includes("datasource db") || firstLower.includes("generator client") || firstLower.includes("model ") && firstLower.includes("@@")) {
    return "schema.prisma";
  }

  // Markdown (checklist ou documentação)
  if (
    firstLower.startsWith("# ") ||
    firstLower.includes("\n## ") ||
    firstLower.includes("- [ ]") ||
    firstLower.includes("- [x]") ||
    firstLower.includes("**") && firstLower.includes("\n")
  ) {
    return firstLower.includes("- [ ]") ? "checklist.md" : "README.md";
  }

  return null;
}

/** Mínimo de caracteres para considerar conteúdo como arquivo (evita comandos soltos). */
const MIN_FILE_CONTENT_LENGTH = 60;
/** Uma única linha com menos que isso é tratada como snippet/comando. */
const MIN_SINGLE_LINE_LENGTH = 100;
/** Padrão: linha que parece comando de shell/terminal (não é código de arquivo). */
const SINGLE_LINE_COMMAND_REGEX = /^(npm |yarn |pnpm |cd |echo |git |python |node |\.\/|npx |curl |wget |mkdir |cp |mv |cat |ls |chmod |exit |clear |deno |bun )\s*/i;

/**
 * Retorna true se o conteúdo deve ser ignorado (comando solto, snippet de uma linha, etc.).
 * Esses blocos não são salvos como arquivos no projeto.
 */
export function isSnippetOrCommand(content: string): boolean {
  const trimmed = (content ?? "").trim();
  if (trimmed.length < MIN_FILE_CONTENT_LENGTH) return true;
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 1) {
    if (trimmed.length < MIN_SINGLE_LINE_LENGTH) return true;
    if (SINGLE_LINE_COMMAND_REGEX.test(trimmed)) return true;
  }
  return false;
}

/**
 * Extrai o nome do arquivo da primeira linha do bloco (convenção do projeto).
 * Ex.: "// filename: App.js", "# filename: utils.py", "<!-- filename: index.html -->"
 */
export function parseFilenameFromCodeBlock(content: string): string | null {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  const match = firstLine.match(FILENAME_COMMENT_REGEX);
  if (match) return match[1].trim();
  return null;
}

/**
 * Remove a primeira linha se for comentário de filename (para não gravar no arquivo).
 */
export function stripFilenameComment(content: string): string {
  const lines = content.split("\n");
  if (lines.length > 0 && FILENAME_COMMENT_REGEX.test(lines[0])) {
    return lines.slice(1).join("\n").trimStart();
  }
  return content;
}

/**
 * Se o texto não tiver blocos ``` mas começar com FILE: ou // FILE: na primeira linha,
 * trata como um único arquivo.
 */
export function parseSingleFileWithFilePrefix(text: string): ParsedCodeFile | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const firstLine = trimmed.split("\n")[0]?.trim() ?? "";
  const pathMatch = firstLine.match(FILENAME_COMMENT_REGEX);
  if (!pathMatch) return null;
  const name = pathMatch[1].trim();
  const content = stripFilenameComment(trimmed);
  return { name, content };
}

/**
 * Extrai múltiplos blocos de código de um texto Markdown com suporte a:
 * - Nome na info-string da fence: ```tsx:src/component.tsx
 * - Nome no comentário da primeira linha: // filename: App.ts
 * - Nome no CONTEXTO ANTES do bloco (padrão mais comum do Gemini em PT-BR)
 * - Inferência pelo conteúdo como último recurso
 *
 * IMPORTANTE: Não faz short-circuit no parseSingleFileWithFilePrefix para
 * garantir que respostas com múltiplos arquivos (FILE: A, FILE: B, FILE: C)
 * sejam todas detectadas.
 */
export function parseCodeBlocksFromMarkdown(text: string): ParsedCodeFile[] {
  const result: ParsedCodeFile[] = [];

  // Regex para encontrar blocos de código cercados por ``` com possível info-string
  // Tolerante a ``` sem newline anterior e a espaços extras
  const fenceRegex = /^```([\w.-]*)(?::([^\s\n]+))?\s*\n([\s\S]*?)\n?```/gm;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let fileIndex = 0;

  while ((match = fenceRegex.exec(text)) !== null) {
    const infoLang = match[1]?.trim() ?? "";
    const infoPath = match[2]?.trim(); // ex.: ```js:App.js
    let content = match[3]?.trim() ?? "";

    // Contexto de texto ANTES deste bloco (desde o fim do último bloco)
    const preBlockText = text.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;

    let name: string;
    const fromComment = parseFilenameFromCodeBlock(content);

    if (infoPath) {
      // Prioridade máxima: info-string explicita ```lang:path
      name = infoPath;
      content = stripFilenameComment(content);
    } else if (fromComment) {
      // Comentário de filename dentro do bloco (ex.: // filename: X)
      name = fromComment;
      content = stripFilenameComment(content);
    } else {
      // Tenta detectar o nome NO CONTEXTO ANTERIOR ao bloco (padrão Gemini PT-BR)
      const fromPreBlock = extractPathFromPreBlockContext(preBlockText);

      // Fallbacks dentro do conteúdo do bloco
      const fromContent = extractFilePathStrict(content) ?? inferFilenameFromContent(content);
      const ext = langToExt(infoLang);

      if (fromPreBlock) {
        name = fromPreBlock;
      } else if (fromContent) {
        const parts = fromContent.split(".");
        const fallbackExt = parts.length > 1 ? parts.pop()?.toLowerCase() : null;
        if (!fallbackExt && ext) {
          name = `${fromContent}.${ext}`;
        } else if (fallbackExt && ext && fallbackExt !== ext && (ext === "py" || ext === "js" || ext === "html" || ext === "css")) {
          name = fromContent.substring(0, fromContent.lastIndexOf(".")) + "." + ext;
        } else {
          name = fromContent;
        }
      } else {
        name = ext ? `file_${fileIndex}.${ext}` : `file_${fileIndex}`;
      }
      content = stripFilenameComment(content);
      fileIndex++;
    }

    result.push({ name, content });
  }

  // Fallback: se nenhum bloco de código foi encontrado, tenta parsear como arquivo único
  // com prefixo FILE: na primeira linha. Só usado quando NÃO há blocos de código.
  if (result.length === 0) {
    const single = parseSingleFileWithFilePrefix(text);
    if (single) return [single];
  }

  return result;
}

/**
 * Processa um array de blocos brutos (code + language) e atribui nome a cada um.
 * Sempre tenta extrair FILE: da primeira linha; nunca usa file_N.txt se houver FILE: no bloco.
 */
export function blocksToFiles(
  blocks: Array<{ code: string; language?: string }>
): ParsedCodeFile[] {
  return blocks.map((block, i) => {
    const nameFromComment = parseFilenameFromCodeBlock(block.code) ?? extractFilePathStrict(block.code) ?? inferFilenameFromContent(block.code);
    const lang = block.language ?? "";
    const ext = langToExt(lang);
    const name = nameFromComment ?? (ext ? `file_${i}.${ext}` : `file_${i}`);
    const content = nameFromComment ? stripFilenameComment(block.code) : block.code.trim();
    return { name, content };
  });
}

function langToExt(lang: string): string {
  if (!lang.trim()) return "";
  const map: Record<string, string> = {
    js: "js",
    javascript: "js",
    jsx: "jsx",
    ts: "ts",
    typescript: "ts",
    tsx: "tsx",
    py: "py",
    python: "py",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    md: "md",
    sh: "sh",
    bash: "sh",
    yaml: "yaml",
    yml: "yaml",
    sql: "sql",
  };
  return map[lang.toLowerCase()] ?? "";
}

/**
 * Fase 10: Parser de Markdown para extrair múltiplos blocos de código
 * e identificar nome de arquivo por convenção (comentário ou info string).
 */

export interface ParsedCodeFile {
  name: string;
  content: string;
}

/** Regex rigoroso: FILE: ou // FILE: seguido de caminho/nome.ext (evita fallback para file_0.txt). */
const FILENAME_COMMENT_REGEX = /^\s*(?:\/\/|#|<!--)?\s*(?:filename|FILE)\s*:\s*([^\s\n]+)(?:\s*-->)?/im;

/** Regex robusto: FILE: path em qualquer lugar do texto (apenas caracteres seguros para nome de arquivo). */
export const FILE_PATH_FULL_TEXT_REGEX = /FILE:\s*([a-zA-Z0-9._\-/]+)/gi;

/** Extrai path procurando FILE: em TODO o texto (primeira ocorrência). Evita arquivos .txt genéricos. */
export function extractFilePathFromFullText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(FILE_PATH_FULL_TEXT_REGEX);
  if (match && match[0]) {
    const first = match[0];
    const pathMatch = first.match(/FILE:\s*([a-zA-Z0-9._\-/]+)/i);
    if (pathMatch) return pathMatch[1].trim();
  }
  return null;
}

/** Regex robusto para primeira/segunda linha: FILE: path (apenas caracteres seguros para nome de arquivo). */
export const FILE_PATH_FIRST_LINES_REGEX = /FILE:\s*([a-zA-Z0-9._\-/]+)/i;

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

/** Procura FILE: em todo o texto primeiro; depois nas primeiras linhas (resposta completa do Gemini). */
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
    const match = line.match(/^(?:\/\/\s*)?FILE\s*:\s*(.+)$/i);
    if (match) return match[1].trim();
  }
  return null;
}

/**
 * Infere nome de arquivo com extensão correta a partir do conteúdo (evita file_0.txt).
 * HTML → index.html; JS/TS → script.js ou app.js; CSS → style.css; etc.
 */
export function inferFilenameFromContent(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const first = trimmed.slice(0, 400).toLowerCase();
  if (first.includes("<!doctype") || first.startsWith("<html") || first.startsWith("<!DOCTYPE")) return "index.html";
  // CSS: <style ou padrão { prop: valor } com unidades/propriedades típicas (px, em, rem, %, color:, margin:, etc.)
  const hasBracesAndColon = first.includes("{") && first.includes(":");
  const hasCssHint =
    first.includes("<style") ||
    first.includes("px") ||
    first.includes("em") ||
    first.includes("rem") ||
    /\d\s*%/.test(first) ||
    first.includes("color:") ||
    first.includes("margin:") ||
    first.includes("padding:") ||
    first.includes("font-size:") ||
    first.includes("width:") ||
    first.includes("height:") ||
    first.includes("background") ||
    first.includes("border:") ||
    first.includes("display:");
  const hasJsHint =
    first.includes("function ") || first.includes("=>") || first.includes("const ") || first.includes("export ");
  if (hasCssHint && (first.includes("<style") || (hasBracesAndColon && !hasJsHint))) return "style.css";
  if (first.includes("import react") || first.includes("from \"react\"") || first.includes("from 'react'")) return "App.jsx";
  if (first.includes("function ") || (first.includes("const ") && first.includes("=>")) || first.includes("export "))
    return "script.js";
  if (first.includes("def ") || (first.includes("import ") && !first.includes("react"))) return "script.py";
  if (first.startsWith("{") || first.startsWith("[")) return "data.json";
  if (first.startsWith("# ") || first.includes("## ") || first.includes("- [ ]") || first.includes("- [x]"))
    return "checklist.md";
  return null;
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
 * trata como um único arquivo (formato retornado pelo Gemini).
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
 * Extrai múltiplos blocos de código de um texto Markdown.
 * - Blocos cercados por ``` (info string opcional: lang ou lang:filename)
 * - Nome do arquivo: info string "lang:path" ou primeira linha do bloco (// filename: X)
 */
export function parseCodeBlocksFromMarkdown(text: string): ParsedCodeFile[] {
  const single = parseSingleFileWithFilePrefix(text);
  if (single) return [single];
  const result: ParsedCodeFile[] = [];
  // Regex: opening fence ``` optional info, then content until closing ```
  const fenceRegex = /^```(\w*)(?::([^\s\n]+))?\s*\n([\s\S]*?)\n```/gm;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = fenceRegex.exec(text)) !== null) {
    const infoLang = match[1]?.trim() ?? "";
    const infoPath = match[2]?.trim(); // ex.: ```js:App.js
    let content = match[3]?.trim() ?? "";
    let name: string;
    const fromComment = parseFilenameFromCodeBlock(content);
    if (infoPath) {
      name = infoPath;
      content = stripFilenameComment(content);
    } else if (fromComment) {
      name = fromComment;
      content = stripFilenameComment(content);
    } else {
      const fallback = extractFilePathStrict(content) ?? inferFilenameFromContent(content);
      const ext = langToExt(infoLang);
      name = fallback ?? (ext ? `file_${index}.${ext}` : `file_${index}`);
      content = stripFilenameComment(content);
      index++;
    }
    result.push({ name, content });
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
    json: "json",
    md: "md",
  };
  return map[lang.toLowerCase()] ?? "";
}

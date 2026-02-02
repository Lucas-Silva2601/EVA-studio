/**
 * Fase 10: Parser de Markdown para extrair múltiplos blocos de código
 * e identificar nome de arquivo por convenção (comentário ou info string).
 */

export interface ParsedCodeFile {
  name: string;
  content: string;
}

/** Regex para comentário de filename na primeira linha: // filename: path ou // FILE: path ou # filename: path ou <!-- filename: path --> */
const FILENAME_COMMENT_REGEX = /^\s*(?:\/\/|#|<!--)\s*(?:filename|FILE)\s*:\s*([^\s\n]+)(?:\s*-->)?/im;

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
 * Extrai múltiplos blocos de código de um texto Markdown.
 * - Blocos cercados por ``` (info string opcional: lang ou lang:filename)
 * - Nome do arquivo: info string "lang:path" ou primeira linha do bloco (// filename: X)
 */
export function parseCodeBlocksFromMarkdown(text: string): ParsedCodeFile[] {
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
      const ext = langToExt(infoLang);
      name = `file_${index}.${ext}`;
      index++;
    }
    result.push({ name, content });
  }
  return result;
}

/**
 * Processa um array de blocos brutos (code + language) e atribui nome a cada um.
 * Usado quando a extensão envia blocks sem filename; tenta extrair da primeira linha.
 */
export function blocksToFiles(
  blocks: Array<{ code: string; language?: string }>
): ParsedCodeFile[] {
  return blocks.map((block, i) => {
    const nameFromComment = parseFilenameFromCodeBlock(block.code);
    const name = nameFromComment ?? `file_${i}.${langToExt(block.language ?? "")}`;
    const content = nameFromComment ? stripFilenameComment(block.code) : block.code.trim();
    return { name, content };
  });
}

function langToExt(lang: string): string {
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
  return map[lang.toLowerCase()] ?? "txt";
}

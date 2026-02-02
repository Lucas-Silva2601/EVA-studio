/**
 * Project Context Packer (Fase 7.2).
 * Resume a árvore de arquivos e assinaturas de funções/API para o Agente Programador.
 */

import type { FileNode } from "@/types";
import { readFileContent } from "@/lib/fileSystem";

/** Extensões consideradas "código" para extração de assinaturas. */
const CODE_EXTENSIONS = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "css",
  "html",
]);

/** Extensões de arquivos de texto relevantes para contexto total do projeto (leitura completa). */
const RELEVANT_TEXT_EXTENSIONS = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "css",
  "html",
  "md",
]);

const MAX_FILES_TO_SCAN = 40;
const MAX_CONTEXT_CHARS = 14_000;

/**
 * Coleta todos os paths de arquivos da árvore (recursivo).
 */
export function getFilePathsFromTree(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  function walk(list: FileNode[]) {
    for (const node of list) {
      if (node.kind === "file") {
        paths.push(node.path);
      } else if (node.children?.length) {
        walk(node.children);
      }
    }
  }
  walk(nodes);
  return paths;
}

/**
 * Verifica se o path é de um arquivo de código (por extensão).
 */
export function isCodeFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CODE_EXTENSIONS.has(ext);
}

/**
 * Extrai assinaturas (funções, classes, exports) do conteúdo.
 * Heurística por regex; suporta JS/TS/JSX/TSX e Python.
 */
export function extractSignatures(content: string, filePath: string): string[] {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const sigs: string[] = [];

  if (["py"].includes(ext)) {
    // Python: def name(, class Name(
    const defRe = /^\s*def\s+(\w+)\s*\([^)]*\)/gm;
    const classRe = /^\s*class\s+(\w+)\s*(?:\([^)]*\))?\s*:/gm;
    let m: RegExpExecArray | null;
    while ((m = defRe.exec(content)) !== null) sigs.push(`def ${m[1]}(...)`);
    while ((m = classRe.exec(content)) !== null) sigs.push(`class ${m[1]}`);
    return Array.from(new Set(sigs));
  }

  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext)) {
    // function name( ou name(
    const funcRe = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
    const arrowRe = /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(/g;
    const classRe = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/g;
    const exportDefaultRe = /export\s+default\s+(?:function\s+)?(\w+)|export\s+default\s+(\w+)/g;
    const exportNamedRe = /export\s+\{\s*([^}]+)\s*\}/g;
    let m: RegExpExecArray | null;
    while ((m = funcRe.exec(content)) !== null) sigs.push(`function ${m[1]}(`);
    while ((m = arrowRe.exec(content)) !== null) sigs.push(`const ${m[1]} = (`);
    while ((m = classRe.exec(content)) !== null) sigs.push(`class ${m[1]}`);
    while ((m = exportDefaultRe.exec(content)) !== null)
      sigs.push(`export default ${m[1] || m[2]}`);
    while ((m = exportNamedRe.exec(content)) !== null)
      sigs.push(`export { ${m[1].trim()} }`);
    return Array.from(new Set(sigs));
  }

  if (ext === "css") {
    const ruleRe = /\.([\w-]+)\s*\{|#([\w-]+)\s*\{|@media\s+[^{]+\{/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(content)) !== null)
      sigs.push(m[1] ? `.${m[1]}` : m[2] ? `#${m[2]}` : "@media");
    return sigs.slice(0, 30);
  }

  return sigs;
}

export interface PackedContextOptions {
  /** Máximo de arquivos de código a escanear para assinaturas. */
  maxFiles?: number;
  /** Tamanho máximo total do texto de contexto (caracteres). */
  maxChars?: number;
}

/**
 * Gera o contexto compacto do projeto: árvore de arquivos + assinaturas dos arquivos de código.
 * Para ser incluído no Briefing Técnico enviado ao Agente Programador.
 */
export async function packProjectContext(
  rootHandle: FileSystemDirectoryHandle,
  fileTree: FileNode[],
  options: PackedContextOptions = {}
): Promise<string> {
  const maxFiles = options.maxFiles ?? MAX_FILES_TO_SCAN;
  const maxChars = options.maxChars ?? MAX_CONTEXT_CHARS;

  const allPaths = getFilePathsFromTree(fileTree);
  const codePaths = allPaths.filter(isCodeFile).slice(0, maxFiles);

  const lines: string[] = [];
  lines.push("=== Estrutura do projeto (árvore de arquivos) ===");
  lines.push(treeToIndentedText(fileTree, 0));
  lines.push("");
  lines.push("=== Assinaturas / API (arquivos de código) ===");

  let totalChars = lines.join("\n").length;
  for (const path of codePaths) {
    if (totalChars >= maxChars) break;
    try {
      const content = await readFileContent(rootHandle, path);
      const sigs = extractSignatures(content, path);
      if (sigs.length > 0) {
        const block = `Arquivo: ${path}\n  ${sigs.join("\n  ")}`;
        if (totalChars + block.length + 2 > maxChars) {
          lines.push(`Arquivo: ${path} (${sigs.length} itens; truncado)`);
        } else {
          lines.push(block);
          totalChars += block.length + 2;
        }
      }
    } catch {
      lines.push(`Arquivo: ${path} (não foi possível ler)`);
    }
  }

  return lines.join("\n");
}

/**
 * Converte a árvore de nós em texto indentado (para exibição no contexto).
 */
export function treeToIndentedText(nodes: FileNode[], indent: number): string {
  const prefix = "  ".repeat(indent);
  const out: string[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      out.push(`${prefix}${node.name}`);
    } else {
      out.push(`${prefix}${node.name}/`);
      if (node.children?.length)
        out.push(treeToIndentedText(node.children, indent + 1));
    }
  }
  return out.join("\n");
}

/**
 * Verifica se o path é de um arquivo de texto relevante para contexto total (.js, .ts, .html, .css, .py, .md).
 */
export function isRelevantTextFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return RELEVANT_TEXT_EXTENSIONS.has(ext);
}

export interface GetProjectContextOptions {
  /** Máximo de arquivos a incluir (por ordem na árvore). */
  maxFiles?: number;
  /** Tamanho máximo total do texto de contexto (caracteres). */
  maxChars?: number;
}

const DEFAULT_PROJECT_CONTEXT_MAX_FILES = 50;
const DEFAULT_PROJECT_CONTEXT_MAX_CHARS = 80_000;

/**
 * Lê recursivamente todos os arquivos de texto relevantes do projeto (.js, .ts, .html, .css, .py, .md)
 * e retorna uma string com árvore de arquivos + conteúdo completo para envio ao Groq (contexto total).
 */
export async function getProjectContext(
  rootHandle: FileSystemDirectoryHandle,
  fileTree: FileNode[],
  options: GetProjectContextOptions = {}
): Promise<string> {
  const maxFiles = options.maxFiles ?? DEFAULT_PROJECT_CONTEXT_MAX_FILES;
  const maxChars = options.maxChars ?? DEFAULT_PROJECT_CONTEXT_MAX_CHARS;

  const allPaths = getFilePathsFromTree(fileTree);
  const relevantPaths = allPaths.filter(isRelevantTextFile).slice(0, maxFiles);

  const lines: string[] = [];
  lines.push("=== Estrutura do projeto (árvore de arquivos) ===");
  lines.push(treeToIndentedText(fileTree, 0));
  lines.push("");
  lines.push("=== Conteúdo dos arquivos (leitura completa) ===");

  let totalChars = lines.join("\n").length;
  for (const path of relevantPaths) {
    if (totalChars >= maxChars) break;
    try {
      const content = await readFileContent(rootHandle, path);
      const block = `--- ${path} ---\n${content}\n`;
      if (totalChars + block.length > maxChars) {
        const remaining = maxChars - totalChars - 50;
        lines.push(`--- ${path} ---\n${content.slice(0, Math.max(0, remaining))}\n...(truncado)`);
        totalChars = maxChars;
      } else {
        lines.push(block);
        totalChars += block.length;
      }
    } catch {
      lines.push(`--- ${path} ---\n(não foi possível ler)\n`);
    }
  }

  return lines.join("\n");
}

/**
 * Project Context Packer (Fase 7.2).
 * Resume a árvore de arquivos e assinaturas de funções/API para o Agente Programador.
 */

import type { FileNode } from "@/types";
import { readFileContent } from "@/lib/fileSystem";

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
  /** Paths a excluir (ex: ["checklist.md"] para não enviar o checklist inteiro ao Analista). */
  excludePaths?: string[];
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
  const excludeSet = new Set((options.excludePaths ?? []).map((p) => p.toLowerCase().replace(/\\/g, "/")));

  const allPaths = getFilePathsFromTree(fileTree);
  const relevantPaths = allPaths
    .filter((p) => !excludeSet.has(p.toLowerCase().replace(/\\/g, "/")))
    .filter(isRelevantTextFile)
    .slice(0, maxFiles);

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

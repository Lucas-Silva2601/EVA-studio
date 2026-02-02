/**
 * Fase 8.1: Heurística para detectar tipo de projeto (Node vs Python).
 * Se package.json presente → Node (WebContainers); se *.py dominante → Pyodide.
 */

import type { FileNode } from "@/types";
import { getFilePathsFromTree } from "@/lib/contextPacker";

export type ProjectRuntimeType = "node" | "python" | "unknown";

/**
 * Detecta o tipo de runtime do projeto a partir da árvore de arquivos.
 * - package.json na raiz → node (WebContainers)
 * - Mais arquivos .py que .js/.ts/.jsx/.tsx → python (Pyodide)
 * - Caso contrário → unknown (tenta pelo arquivo atual)
 */
export function detectProjectType(fileTree: FileNode[]): ProjectRuntimeType {
  const paths = getFilePathsFromTree(fileTree);
  const hasPackageJson = paths.some((p) => p === "package.json" || p.endsWith("/package.json"));
  if (hasPackageJson) return "node";

  let pyCount = 0;
  let jsCount = 0;
  for (const p of paths) {
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "py") pyCount++;
    else if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext)) jsCount++;
  }
  if (pyCount > jsCount) return "python";
  return "unknown";
}

/**
 * Retorna o runtime sugerido para um arquivo pelo path (extensão).
 */
export function getRuntimeForFile(filePath: string): ProjectRuntimeType {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (["py"].includes(ext)) return "python";
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext)) return "node";
  return "unknown";
}

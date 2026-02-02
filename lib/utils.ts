/**
 * Utilitários gerais da IDE.
 */

/**
 * Retorna a extensão do arquivo para mapear linguagem do Monaco.
 */
export function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "html",
    htm: "html",
    css: "css",
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    json: "json",
    md: "markdown",
  };
  return map[ext] ?? "plaintext";
}

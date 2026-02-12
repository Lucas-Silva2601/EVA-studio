/**
 * Utilitários gerais da IDE.
 */

/**
 * Renomeia arquivo .txt para extensão correta quando o conteúdo é código (JS, HTML, CSS).
 * Regra: se o código vier com extensão .txt mas for código, renomear antes de propor ao usuário.
 */
export function fixTxtFilenameIfCode(
  filename: string,
  content: string
): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext !== "txt") return filename;
  const slice = content.trim().slice(0, 500);
  if (/<!DOCTYPE\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(slice))
    return filename.replace(/\.txt$/i, ".html");
  if (/\bfunction\s*\(|\bconst\s+\w+\s*=|=>\s*\{|import\s+.*from|export\s+(default|function|const)/.test(slice))
    return filename.replace(/\.txt$/i, ".js");
  if (/\{[^}]*:[^}]*\}|@import|@media|:\s*[\d.#\w]+\s*;/.test(slice))
    return filename.replace(/\.txt$/i, ".css");
  return filename;
}

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

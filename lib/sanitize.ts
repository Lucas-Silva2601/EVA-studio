/**
 * Sanitização de dados recebidos da extensão antes de escrever em disco.
 * Evita path traversal, caracteres perigosos e arquivos excessivamente grandes.
 */

const MAX_FILE_PATH_LENGTH = 512;
/** Máximo de caracteres ao salvar código recebido da extensão (1 MB). */
const MAX_CODE_LENGTH = 1024 * 1024;
export { MAX_CODE_LENGTH };
const UNSAFE_PATH_REGEX = /\.\.|\/\/|[<>:"|?*\x00-\x1f]/;

/**
 * Valida e sanitiza o caminho relativo do arquivo.
 * Rejeita: "..", "//", caracteres <>:"|?* e controles.
 * Retorna o path seguro ou null se inválido.
 */
export function sanitizeFilePath(path: string | undefined | null): string | null {
  if (path == null || typeof path !== "string") return null;
  const trimmed = path.trim().replace(/^\/+/, "");
  if (trimmed.length === 0 || trimmed.length > MAX_FILE_PATH_LENGTH) return null;
  if (UNSAFE_PATH_REGEX.test(trimmed)) return null;
  return trimmed || null;
}

/**
 * Limita o tamanho do conteúdo de código (evita DoS por arquivo gigante).
 * Retorna o conteúdo truncado ao máximo permitido.
 */
export function sanitizeCodeContent(content: string | undefined | null): string {
  if (content == null || typeof content !== "string") return "";
  if (content.length <= MAX_CODE_LENGTH) return content;
  return content.slice(0, MAX_CODE_LENGTH);
}

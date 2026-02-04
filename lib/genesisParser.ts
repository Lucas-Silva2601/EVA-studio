/**
 * Fase 14 (Modo Gênesis): Parser para extrair lista de arquivos planejados pela IA de uma resposta.
 * A IA pode retornar um bloco JSON com { "files": [ { "path": "...", "content": "..." } ] }.
 */

export interface GenesisFile {
  path: string;
  content: string;
}

const GENESIS_JSON_REGEX = /```(?:json)?\s*([\s\S]*?)```/gm;

/**
 * Extrai do conteúdo da mensagem um bloco JSON com { "files": [ { "path", "content" } ] }.
 * Retorna a lista de arquivos ou null se não encontrar.
 */
export function parseGenesisFromContent(content: string): GenesisFile[] | null {
  if (!content?.trim()) return null;
  let match: RegExpExecArray | null;
  while ((match = GENESIS_JSON_REGEX.exec(content)) !== null) {
    const block = match[1]?.trim() ?? "";
    try {
      const parsed = JSON.parse(block) as { files?: Array<{ path?: string; content?: string }> };
      if (Array.isArray(parsed.files) && parsed.files.length > 0) {
        const files: GenesisFile[] = parsed.files
          .filter((f) => f && typeof f.path === "string" && f.path.trim())
          .map((f) => ({
            path: (f.path ?? "").trim(),
            content: typeof f.content === "string" ? f.content : "",
          }));
        if (files.length > 0) return files;
      }
    } catch {
      continue;
    }
  }
  return null;
}

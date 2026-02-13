/**
 * Normalização do payload da extensão (EVA_CODE_RETURNED) para lista de arquivos.
 * Usado por lib/messaging ao processar resposta da extensão. Separação para manter messaging.ts < 250 linhas.
 */
import {
  blocksToFiles,
  parseCodeBlocksFromMarkdown,
  parseSingleFileWithFilePrefix,
  extractFilePathStrict,
  extractFilePathFromFullText,
  stripFilenameComment,
  inferFilenameFromContent,
  isSnippetOrCommand,
} from "@/lib/markdownCodeParser";

/** Nome sentinela quando FILE: não foi encontrado; a IDE deve perguntar ao Groq antes de salvar. */
export const FILENAME_ASK_GROQ = "__ASK_GROQ__";

/** Payload mínimo que normalizeToFiles aceita (alinhado a CodeResponsePayload em messaging.ts). */
export interface NormalizablePayload {
  code?: string;
  filename?: string;
  files?: Array<{ name: string; content: string }>;
  blocks?: Array<{ code: string; language?: string }>;
}

function extractFileNameFromResponse(rawCode: string): string | null {
  const path = extractFilePathFromFullText(rawCode) ?? extractFilePathStrict(rawCode);
  return path ?? null;
}

function isGenericFilename(name: string): boolean {
  return /^file_\d+\.txt$/i.test(name?.trim() ?? "");
}

function filterSnippetOrCommand(files: Array<{ name: string; content: string }>): Array<{ name: string; content: string }> {
  return files.filter((f) => !isSnippetOrCommand(f.content));
}

/**
 * Normaliza o payload da extensão para lista de arquivos.
 * Regra: FILE: em todo o texto ou em blocos markdown → usa esse nome; senão FILENAME_ASK_GROQ.
 * Fallback: quando extensão envia file_N.txt, infere nome pelo conteúdo.
 */
export function normalizeToFiles(p: NormalizablePayload): Array<{ name: string; content: string }> {
  if (p.files && p.files.length > 0) {
    const mapped = p.files.map((f) => {
      if (isGenericFilename(f.name)) {
        const inferred = inferFilenameFromContent(f.content);
        if (inferred) return { name: inferred, content: stripFilenameComment(f.content) };
      }
      return f;
    });
    return filterSnippetOrCommand(mapped);
  }
  if (p.blocks && p.blocks.length > 0) return filterSnippetOrCommand(blocksToFiles(p.blocks));
  const rawCode = (p.code ?? "").trim();
  if (!rawCode) return [];
  const singleWithPrefix = parseSingleFileWithFilePrefix(rawCode);
  if (singleWithPrefix) {
    if (isSnippetOrCommand(singleWithPrefix.content)) return [];
    return [singleWithPrefix];
  }
  const fromMarkdown = parseCodeBlocksFromMarkdown(rawCode);
  const filteredMarkdown = filterSnippetOrCommand(fromMarkdown);
  const fileFromText = extractFileNameFromResponse(rawCode);
  if (filteredMarkdown.length > 0) {
    if (fileFromText && filteredMarkdown.length === 1) {
      const content = stripFilenameComment(filteredMarkdown[0].content);
      return [{ name: fileFromText, content }];
    }
    const hasFilePrefix = /FILE\s*:/i.test(rawCode);
    if (hasFilePrefix && filteredMarkdown.length === 1) {
      const strictPath = extractFilePathStrict(rawCode);
      if (strictPath) {
        const content = stripFilenameComment(filteredMarkdown[0].content);
        return [{ name: strictPath, content }];
      }
    }
    return filteredMarkdown;
  }
  if (isSnippetOrCommand(rawCode)) return [];
  const strictPath = fileFromText ?? extractFilePathStrict(rawCode);
  const inferred = inferFilenameFromContent(rawCode);
  const name = strictPath ?? p.filename?.trim() ?? inferred ?? FILENAME_ASK_GROQ;
  const content = strictPath || inferred ? stripFilenameComment(rawCode) : rawCode;
  return [{ name, content }];
}

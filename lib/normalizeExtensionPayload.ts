/**
 * Normalização do payload da extensão (EVA_CODE_RETURNED) para lista de arquivos.
 * Usado por lib/messaging ao processar resposta da extensão. Separação para manter messaging.ts < 250 linhas.
 */
import {
  blocksToFiles,
  parseCodeBlocksFromMarkdown,
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

/**
 * Retorna true se o nome é genérico gerado automaticamente (file_N ou file_N.ext).
 * Expandido para capturar qualquer extensão, não apenas .txt.
 */
function isGenericFilename(name: string): boolean {
  return /^file_\d+(\.\w{1,10})?$/i.test(name?.trim() ?? "");
}

function filterSnippetOrCommand(files: Array<{ name: string; content: string }>): Array<{ name: string; content: string }> {
  return files.filter((f) => !isSnippetOrCommand(f.content));
}

/**
 * Normaliza o payload da extensão para lista de arquivos.
 *
 * ORDEM DE PRIORIDADE (mais confiável primeiro):
 * 1. `p.files` com múltiplos arquivos (extensão já parseou)
 * 2. `p.blocks` (blocos brutos da extensão)
 * 3. `parseCodeBlocksFromMarkdown(p.code)` — detecta TODOS os blocos no texto bruto
 * 4. Fallback: nome inferido pelo conteúdo ou FILENAME_ASK_GROQ
 *
 * IMPORTANTE: parseSingleFileWithFilePrefix NÃO é mais chamado aqui como short-circuit,
 * pois ele retornava apenas 1 arquivo mesmo quando havia múltiplos blocos FILE:.
 * `parseCodeBlocksFromMarkdown` já inclui parseSingleFileWithFilePrefix internamente
 * como fallback quando nenhum bloco de código é encontrado.
 */
export function normalizeToFiles(p: NormalizablePayload): Array<{ name: string; content: string }> {
  if (p.files && p.files.length > 0) {
    const mapped = p.files.map((f) => {
      // 1. SEMPRE tenta encontrar um comentário de arquivo no conteúdo primeiro
      // O Gemini frequentemente envia "// Arquivo: src/main.js" dentro do bloco de código.
      const fromComment = extractFilePathStrict(f.content);
      if (fromComment) {
        return { name: fromComment, content: stripFilenameComment(f.content) };
      }

      // 2. Se o nome é genérico (file_N.txt, file_N.py, file_N.ts, etc.), tenta inferir pela sintaxe
      if (isGenericFilename(f.name)) {
        const inferred = inferFilenameFromContent(f.content);
        if (inferred) return { name: inferred, content: stripFilenameComment(f.content) };
        // Mantém o nome com extensão de linguagem se existir (ex: file_0.py é melhor que perder o arquivo)
      }
      return f;
    });
    return filterSnippetOrCommand(mapped);
  }

  if (p.blocks && p.blocks.length > 0) {
    // Converte blocos brutos para arquivos e tenta melhorar nomes genéricos (file_N.ext)
    const fromBlocks = blocksToFiles(p.blocks).map((f) => {
      // Se o nome é genérico, tenta inferir melhor pelo conteúdo
      if (isGenericFilename(f.name)) {
        const fromComment = extractFilePathStrict(f.content);
        if (fromComment) return { name: fromComment, content: stripFilenameComment(f.content) };
        const inferred = inferFilenameFromContent(f.content);
        if (inferred) return { name: inferred, content: f.content };
      }
      return f;
    });
    return filterSnippetOrCommand(fromBlocks);
  }

  const rawCode = (p.code ?? "").trim();
  if (!rawCode) return [];

  // Usa o parser robusto que detecta TODOS os blocos de código (suporta múltiplos arquivos).
  // NÃO usa parseSingleFileWithFilePrefix como short-circuit — isso bloqueava detecção de
  // múltiplos arquivos quando o texto começava com "FILE: nome.ext".
  const fromMarkdown = parseCodeBlocksFromMarkdown(rawCode);
  const filteredMarkdown = filterSnippetOrCommand(fromMarkdown);

  if (filteredMarkdown.length > 0) {
    return filteredMarkdown;
  }

  // Fallback final: texto puro sem blocos de código
  if (isSnippetOrCommand(rawCode)) return [];
  const strictPath = extractFileNameFromResponse(rawCode);
  const inferred = inferFilenameFromContent(rawCode);
  const name = strictPath ?? p.filename?.trim() ?? inferred ?? FILENAME_ASK_GROQ;
  const content = strictPath || inferred ? stripFilenameComment(rawCode) : rawCode;
  return [{ name, content }];
}

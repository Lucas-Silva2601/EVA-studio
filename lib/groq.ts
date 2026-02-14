/**
 * Cliente do Agente Analista (Ollama) — chamadas à API via rota Next.js.
 * O Ollama roda localmente em http://localhost:11434.
 */

import type { ChecklistAnalysisResult, ValidationResult } from "@/types";

const API_NOT_FOUND_MSG =
  "Erro: Servidor de IA não encontrado. Verifique se a rota app/api/groq/route.ts existe e se o Next.js está rodando.";

async function groqFetch(action: string, payload: unknown): Promise<string> {
  const res = await fetch("/api/groq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });

  let data: { result?: string; error?: string } = {};
  try {
    data = (await res.json()) as { result?: string; error?: string };
  } catch {
    // Resposta não-JSON (ex.: 404 HTML)
  }

  if (!res.ok) {
    const message =
      res.status === 404
        ? API_NOT_FOUND_MSG
        : res.status === 503
          ? (data.error ?? "Ollama não está rodando. Inicie com: ollama serve")
          : res.status === 500
            ? (data.error ?? API_NOT_FOUND_MSG)
            : data.error ?? `Erro ${res.status}`;
    throw new Error(message);
  }

  return data.result ?? "";
}

/** Resposta do chat com flag de truncagem. */
export interface ChatResponse {
  content: string;
  isTruncated: boolean;
}

export type ChatProvider = "ollama";

async function groqFetchChat(payload: unknown, signal?: AbortSignal): Promise<ChatResponse> {
  const res = await fetch("/api/groq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "chat", payload }),
    signal,
  });

  let data: { result?: string; is_truncated?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as {
      result?: string;
      is_truncated?: boolean;
      error?: string;
    };
  } catch {
    // 404/500 podem não retornar JSON
  }

  if (!res.ok) {
    const message =
      res.status === 404
        ? API_NOT_FOUND_MSG
        : res.status === 503
          ? (data.error ?? "Ollama não está rodando. Inicie com: ollama serve")
          : res.status === 500
            ? (data.error ?? API_NOT_FOUND_MSG)
            : data.error ?? `Erro ${res.status}`;
    throw new Error(message);
  }

  return {
    content: data.result ?? "",
    isTruncated: Boolean(data.is_truncated),
  };
}

/** Remove backticks, marcação JSON e extrai objeto/array da resposta da IA. */
function cleanJsonResponse(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json|JSON)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const startObj = s.indexOf("{");
  const startArr = s.indexOf("[");
  const start = startArr >= 0 && (startObj < 0 || startArr < startObj) ? startArr : startObj >= 0 ? startObj : -1;
  if (start < 0) return s;
  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = "";
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s;
}

/**
 * Lê o checklist, envia ao Analista (Ollama) e retorna a próxima tarefa pendente (ou array de tarefas da fase).
 */
export async function analyzeChecklist(
  checklistContent: string,
  targetPhase?: number
): Promise<ChecklistAnalysisResult | ChecklistAnalysisResult[]> {
  try {
    const result = await groqFetch("analyze", { checklistContent, targetPhase });
    const cleaned = cleanJsonResponse(result);
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      return parsed.map((p: ChecklistAnalysisResult) => ({
        taskDescription: p?.taskDescription ?? "",
        taskLine: p?.taskLine,
        suggestedFile: p?.suggestedFile,
        suggestedTech: p?.suggestedTech,
      }));
    }

    const single = parsed as ChecklistAnalysisResult;
    return {
      taskDescription: single?.taskDescription ?? "",
      taskLine: single?.taskLine,
      suggestedFile: single?.suggestedFile,
      suggestedTech: single?.suggestedTech,
    };
  } catch (parseErr) {
    if (targetPhase != null) return [];
    return {
      taskDescription: "",
      taskLine: undefined,
      suggestedFile: undefined,
      suggestedTech: undefined,
    };
  }
}

/**
 * Valida se o arquivo atende à tarefa do checklist. Retorna approved e, se aprovado, a linha a marcar [x].
 */
export async function validateFileAndTask(payload: {
  taskDescription: string;
  fileContent: string;
  fileName?: string;
}): Promise<ValidationResult> {
  const result = await groqFetch("validate", payload);
  try {
    const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as ValidationResult;
    return {
      approved: Boolean(parsed?.approved),
      reason: parsed?.reason,
      taskLineToMark: parsed?.taskLineToMark,
      action: parsed?.approved ? "MARK_COMPLETE" : undefined,
      line: parsed?.line,
    };
  } catch {
    return { approved: false, reason: "Não foi possível validar a resposta." };
  }
}

/**
 * Fase 12 (Autocura): Analista analisa o erro e retorna texto e sugestão de correção. Não gera código.
 */
export async function reportErrorToAnalyst(payload: {
  taskDescription?: string | null;
  filePath: string;
  errorMessage: string;
  stack?: string | null;
  fileContent?: string | null;
  projectId?: string | null;
}): Promise<string> {
  const result = await groqFetch("report_error", payload);
  return result.trim();
}

/**
 * Chat com o Analista (Groq). A IA orquestra e pode gerar código via [EVA_ACTION].
 * projectId identifica o projeto nesta conversa (ex.: nome da pasta).
 */
export async function chatWithAnalyst(payload: {
  provider?: ChatProvider;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Identificador do projeto (ex.: nome da pasta) para o Analista identificar a conversa. */
  projectId: string;
  projectContext?: string | null;
  openFileContext?: { path: string; content: string } | null;
  checklistContext?: string | null;
  /** Imagens em Base64 (Ollama llava). */
  images?: Array<{ base64: string; mimeType: string }>;
  /** Sinal para cancelar a requisição (ex.: botão Interromper). */
  signal?: AbortSignal;
}): Promise<ChatResponse> {
  const response = await groqFetchChat(payload, payload.signal);
  return {
    content: response.content.trim(),
    isTruncated: response.isTruncated,
  };
}

/**
 * Fase 13: Gera código Mermaid (gráfico de estrutura/dependências) a partir da árvore de arquivos.
 */
export async function getProjectMermaid(treeText: string): Promise<string> {
  const result = await groqFetch("mermaid", { treeText });
  return result.trim();
}

/**
 * Fase 11: Traduz ordem do usuário em novas linhas de checklist (para append e disparar loop).
 */
export async function chatToChecklistTasks(payload: {
  userMessage: string;
  checklistContent?: string | null;
}): Promise<string> {
  const result = await groqFetch("chat_to_tasks", payload);
  return result.trim();
}

/**
 * Compara código original vs código do AI Studio. Retorna análise em linguagem natural das mudanças e melhorias.
 */
export async function compareCodeChanges(payload: {
  filePath: string;
  originalContent: string;
  newContent: string;
  taskDescription?: string | null;
}): Promise<string> {
  const result = await groqFetch("compare_code_changes", payload);
  return result.trim();
}

/**
 * Quando o código não contém FILE: na 1ª/2ª linha, pergunta ao Analista: "Qual o nome deste arquivo?"
 */
export async function suggestFilename(content: string): Promise<string> {
  const result = await groqFetch("suggest_filename", { content });
  return result.trim().replace(/^["']|["']$/g, "").split("\n")[0].trim() || "index.html";
}

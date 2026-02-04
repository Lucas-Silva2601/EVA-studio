/**
 * Cliente do Agente Analista (Groq) — chamadas à API via rota Next.js.
 * A API Key fica apenas no servidor (GROQ_API_KEY em .env.local).
 */

import type { ChecklistAnalysisResult, ValidationResult } from "@/types";

const API_GROQ_NOT_FOUND_MSG =
  "Erro: Servidor de IA não encontrado. Verifique se a pasta api/groq foi criada corretamente.";

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
    // 404/500 podem não retornar JSON
  }

  if (!res.ok) {
    const message =
      res.status === 404 || res.status === 500
        ? API_GROQ_NOT_FOUND_MSG
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

async function groqFetchChat(payload: unknown): Promise<ChatResponse> {
  const res = await fetch("/api/groq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "chat", payload }),
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
      res.status === 404 || res.status === 500
        ? API_GROQ_NOT_FOUND_MSG
        : data.error ?? `Erro ${res.status}`;
    throw new Error(message);
  }

  return {
    content: data.result ?? "",
    isTruncated: Boolean(data.is_truncated),
  };
}

/**
 * Lê o checklist (via Fase 2), envia ao Groq e retorna a próxima tarefa pendente.
 */
export async function analyzeChecklist(
  checklistContent: string
): Promise<ChecklistAnalysisResult> {
  const result = await groqFetch("analyze", { checklistContent });
  try {
    const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as ChecklistAnalysisResult;
    return {
      taskDescription: parsed.taskDescription ?? "",
      taskLine: parsed.taskLine,
      suggestedFile: parsed.suggestedFile,
      suggestedTech: parsed.suggestedTech,
    };
  } catch {
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
    };
  } catch {
    return { approved: false, reason: "Não foi possível validar a resposta." };
  }
}

/**
 * Fase 12 (Autocura): Analista analisa o erro e retorna texto + prompt sugerido para o Gemini. Não gera código.
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
 * Chat com o Analista (Groq). Groq não gera código; só analisa e supervisiona.
 * projectId identifica o projeto nesta conversa (ex.: nome da pasta).
 */
export async function chatWithAnalyst(payload: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Identificador do projeto (ex.: nome da pasta) para o Analista identificar a conversa. */
  projectId: string;
  projectContext?: string | null;
  openFileContext?: { path: string; content: string } | null;
  checklistContext?: string | null;
}): Promise<ChatResponse> {
  const response = await groqFetchChat(payload);
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
 * Orquestrador: gera o prompt para enviar ao Gemini (EVA Bridge). Fase X + tópico atual.
 */
export async function getPromptForGemini(payload: {
  phaseNumber: number;
  taskDescription: string;
  projectContext?: string | null;
}): Promise<string> {
  const result = await groqFetch("prompt_for_gemini", payload);
  return result.trim();
}

/**
 * Quando a resposta do Gemini não contém FILE: na 1ª/2ª linha, pergunta ao Analista: "Qual o nome deste arquivo?"
 */
export async function suggestFilename(content: string): Promise<string> {
  const result = await groqFetch("suggest_filename", { content });
  return result.trim().replace(/^["']|["']$/g, "").split("\n")[0].trim() || "index.html";
}

/**
 * Cliente do Agente Analista (Groq) — chamadas à API via rota Next.js.
 * A API Key fica apenas no servidor (GROQ_API_KEY em .env.local).
 */

import type { ChecklistAnalysisResult, ValidationResult } from "@/types";

async function groqFetch(action: string, payload: unknown): Promise<string> {
  const res = await fetch("/api/groq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });

  const data = (await res.json()) as { result?: string; error?: string };

  if (!res.ok) {
    throw new Error(data.error ?? `Erro ${res.status}`);
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

  const data = (await res.json()) as {
    result?: string;
    is_truncated?: boolean;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error ?? `Erro ${res.status}`);
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
 * Gera o prompt para o Google AI Studio executar a tarefa.
 * projectContext: resumo da árvore de arquivos e assinaturas (Project Context Packer).
 */
export async function generatePromptForAiStudio(payload: {
  taskDescription: string;
  suggestedFile?: string | null;
  suggestedTech?: string | null;
  projectContext?: string | null;
}): Promise<string> {
  const result = await groqFetch("generate_prompt", payload);
  return result.trim();
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
 * Fase 8.2: Envia erro de execução ao Analista e retorna sugestão de correção.
 */
export async function reportErrorToAnalyst(payload: {
  taskDescription?: string | null;
  filePath: string;
  errorMessage: string;
  stack?: string | null;
}): Promise<string> {
  const result = await groqFetch("report_error", payload);
  return result.trim();
}

/**
 * Chat com o Agente (Groq) — contexto total: árvore, conteúdo do projeto, arquivo aberto, checklist.
 * Retorna conteúdo + isTruncated (true se a resposta foi cortada por limite de tokens).
 */
export async function chatWithAnalyst(payload: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Conteúdo completo do projeto (árvore + arquivos .js, .ts, .html, .css, .py, .md) para a IA ler todo o projeto. */
  projectContext?: string | null;
  /** Arquivo aberto no editor no momento. */
  openFileContext?: { path: string; content: string } | null;
  /** Conteúdo do checklist.md (grounding). */
  checklistContext?: string | null;
}): Promise<ChatResponse> {
  const response = await groqFetchChat(payload);
  return {
    content: response.content.trim(),
    isTruncated: response.isTruncated,
  };
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

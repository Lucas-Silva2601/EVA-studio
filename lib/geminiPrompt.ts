/**
 * Construção e extração de prompts para o Gemini (extensão EVA Bridge).
 * O Groq orquestra; o prompt é enviado à extensão que injeta no site do Gemini.
 */

/**
 * Monta o prompt que será enviado ao Gemini para uma tarefa do checklist.
 * A extensão injeta esse texto na caixa do Gemini e dispara o envio.
 */
export function buildPromptForGemini(
  taskDescription: string,
  options?: {
    taskLine?: string;
    projectContext?: string;
    fileTreeSummary?: string;
  }
): string {
  const parts: string[] = [
    "Você é o Programador da IDE EVA Studio. Execute a seguinte tarefa do checklist.",
    "",
    "Tarefa:",
    taskDescription.trim(),
    "",
    "Regras:",
    "- Gere apenas o código necessário (HTML, CSS, JS, TS, React, etc.).",
    "- Para cada arquivo, use FILE: caminho/arquivo na primeira linha do bloco de código (ex.: FILE: src/App.jsx).",
    "- Se houver múltiplos arquivos, use um bloco de código por arquivo com FILE: no início.",
  ];

  if (options?.projectContext && options.projectContext.length > 0) {
    parts.push("", "Contexto do projeto (resumo):", options.projectContext.slice(0, 3000));
  }
  if (options?.fileTreeSummary && options.fileTreeSummary.length > 0) {
    parts.push("", "Estrutura relevante:", options.fileTreeSummary.slice(0, 1500));
  }

  parts.push("", "Retorne o código pronto para ser salvo no projeto.");
  return parts.join("\n");
}

/** Regex para detectar "Enviando tarefa '...' para o Gemini" na resposta do Groq. */
const ENVIANDO_TAREFA_REGEX = /Enviando\s+tarefa\s+['"]([^'"]+)['"]\s+para\s+o\s+Gemini/i;

/** Regex para extrair bloco "PROMPT PARA O GEMINI: [texto]" (autocura ou instrução). */
const PROMPT_PARA_GEMINI_REGEX = /PROMPT\s+PARA\s+O\s+GEMINI\s*:\s*\[?\s*([\s\S]*?)(?=\n\n|\n\[EVA_ACTION\]|$)/i;

/**
 * Extrai o prompt para enviar ao Gemini a partir da mensagem do assistente (Groq).
 * Retorna null se não houver prompt detectado.
 *
 * Cenários:
 * 1. Resposta contém "Enviando tarefa 'X' para o Gemini" e um bloco de código ou texto após isso.
 * 2. Resposta contém "PROMPT PARA O GEMINI: [texto]".
 */
export function extractPromptFromAssistantMessage(content: string): string | null {
  if (!content || typeof content !== "string") return null;
  const trimmed = content.trim();

  // Tentar PROMPT PARA O GEMINI: [texto]
  const geminiMatch = trimmed.match(PROMPT_PARA_GEMINI_REGEX);
  if (geminiMatch && geminiMatch[1]) {
    const prompt = geminiMatch[1].trim();
    if (prompt.length > 10) return prompt;
  }

  // Tentar após "Enviando tarefa ... para o Gemini" — pegar o restante da mensagem ou próximo bloco de código
  if (!ENVIANDO_TAREFA_REGEX.test(trimmed)) return null;

  // Pegar o texto após a frase "Enviando tarefa ... para o Gemini" até o fim ou até [EVA_ACTION]
  const afterEnviando = trimmed.split(ENVIANDO_TAREFA_REGEX);
  if (afterEnviando.length < 2) return null;
  const after = afterEnviando[afterEnviando.length - 1].trim();
  // Remover possível sufixo [EVA_ACTION]...
  const beforeEva = after.split(/\[EVA_ACTION\]/i)[0].trim();
  if (beforeEva.length < 15) return null;
  return beforeEva;
}

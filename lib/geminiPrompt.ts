/**
 * Construção e extração de prompts para o Gemini (extensão EVA Bridge).
 * O Groq orquestra; o prompt é enviado à extensão que injeta no site do Gemini.
 */

/** Palavras-chave que indicam pedido de criação de site/projeto/aplicação. */
const PROJECT_CREATION_KEYWORDS =
  /criar|fazer|desenvolver|construir|montar|site|página\s*web|aplicação|app|projeto|sistema|landing|portfólio|loja|blog/i;

/**
 * Detecta se a mensagem do usuário é um pedido para criar um site, app ou projeto
 * (ex.: "quero criar um site de receitas", "fazer uma landing page").
 */
export function isProjectCreationRequest(message: string): boolean {
  if (!message || typeof message !== "string") return false;
  const t = message.trim();
  if (t.length < 5) return false;
  return PROJECT_CREATION_KEYWORDS.test(t);
}

/**
 * Monta o prompt para o Gemini elaborar um checklist do projeto em fases,
 * onde cada fase é um arquivo .md dentro da pasta docs/ (docs/Fase1.md, docs/Fase2.md, ...).
 * Usado no primeiro comando de criação (ex.: "quero criar um site de receitas").
 */
export function buildProjectPlanPrompt(userRequest: string): string {
  return `Você é o Programador da IDE EVA Studio. O usuário solicitou a criação de um projeto.

Pedido do usuário:
${userRequest.trim()}

Sua tarefa é elaborar um CHECKLIST do projeto dividido em FASES. Cada fase deve ser um arquivo .md dentro da pasta **docs/**.

Regras obrigatórias (IMPORTANTE — a IDE só reconhece estes nomes):
1. Todos os arquivos .md devem ficar na pasta docs/ com o nome exato: **docs/fase-1.md**, **docs/fase-2.md**, **docs/fase-3.md**, etc. (minúsculo, hífen antes do número).
2. Em cada bloco de código, use FILE: na primeira linha com o caminho exato, por exemplo: FILE: docs/fase-1.md
3. O conteúdo de cada .md deve ser um checklist com:
   - Título da fase (ex.: # Fase 1 – Estrutura)
   - Objetivo da fase em 1-2 linhas
   - Tarefas SEMPRE DESMARCADAS: use - [ ] (espaço entre colchetes). NUNCA use [x] — todas as tarefas são pendentes.
   - Entregas ou arquivos esperados naquela fase
4. Organize as fases em ordem lógica (ex.: Fase 1 = estrutura/HTML, Fase 2 = estilos, Fase 3 = interatividade).
5. Retorne cada fase em um bloco de código separado, com FILE: docs/fase-N.md na primeira linha (N = 1, 2, 3...).

Exemplo:
FILE: docs/fase-1.md
# Fase 1 – Estrutura
Objetivo: definir a estrutura HTML do projeto.
- [ ] Criar index.html
- [ ] Definir seções principais

FILE: docs/fase-2.md
# Fase 2 – Estilos
...

Gere agora os arquivos .md do checklist em fases. Use exatamente os nomes docs/fase-1.md, docs/fase-2.md, etc. Todas as tarefas devem estar com - [ ] (não use [x]). Seja direto: apenas os arquivos, sem texto extra antes ou depois.`;
}

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

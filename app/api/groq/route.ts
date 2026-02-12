import { NextRequest, NextResponse } from "next/server";

/**
 * Rota de API para o Agente Analista (Groq).
 * API Key: GROQ_API_KEY em .env.local (apenas servidor).
 * Groq: llama-3.3-70b-versatile e meta-llama/llama-4-scout (visão).
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
/** Modelo com visão para análise de imagens (máx. 5 imagens, base64 até 4MB por request). */
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

/** Mensagem de erro quando a Groq retorna 429 (após todas as tentativas). */
const GROQ_RATE_LIMIT_MSG =
  "Limite de taxa da API Groq excedido. Tente novamente em instantes.";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GroqMessage = { role: "system" | "user" | "assistant"; content: string };
type GroqContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type GroqVisionMessage = { role: "system" | "user" | "assistant"; content: string | GroqContentPart[] };

interface CallGroqResult {
  content: string;
  finish_reason: string;
}

/** Chama a Groq e retorna conteúdo + finish_reason. Em 429, faz retry com backoff. */
async function callGroqWithMeta(messages: GroqMessage[]): Promise<CallGroqResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY não configurada. Defina em .env.local.");
  }

  const body = JSON.stringify({
    model: GROQ_MODEL,
    messages,
    max_tokens: 2048,
    temperature: 0.3,
  });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      };
      const choice = data.choices?.[0];
      const content = choice?.message?.content?.trim() ?? "";
      const finish_reason = choice?.finish_reason ?? "unknown";
      return { content, finish_reason };
    }

    const text = await res.text();
    if (res.status === 429) {
      lastError = new Error(GROQ_RATE_LIMIT_MSG);
      if (attempt < MAX_RETRIES) {
        const retryAfter = res.headers.get("Retry-After");
        const waitMs = retryAfter
          ? Math.min(Number(retryAfter) * 1000, 10000)
          : RETRY_DELAYS_MS[attempt];
        console.warn(
          `[api/groq] 429 rate limit (tentativa ${attempt + 1}/${MAX_RETRIES + 1}). Aguardando ${waitMs}ms...`
        );
        await delay(waitMs);
        continue;
      }
      throw lastError;
    }
    throw new Error(`Groq API: ${res.status} - ${text || res.statusText}`);
  }

  throw lastError ?? new Error(GROQ_RATE_LIMIT_MSG);
}

async function callGroq(messages: GroqMessage[]): Promise<string> {
  const { content } = await callGroqWithMeta(messages);
  return content;
}

/** Chama a Groq com modelo de visão; messages pode ter content como string ou array (text + image_url). */
async function callGroqVision(messages: GroqVisionMessage[]): Promise<CallGroqResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY não configurada. Defina em .env.local.");
  }

  const body = JSON.stringify({
    model: GROQ_VISION_MODEL,
    messages,
    max_tokens: 2048,
    temperature: 0.3,
  });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      };
      const choice = data.choices?.[0];
      const content = choice?.message?.content?.trim() ?? "";
      const finish_reason = choice?.finish_reason ?? "unknown";
      return { content, finish_reason };
    }

    const text = await res.text();
    if (res.status === 429) {
      lastError = new Error(GROQ_RATE_LIMIT_MSG);
      if (attempt < MAX_RETRIES) {
        const waitMs = RETRY_DELAYS_MS[attempt];
        await delay(waitMs);
        continue;
      }
      throw lastError;
    }
    throw new Error(`Groq Vision API: ${res.status} - ${text || res.statusText}`);
  }

  throw lastError ?? new Error(GROQ_RATE_LIMIT_MSG);
}

/** Verifica se o conteúdo termina com um bloco de código Markdown aberto (sem fechamento). */
function hasOpenCodeBlock(content: string): boolean {
  const trimmed = content.trimEnd();
  if (!trimmed) return false;
  const fences = trimmed.match(/```/g);
  return fences ? fences.length % 2 !== 0 : false;
}

/**
 * Analisa o checklist e retorna a próxima tarefa pendente (ou array de tarefas da fase, se targetPhase for informado).
 * Analista atua como Gerente de Estado.
 */
async function analyzeChecklist(
  checklistContent: string,
  targetPhase?: number
): Promise<string> {
  if (targetPhase != null) {
    const systemPrompt = `Você é o Gerente de Estado da IDE EVA Studio. Leia o checklist.md e retorne um ARRAY JSON com TODAS as tarefas PENDENTES ([ ]) da seção "## Fase ${targetPhase}" (e subtópicos). Ignore tarefas já concluídas ([x]). NUNCA repita tarefas que já têm [x].
Se o contexto indicar que uma tarefa acabou de ser concluída, você DEVE pular para a próxima. Se houver múltiplas tarefas pendentes na Fase ${targetPhase}, retorne a próxima da lista que NÃO contenha [x].

REGRAS OBRIGATÓRIAS:
- Retorne APENAS um JSON válido: um array de objetos. Sem markdown, sem texto antes ou depois.
- Cada objeto deve ter: "taskDescription" (texto após o [ ]), "taskLine" (linha EXATA do checklist para marcar [x]), "suggestedFile" (string ou null), "suggestedTech" (string ou null).
- Inclua APENAS linhas com "[ ]" dentro da seção ## Fase ${targetPhase}. Ignore fases anteriores e posteriores.
- Se não houver tarefas pendentes na fase ${targetPhase}, retorne: []`;

    const userPrompt = `Checklist (checklist.md). Retorne array JSON de TODAS as tarefas pendente ([ ]) na seção ## Fase ${targetPhase}:\n\n${checklistContent}`;

    return callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
  }

  const systemPrompt = `Você é o Gerente de Estado da IDE EVA Studio. Sua única função é ler o checklist.md e retornar a PRIMEIRA tarefa ainda pendente (primeira linha que contém "[ ]" na ordem do documento). Você NÃO deve repetir tarefas já concluídas ([x]). Nunca retorne uma tarefa que já tem [x] no contexto.
Se o contexto indicar que uma tarefa acabou de ser concluída, você DEVE pular para a próxima. Se houver múltiplas tarefas pendentes, retorne a próxima da lista que NÃO contenha [x].

REGRAS OBRIGATÓRIAS:
- Retorne APENAS um JSON válido, sem markdown, sem texto antes ou depois.
- O JSON deve ter exatamente estes campos (todos strings, exceto suggestedFile/suggestedTech que podem ser null):
  - "taskDescription": texto completo da linha da tarefa (ex.: "- [ ] Criar componente de Login")
  - "taskLine": a linha EXATA e completa do checklist para essa tarefa (cópia literal, para depois marcar [x]). Obrigatório para permitir atualização do arquivo.
  - "suggestedFile": sugestão de caminho de arquivo (ex.: "components/Login.tsx") ou null
  - "suggestedTech": tecnologia sugerida (ex.: "React", "Python") ou null
- Ignore todas as linhas que já têm "[x]". Retorne apenas a PRIMEIRA linha com "[ ]" que encontrar de cima para baixo. Nunca escolha a mesma tarefa se o contexto indicar que foi processada.
- Se não houver nenhuma tarefa pendente, retorne exatamente: {"taskDescription":"","taskLine":"","suggestedFile":null,"suggestedTech":null}`;

  const userPrompt = `Checklist atual (conteúdo do arquivo checklist.md). Retorne o JSON da PRIMEIRA tarefa pendente ([ ]) na ordem do documento:\n\n${checklistContent}`;

  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

/** Fase 12 (Autocura): Analista analisa o erro e retorna texto + sugestão de correção. Groq NÃO gera código. */
async function reportErrorToAnalyst(payload: {
  taskDescription?: string | null;
  filePath: string;
  errorMessage: string;
  stack?: string | null;
  fileContent?: string | null;
  projectId?: string | null;
}): Promise<string> {
  const { taskDescription, filePath, errorMessage, stack, fileContent, projectId } = payload;
  const proj = projectId?.trim() || "projeto atual";
  const systemPrompt = `Você é o Analista da IDE EVA Studio. O código do usuário falhou ao ser executado (projeto: ${proj}). Você NÃO gera código.

Sua função:
1) Analisar o erro e explicar brevemente a causa.
2) Sugerir em texto o que deve ser alterado (ex.: "Corrija a variável X na linha Y").
3) No final, inclua uma linha "SUGESTÃO DE CORREÇÃO:" seguida de um texto curto descrevendo o que alterar (ex.: "Corrija o arquivo ${filePath}: [resumo do erro e da correção].").

Regras:
- NÃO retorne blocos de código com // FILE:. Apenas análise em texto + a sugestão de correção.
- Se for erro de ambiente (ex.: módulo não instalado), explique como corrigir manualmente.`;

  let userPrompt = `Arquivo: ${filePath}\nErro: ${errorMessage}${stack ? `\nStack: ${stack.slice(0, 1500)}` : ""}${taskDescription ? `\nTarefa do checklist: ${taskDescription}` : ""}`;
  if (fileContent?.trim()) {
    userPrompt += `\n\n--- Código atual (trecho) ---\n${fileContent.slice(0, 6000)}`;
  }
  userPrompt += "\n\nRetorne: 1) análise do erro; 2) sugestão em texto; 3) linha PROMPT PARA O GEMINI: [texto].";

  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

/** Prompt do Analista (Groq). Apenas assistente: NÃO gera código; a EVA envia implementação para o Gemini. */
const CHAT_SYSTEM_PROMPT_TEMPLATE = (projectId: string) => `Você é o **assistente** da IDE EVA Studio. Você NÃO é quem implementa código.

PROJETO EM CONTEXTO: **${projectId}**. Todas as mensagens desta conversa referem-se a este projeto.

PAPEL: APENAS ASSISTENTE — NÃO GERE CÓDIGO
- Você **nunca** deve gerar código de implementação (HTML, CSS, JavaScript, React, etc.) com [EVA_ACTION] CREATE_FILE. Quem implementa é sempre o **Gemini (Programador)**. A **EVA** envia a tarefa ao Gemini quando o usuário usa **Executar Fase** ou **+Gemini**.
- Quando o usuário pedir site, app, página, componente ou qualquer implementação: (1) responda que a EVA vai enviar isso ao Gemini; (2) sugira que ele use a ação que **traduz a mensagem em tarefas e adiciona ao checklist** (assim o checklist.md fica com as tarefas); (3) em seguida use **Executar Fase** — a EVA manda a próxima tarefa do checklist para o Gemini, que gera o código. Você só orienta; a EVA manda para o Gemini.

O QUE VOCÊ PODE FAZER (assistente):
- Responder dúvidas, explicar o projeto, sugerir próximos passos, ajudar a organizar o checklist.
- Criar estrutura vazia ou arquivos de texto puro (apenas .md, .txt ou conteúdo não-programável): [EVA_ACTION] {"action":"CREATE_FILE","path":"...","content":"..."} e [EVA_ACTION] {"action":"CREATE_DIRECTORY","path":"..."}.
- Sugerir instalação de pacotes: [EVA_ACTION] {"action":"RUN_COMMAND","command":"npm install ..."} — a IDE mostra no Output para o usuário rodar no terminal.
- Pedir remoção ou movimentação (com aprovação do usuário): [EVA_ACTION] {"action":"DELETE_FILE","path":"..."} ou MOVE_FILE.

PROIBIDO:
- NUNCA use CREATE_FILE com conteúdo de programa (HTML, JS, TS, JSX, CSS, Python, etc.). Esse código deve ser gerado pelo Gemini via Executar Fase.
- NUNCA escreva blocos de código soltos no chat. Se precisar de código, diga ao usuário para usar Executar Fase para a EVA enviar ao Gemini.

Responda de forma clara e objetiva. Foco no projeto **${projectId}**.`;

/** Chat com o Engenheiro Chefe (Groq). Groq NÃO gera código: só orquestra. Suporta imagens via modelo de visão. */
async function chatWithAnalyst(payload: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  projectId: string;
  projectContext?: string | null;
  openFileContext?: { path: string; content: string } | null;
  checklistContext?: string | null;
  images?: Array<{ base64: string; mimeType: string }>;
}): Promise<{ content: string; is_truncated: boolean }> {
  const { messages, projectId, projectContext, openFileContext, checklistContext, images } = payload;

  const systemPrompt = CHAT_SYSTEM_PROMPT_TEMPLATE(projectId);

  const contextParts: string[] = [];
  if (projectContext?.trim()) {
    contextParts.push("--- Contexto do projeto (árvore + conteúdo dos arquivos) ---\n" + projectContext.slice(0, 70_000));
  }
  if (openFileContext?.path && openFileContext?.content != null) {
    contextParts.push(`--- Arquivo aberto no editor: ${openFileContext.path} ---\n${openFileContext.content.slice(0, 6000)}`);
  }
  if (checklistContext?.trim()) {
    contextParts.push("--- checklist.md ---\n" + checklistContext.slice(0, 8000));
  }
  const injectedContext = contextParts.length > 0
    ? "\n\n" + contextParts.join("\n\n")
    : "";

  const hasImages = images != null && images.length > 0;
  const lastMsg = messages[messages.length - 1];
  const isLastUser = lastMsg?.role === "user";

  if (hasImages && isLastUser && lastMsg) {
    const textWithContext = lastMsg.content + injectedContext;
    const contentParts: GroqContentPart[] = [{ type: "text", text: textWithContext || "Analise esta(s) imagem(ns)." }];
    for (const img of images.slice(0, 5)) {
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      });
    }
    const visionMessages: GroqVisionMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.slice(0, -1).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: contentParts },
    ];
    const { content, finish_reason } = await callGroqVision(visionMessages);
    const is_truncated = finish_reason === "length" || hasOpenCodeBlock(content);
    return { content, is_truncated };
  }

  const userMessages: GroqMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m, i) => {
      const content = m.content + (i === messages.length - 1 && m.role === "user" ? injectedContext : "");
      return { role: m.role as "user" | "assistant", content };
    }),
  ];

  const { content, finish_reason } = await callGroqWithMeta(userMessages);
  const is_truncated =
    finish_reason === "length" || hasOpenCodeBlock(content);
  return { content, is_truncated };
}

/** Fase 13: Gera código Mermaid (gráfico de dependências/estrutura) a partir da árvore de arquivos. */
async function generateMermaidFromTree(treeText: string): Promise<string> {
  const systemPrompt = `Você é um assistente que gera diagramas Mermaid.js. Dado uma estrutura de pastas e arquivos (texto indentado), retorne APENAS o código Mermaid válido, sem markdown e sem texto antes/depois.

Regras:
- Use graph LR (left-right) ou graph TD (top-down). Prefira TD para árvores de pastas.
- Pastas como nós retangulares; arquivos como nós com texto do nome.
- Conecte pastas às suas subpastas/arquivos com setas (-->).
- Exemplo mínimo: graph TD\\n  A[raiz] --> B[pasta1]\\n  A --> C[arquivo.js]
- Retorne somente o código Mermaid (sem \\\`\\\`\\\`).`;

  const userPrompt = `Gere um diagrama Mermaid que represente esta estrutura de projeto:\n\n${treeText.slice(0, 4000)}`;

  const result = await callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
  return result.trim();
}

/** Fase 11: Traduz ordem do usuário em novas linhas de checklist (para append no arquivo existente). */
async function chatToChecklistTasks(payload: {
  userMessage: string;
  checklistContent?: string | null;
}): Promise<string> {
  const { userMessage, checklistContent } = payload;
  const systemPrompt = `Você é o Agente Analista da IDE EVA Studio. O usuário já tem um arquivo checklist.md no projeto. Sua função é traduzir a ordem ou pedido dele em NOVAS linhas de tarefas que serão ESCRITAS diretamente no final desse arquivo.

Regras:
- NÃO crie um checklist novo. Retorne APENAS as linhas NOVAS a serem ADICIONADAS ao final do conteúdo existente.
- Formato de cada linha: "- [ ] Descrição da tarefa" (com espaço dentro dos colchetes).
- Inclua o caminho completo do arquivo quando fizer sentido (ex.: "- [ ] Criar src/components/Button.tsx com...").
- Não repita tarefas que já existem no conteúdo atual do checklist.
- Se o usuário não pedir algo que se traduza em tarefas, retorne uma linha: "- [ ] (Nenhuma tarefa gerada: resumo do pedido)" ou sugira uma tarefa coerente.`;

  let userPrompt = `Pedido do usuário:\n${userMessage}`;
  if (checklistContent?.trim()) {
    userPrompt += `\n\n--- Conteúdo atual do checklist.md (estado do arquivo; adicione apenas linhas novas ao final) ---\n${checklistContent.slice(0, 6000)}`;
  }
  userPrompt += "\n\nRetorne apenas as novas linhas de checklist a serem adicionadas ao final do arquivo (uma por linha).";

  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

/** Pergunta ao Analista: "Qual o nome deste arquivo?" quando o código não indica FILE: na 1ª/2ª linha. */
async function suggestFilename(payload: { content: string }): Promise<string> {
  const { content } = payload;
  const systemPrompt = `Você é o Analista da IDE EVA Studio. O código não indicou o nome do arquivo (não havia FILE: na primeira ou segunda linha). Sua única função é responder com o nome do arquivo que deve ser usado para salvar esse código.

Regras:
- Retorne APENAS o caminho/nome do arquivo, sem explicação e sem markdown. Ex.: index.html, src/App.jsx, style.css
- Use a extensão correta conforme o conteúdo: HTML → .html, JavaScript → .js, React → .jsx, CSS → .css, Python → .py, JSON → .json. Nunca use .txt nem nome genérico "file".`;

  const userPrompt = `Qual o nome deste arquivo? (trecho do código)\n\n${content.slice(0, 3000)}`;

  const result = await callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
  const name = result.trim().replace(/^["']|["']$/g, "").split("\n")[0].trim();
  return name || "index.html";
}

/** Valida se o arquivo criado/editado atende à tarefa do checklist. Retorno inclui action MARK_COMPLETE para a IDE marcar [x]. */
async function validateFileAndTask(payload: {
  taskDescription: string;
  fileContent: string;
  fileName?: string;
}): Promise<string> {
  const { taskDescription, fileContent, fileName } = payload;
  const systemPrompt = `Você é o Agente Analista da IDE EVA Studio. Sua função é validar se o conteúdo do arquivo atende à tarefa do checklist. Quando aprovado, a IDE marcará a tarefa como concluída no checklist.md.

Regras:
- Retorne APENAS um JSON válido, sem markdown e sem texto antes/depois.
- Campos obrigatórios:
  - "approved": boolean — true se o arquivo atende à tarefa, false caso contrário
  - "reason": string — motivo breve (ex.: "Componente implementado corretamente" ou "Faltou o botão de submit")
  - "taskLineToMark": string — a linha EXATA do checklist a marcar como [x] (cópia da taskDescription com [x] em vez de [ ]), ou null se não aprovado
- Quando approved for true, inclua também:
  - "action": "MARK_COMPLETE" — sinal para a IDE executar a marcação no checklist em tempo real`;

  const userPrompt = `Tarefa do checklist:\n${taskDescription}\n\nArquivo${fileName ? `: ${fileName}` : ""}\nConteúdo:\n${fileContent.slice(0, 8000)}\n\nRetorne o JSON de validação (com action: "MARK_COMPLETE" se aprovado).`;

  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.error("[api/groq] POST body parse error", parseErr);
      return NextResponse.json(
        { error: "Body da requisição inválido ou não-JSON." },
        { status: 400 }
      );
    }
    if (body == null || typeof body !== "object") {
      console.warn("[api/groq] POST body vazio ou malformado", { body });
      return NextResponse.json(
        { error: "Body deve ser um objeto JSON." },
        { status: 400 }
      );
    }
    const { action, payload } = body as { action: string; payload?: unknown };
    console.log("Recebendo Ação:", action, "Payload:", !!payload);

    if (!action) {
      return NextResponse.json(
        { error: "Campo 'action' é obrigatório." },
        { status: 400 }
      );
    }

    let result: string;
    let chatResponse: { content: string; is_truncated: boolean } | undefined;

    switch (action) {
      case "analyze": {
        const p = payload as { checklistContent?: string; targetPhase?: number };
        const checklistContent = p?.checklistContent ?? "";
        const targetPhase = p?.targetPhase;
        result = await analyzeChecklist(checklistContent, targetPhase);
        break;
      }
      case "validate": {
        const p = payload as {
          taskDescription?: string;
          fileContent?: string;
          fileName?: string;
        };
        result = await validateFileAndTask({
          taskDescription: p?.taskDescription ?? "",
          fileContent: p?.fileContent ?? "",
          fileName: p?.fileName,
        });
        break;
      }
      case "report_error": {
        const p = payload as {
          taskDescription?: string | null;
          filePath?: string;
          errorMessage?: string;
          stack?: string | null;
          fileContent?: string | null;
          projectId?: string | null;
        };
        result = await reportErrorToAnalyst({
          taskDescription: p?.taskDescription ?? null,
          filePath: p?.filePath ?? "",
          errorMessage: p?.errorMessage ?? "",
          stack: p?.stack ?? null,
          fileContent: p?.fileContent ?? null,
          projectId: p?.projectId ?? null,
        });
        break;
      }
      case "chat": {
        const p = payload as {
          provider?: "groq";
          messages?: Array<{ role: "user" | "assistant"; content: string }>;
          projectId?: string | null;
          projectContext?: string | null;
          openFileContext?: { path: string; content: string } | null;
          checklistContext?: string | null;
          images?: Array<{ base64: string; mimeType: string }>;
        };
        const chatPayload = {
          messages: p?.messages ?? [],
          projectId: p?.projectId?.trim() || "Projeto não aberto",
          projectContext: p?.projectContext ?? null,
          openFileContext: p?.openFileContext ?? null,
          checklistContext: p?.checklistContext ?? null,
          images: p?.images,
        };
        chatResponse = await chatWithAnalyst({
          ...chatPayload,
          images: p?.images,
        });
        result = chatResponse.content;
        break;
      }
      case "chat_to_tasks": {
        const p = payload as {
          userMessage?: string;
          checklistContent?: string | null;
        };
        result = await chatToChecklistTasks({
          userMessage: p?.userMessage ?? "",
          checklistContent: p?.checklistContent ?? null,
        });
        break;
      }
      case "mermaid": {
        const treeText = (payload as { treeText?: string })?.treeText ?? "";
        result = await generateMermaidFromTree(treeText);
        break;
      }
      case "suggest_filename": {
        const p = payload as { content?: string };
        result = await suggestFilename({ content: p?.content ?? "" });
        break;
      }
      default:
        return NextResponse.json(
          { error: `Ação desconhecida: ${action}` },
          { status: 400 }
        );
    }

    if (chatResponse != null) {
      return NextResponse.json({
        result: chatResponse.content,
        is_truncated: chatResponse.is_truncated,
      });
    }
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao chamar a IA";
    console.error("[api/groq]", message, err);
    let status = 500;
    if (message.includes("GROQ_API_KEY não configurada")) status = 503;
    else if (message.includes("Limite de taxa")) status = 429;
    return NextResponse.json(
      { error: message },
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}

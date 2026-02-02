import { NextRequest, NextResponse } from "next/server";

/**
 * Rota de API para o Agente Analista (Groq).
 * A API Key é usada apenas no servidor (GROQ_API_KEY), nunca exposta ao cliente.
 *
 * Modelo: llama-3.3-70b-versatile (substituto do descontinuado llama3-70b-8192).
 * Ver: https://console.groq.com/docs/deprecations
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

type GroqMessage = { role: "system" | "user" | "assistant"; content: string };

interface CallGroqResult {
  content: string;
  finish_reason: string;
}

/** Chama a Groq e retorna conteúdo + finish_reason (para detectar truncagem). */
async function callGroqWithMeta(messages: GroqMessage[]): Promise<CallGroqResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY não configurada. Defina em .env.local.");
  }

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 2048,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) {
      throw new Error("Limite de taxa da API Groq excedido. Tente novamente em instantes.");
    }
    throw new Error(`Groq API: ${res.status} - ${text || res.statusText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const choice = data.choices?.[0];
  const content = choice?.message?.content?.trim() ?? "";
  const finish_reason = choice?.finish_reason ?? "unknown";
  return { content, finish_reason };
}

async function callGroq(messages: GroqMessage[]): Promise<string> {
  const { content } = await callGroqWithMeta(messages);
  return content;
}

/** Verifica se o conteúdo termina com um bloco de código Markdown aberto (sem fechamento). */
function hasOpenCodeBlock(content: string): boolean {
  const trimmed = content.trimEnd();
  if (!trimmed) return false;
  const fences = trimmed.match(/```/g);
  return fences ? fences.length % 2 !== 0 : false;
}

/** Analisa o checklist e retorna a próxima tarefa pendente. */
async function analyzeChecklist(checklistContent: string): Promise<string> {
  const systemPrompt = `Você é o Agente Analista da IDE EVA Studio. Sua função é analisar o arquivo checklist.md e identificar a PRÓXIMA tarefa pendente (linha que contém "[ ]").

Regras:
- Retorne APENAS um JSON válido, sem markdown e sem texto antes/depois.
- O JSON deve ter exatamente estes campos (todos strings):
  - "taskDescription": texto completo da tarefa (ex.: "- [ ] Criar componente de Login")
  - "taskLine": a linha exata do checklist para essa tarefa (para depois marcar [x])
  - "suggestedFile": sugestão de caminho de arquivo se fizer sentido (ex.: "components/Login.tsx") ou null
  - "suggestedTech": tecnologia sugerida (ex.: "React", "Python") ou null
- Se não houver tarefa pendente, retorne: {"taskDescription":"","taskLine":"","suggestedFile":null,"suggestedTech":null}`;

  const userPrompt = `Analise o checklist abaixo e retorne o JSON da próxima tarefa pendente:\n\n${checklistContent}`;

  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

/** Gera o prompt para o Google AI Studio (Agente Programador) executar a tarefa. */
async function generatePromptForAiStudio(payload: {
  taskDescription: string;
  suggestedFile?: string | null;
  suggestedTech?: string | null;
  projectContext?: string | null;
}): Promise<string> {
  const { taskDescription, suggestedFile, suggestedTech, projectContext } = payload;
  const systemPrompt = `Você é o Agente Analista da IDE EVA Studio. Sua função é gerar um ÚNICO prompt claro e completo para o Google AI Studio (Agente Programador) executar a tarefa.

Regras:
- Retorne APENAS o texto do prompt, pronto para ser colado no chat do AI Studio.
- O prompt deve ser autocontido: inclua tecnologia (${suggestedTech || "adequada"}), nome do arquivo sugerido (${suggestedFile || "se aplicável"}) e os requisitos da tarefa.
- Roteamento de arquivos: Sempre diga ao Programador em qual arquivo salvar. Use o caminho completo (ex.: "Crie o código para o arquivo server/db.ts", "Implemente em src/components/Button.tsx"). A IDE usa esse path para salvar no lugar certo.
- Se for fornecido um "Contexto do projeto" (estrutura de arquivos e assinaturas), inclua no início do seu prompt um resumo breve desse contexto para o Programador saber o que já existe no projeto (ex.: "Contexto do projeto: a pasta contém X, Y; o arquivo Z exporta as funções ...").
- Seja direto e específico. Exemplo: "Crie o arquivo src/components/Login.tsx com um componente React Login, campos email e senha e botão Entrar. Use TypeScript e Tailwind CSS."`;

  let userPrompt = `Gere o prompt para o AI Studio executar esta tarefa:\n${taskDescription}`;
  if (projectContext?.trim()) {
    userPrompt += `\n\n--- Contexto do projeto (use para enriquecer o briefing) ---\n${projectContext}`;
  }

  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

/** Fase 8.2: Envia erro de execução ao Analista e retorna sugestão de correção. */
async function reportErrorToAnalyst(payload: {
  taskDescription?: string | null;
  filePath: string;
  errorMessage: string;
  stack?: string | null;
}): Promise<string> {
  const { taskDescription, filePath, errorMessage, stack } = payload;
  const systemPrompt = `Você é o Agente Analista da IDE EVA Studio. O código do usuário falhou ao ser executado. Sua função é analisar o erro e retornar uma sugestão breve de correção (ou um prompt ajustado para o Programador).

Regras:
- Retorne APENAS o texto da sugestão ou do prompt de correção, direto e objetivo.
- Inclua: o que provavelmente causou o erro e como corrigir (ou o que pedir ao Programador para alterar).`;

  const userPrompt = `Arquivo: ${filePath}\nErro: ${errorMessage}${stack ? `\nStack: ${stack.slice(0, 1500)}` : ""}${taskDescription ? `\nTarefa do checklist: ${taskDescription}` : ""}\n\nRetorne a sugestão de correção.`;

  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

/** Chat com o Agente (Groq) — retorna conteúdo + is_truncated (resposta cortada por limite de tokens). */
async function chatWithAnalyst(payload: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  projectContext?: string | null;
  openFileContext?: { path: string; content: string } | null;
  checklistContext?: string | null;
}): Promise<{ content: string; is_truncated: boolean }> {
  const { messages, projectContext, openFileContext, checklistContext } = payload;

  const systemPrompt = `Você é o Engenheiro Chefe da EVA. Você tem acesso de leitura a todo o projeto (estrutura e conteúdo dos arquivos).

Para propor mudanças de código, SEMPRE use o formato abaixo no início de cada bloco de código:
- Na primeira linha do bloco: \`// FILE: caminho/do/arquivo\` (ex: // FILE: src/App.js, // FILE: components/Button.tsx)
- Em seguida o código completo da alteração.
Se precisar criar um novo arquivo, avise o usuário e use // FILE: com o caminho do novo arquivo.

Regras:
- Ao sugerir alterações, use blocos de código Markdown (três crases + lang + conteúdo + três crases) com a primeira linha sendo // FILE: path.
- Um bloco = um arquivo. Para múltiplos arquivos, use múltiplos blocos.
- Para arquivos grandes, NÃO reescreva o arquivo inteiro. Forneça apenas as partes alteradas ou as novas funções, indicando claramente onde elas devem ser inseridas (ex.: "Substitua a função X por:", "Adicione após a linha Y:"), para economizar tokens e evitar cortes no meio do código.
- Responda de forma clara e objetiva. O usuário pode clicar em "Implementar Mudanças" para aplicar sua sugestão.`;

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

/** Valida se o arquivo criado/editado atende à tarefa do checklist. */
async function validateFileAndTask(payload: {
  taskDescription: string;
  fileContent: string;
  fileName?: string;
}): Promise<string> {
  const { taskDescription, fileContent, fileName } = payload;
  const systemPrompt = `Você é o Agente Analista da IDE EVA Studio. Sua função é validar se o conteúdo do arquivo atende à tarefa do checklist.

Regras:
- Retorne APENAS um JSON válido, sem markdown e sem texto antes/depois.
- O JSON deve ter exatamente estes campos:
  - "approved": boolean — true se o arquivo atende à tarefa, false caso contrário
  - "reason": string — motivo breve (ex.: "Componente implementado corretamente" ou "Faltou o botão de submit")
  - "taskLineToMark": string — a linha EXATA do checklist que deve ser marcada como concluída [x] (igual à taskDescription mas com [x] em vez de [ ]), ou null se não aprovado`;

  const userPrompt = `Tarefa do checklist:\n${taskDescription}\n\nArquivo${fileName ? `: ${fileName}` : ""}\nConteúdo:\n${fileContent.slice(0, 8000)}\n\nRetorne o JSON de validação.`;

  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, payload } = body as { action: string; payload?: unknown };

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
        const checklistContent = (payload as { checklistContent?: string })?.checklistContent ?? "";
        result = await analyzeChecklist(checklistContent);
        break;
      }
      case "generate_prompt": {
        const p = payload as {
          taskDescription?: string;
          suggestedFile?: string | null;
          suggestedTech?: string | null;
          projectContext?: string | null;
        };
        result = await generatePromptForAiStudio({
          taskDescription: p?.taskDescription ?? "",
          suggestedFile: p?.suggestedFile ?? null,
          suggestedTech: p?.suggestedTech ?? null,
          projectContext: p?.projectContext ?? null,
        });
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
        };
        result = await reportErrorToAnalyst({
          taskDescription: p?.taskDescription ?? null,
          filePath: p?.filePath ?? "",
          errorMessage: p?.errorMessage ?? "",
          stack: p?.stack ?? null,
        });
        break;
      }
      case "chat": {
        const p = payload as {
          messages?: Array<{ role: "user" | "assistant"; content: string }>;
          projectContext?: string | null;
          openFileContext?: { path: string; content: string } | null;
          checklistContext?: string | null;
        };
        chatResponse = await chatWithAnalyst({
          messages: p?.messages ?? [],
          projectContext: p?.projectContext ?? null,
          openFileContext: p?.openFileContext ?? null,
          checklistContext: p?.checklistContext ?? null,
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
    const message = err instanceof Error ? err.message : "Erro ao chamar Groq";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

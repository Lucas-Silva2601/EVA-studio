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

/** Fase 12 (Autocura): Analista analisa o erro e retorna texto + prompt sugerido para o Gemini. Groq NÃO gera código. */
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
  const systemPrompt = `Você é o Analista da IDE EVA Studio. O código do usuário falhou ao ser executado (projeto: ${proj}). Você NÃO gera código: quem corrige é o Gemini.

Sua função:
1) Analisar o erro e explicar brevemente a causa.
2) Sugerir em texto o que deve ser alterado (ex.: "Corrija a variável X na linha Y").
3) No final, inclua uma linha "PROMPT PARA O GEMINI:" seguida de um texto curto que o usuário pode colar no Gemini para pedir a correção (ex.: "Corrija o arquivo ${filePath}: [resumo do erro e da correção]. Retorne o código com FILE: na primeira linha.").

Regras:
- NÃO retorne blocos de código com // FILE:. Apenas análise em texto + o prompt sugerido para o Gemini.
- Se for erro de ambiente (ex.: módulo não instalado), explique como corrigir manualmente e opcionalmente sugira um PROMPT PARA O GEMINI.`;

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

/** Chat com o Engenheiro Chefe (Groq). Groq NÃO gera código: só orquestra. Quem implementa é o Gemini. */
async function chatWithAnalyst(payload: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  projectId: string;
  projectContext?: string | null;
  openFileContext?: { path: string; content: string } | null;
  checklistContext?: string | null;
}): Promise<{ content: string; is_truncated: boolean }> {
  const { messages, projectId, projectContext, openFileContext, checklistContext } = payload;

  const systemPrompt = `Você é um orquestrador. Sua única meta é garantir que o Gemini faça o que está no checklist. Se você ler o checklist e ver que uma tarefa já tem um [x], você DEVE passar para a próxima. Nunca repita uma tarefa que já foi concluída no arquivo físico.

Você é o Engenheiro Chefe (Analista/Maestro) da IDE EVA Studio. Você NÃO gera código de implementação. Sua função é:

1) Ler o checklist.md (quando fornecido no contexto).
2) Identificar a tarefa [ ] atual (pule tarefas que já têm [x] no arquivo físico).
3) Gerar um Prompt Técnico para o Gemini (quem gera código é o Gemini, via extensão).
4) Analisar o código que o Gemini devolver para decidir se precisa de refinamento, exclusão de arquivos ou criação de novas pastas.

PROJETO EM CONTEXTO: **${projectId}**. Todas as mensagens desta conversa referem-se a este projeto.

REGRAS ESTRITAS:
- NUNCA escreva blocos de código no chat. NUNCA use \`\`\` com código ou // FILE:.
- Quando for enviar uma tarefa ao Gemini, diga APENAS algo como: "Enviando tarefa 'Criar Canvas' para o Gemini..." ou "Tarefa 'Configurar servidor' enviada ao Gemini. Aguarde o código."
- Para pedidos de implementação: responda só com confirmação de envio ao Gemini (ex.: "Enviando tarefa 'X' para o Gemini...") ou com análise/orientação; nunca com código.
- Se precisar que a IDE exclua ou mova um arquivo após o Gemini gerar código, use exatamente uma destas linhas na sua resposta (uma por ação):
  [EVA_ACTION] {"action":"DELETE_FILE","path":"caminho/do/arquivo"}
  [EVA_ACTION] {"action":"MOVE_FILE","from":"caminho/origem","to":"caminho/destino"}
- Fase: ao executar uma Fase, os tópicos são enviados um por um ao Gemini; a IDE armazena os códigos no phaseBuffer (memória temporária). O botão "Implementar Fase" só aparece quando o último tópico da fase foi concluído pelo Gemini; ao clicar, a IDE salva todos os arquivos nos caminhos corretos e marca [x] em todos os tópicos daquela fase no checklist.md.
- Responda de forma clara e objetiva. Foco no projeto **${projectId}**.`;

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

/** Orquestrador: gera o prompt para enviar ao Gemini (EVA Bridge). Fase X, subtópico; pede código e FILE: com extensão correta. */
async function buildPromptForGemini(payload: {
  phaseNumber: number;
  taskDescription: string;
  projectContext?: string | null;
}): Promise<string> {
  const { phaseNumber, taskDescription, projectContext } = payload;
  const systemPrompt = `Você é o Analista da EVA Studio. O Gemini (gemini.google.com) atua como Programador. Sua função é gerar o TEXTO DO PROMPT que será enviado ao Gemini para executar UMA tarefa do checklist (Fase ${phaseNumber}, subtópico).

Regras:
- Retorne APENAS o texto do prompt, pronto para ser colado na caixa do Gemini. Sem markdown, sem explicação antes/depois.
- O prompt DEVE incluir: "Fase ${phaseNumber}. Subtópico: [descrição exata do subtópico]. Gere o código e comece a resposta com FILE: caminho/nome.ext"
- O nome do arquivo determina a extensão: HTML → index.html ou .html; JavaScript → .js; React → .jsx; CSS → .css; Python → .py; JSON → .json. NUNCA use .txt nem nome genérico "file". Ex.: FILE: index.html para HTML, FILE: app.js para JS, FILE: style.css para CSS.
- Inclua a descrição da tarefa e, se houver contexto do projeto, um resumo breve. O Gemini DEVE retornar o código com a primeira linha sendo exatamente FILE: caminho/nome.ext (extensão correta).`;

  let userPrompt = `Gere o prompt para o Gemini executar esta tarefa da Fase ${phaseNumber}:\n${taskDescription}`;
  if (projectContext?.trim()) {
    userPrompt += `\n\n--- Contexto do projeto (resumo) ---\n${projectContext.slice(0, 4000)}`;
  }
  userPrompt += "\n\nRetorne apenas o texto do prompt para o Gemini.";

  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

/** Pergunta ao Analista: "Qual o nome deste arquivo?" quando a resposta do Gemini não contém FILE: na 1ª/2ª linha. */
async function suggestFilename(payload: { content: string }): Promise<string> {
  const { content } = payload;
  const systemPrompt = `Você é o Analista da IDE EVA Studio. A resposta do Gemini não indicou o nome do arquivo (não havia FILE: na primeira ou segunda linha). Sua única função é responder com o nome do arquivo que deve ser usado para salvar esse código.

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
          messages?: Array<{ role: "user" | "assistant"; content: string }>;
          projectId?: string | null;
          projectContext?: string | null;
          openFileContext?: { path: string; content: string } | null;
          checklistContext?: string | null;
        };
        chatResponse = await chatWithAnalyst({
          messages: p?.messages ?? [],
          projectId: p?.projectId?.trim() || "Projeto não aberto",
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
      case "mermaid": {
        const treeText = (payload as { treeText?: string })?.treeText ?? "";
        result = await generateMermaidFromTree(treeText);
        break;
      }
      case "prompt_for_gemini": {
        const p = payload as {
          phaseNumber?: number;
          taskDescription?: string;
          projectContext?: string | null;
        };
        result = await buildPromptForGemini({
          phaseNumber: p?.phaseNumber ?? 1,
          taskDescription: p?.taskDescription ?? "",
          projectContext: p?.projectContext ?? null,
        });
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
    const message = err instanceof Error ? err.message : "Erro ao chamar Groq";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

/**
 * Rota de API para o Agente Analista (Groq ou Gemini).
 * API Keys: GROQ_API_KEY e GEMINI_API_KEY em .env.local (apenas servidor).
 *
 * Groq: llama-3.3-70b-versatile (https://console.groq.com/docs/deprecations)
 * Gemini: gemini-2.5-flash (https://aistudio.google.com/apikey)
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

/** Mensagem de erro quando a Groq retorna 429 (após todas as tentativas). */
const GROQ_RATE_LIMIT_MSG =
  "Limite de taxa da API Groq excedido. Tente novamente em instantes.";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GroqMessage = { role: "system" | "user" | "assistant"; content: string };

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

/** Prompt compartilhado para o Engenheiro Chefe (Groq ou Gemini). Prioriza envio ao Gemini Programador. */
const CHAT_SYSTEM_PROMPT_TEMPLATE = (projectId: string) => `Você é um orquestrador. Sua única meta é garantir que o Gemini faça o que está no checklist. Se você ler o checklist e ver que uma tarefa já tem um [x], você DEVE passar para a próxima. Nunca repita uma tarefa que já foi concluída no arquivo físico.

Você é o Engenheiro Chefe (Analista/Maestro) da IDE EVA Studio. Você NÃO gera código de implementação. Sua função é:

1) Ler o checklist.md (quando fornecido no contexto).
2) Identificar a tarefa [ ] atual (pule tarefas que já têm [x] no arquivo físico).
3) Gerar um Prompt Técnico para o Gemini (quem gera código é o Gemini, via extensão).
4) Analisar o código que o Gemini devolver para decidir se precisa de refinamento, exclusão de arquivos ou criação de novas pastas.

PROJETO EM CONTEXTO: **${projectId}**. Todas as mensagens desta conversa referem-se a este projeto.

REGRAS ESTRITAS:
- PRIMEIRA AÇÃO: Se o usuário disser o que quer CRIAR (ex.: "quero um site do jogo da cobrinha", "criar um blog") e o checklist estiver vazio ou for só o template inicial (ex.: uma única tarefa "Exemplo de tarefa"), responda em uma linha EXATAMENTE: CRIAR_PLANO: [resumo do pedido em até 15 palavras]. Exemplo: "CRIAR_PLANO: site do jogo da cobrinha em fases". A IDE enviará ao Gemini a criação do plano na pasta docs/ (arquivos docs/fase-1.md, docs/fase-2.md, etc.). Não gere código nem checklist ainda.
- NUNCA escreva blocos de código no chat. NUNCA use \`\`\` com código ou // FILE:.
- PRIORIDADE OBRIGATÓRIA: Para tarefas do checklist e pedidos de implementação (ex: "fazer fase 1", "implementar X"), você DEVE dizer "Enviando tarefa 'X' para o Gemini..." — a IDE enviará ao Gemini (gemini.google.com) que gerará o código. NÃO use [EVA_ACTION] CREATE_FILE para implementar código.
- Quando for enviar uma tarefa ao Gemini, diga APENAS algo como: "Enviando tarefa 'Criar Canvas' para o Gemini..." ou "Tarefa 'Configurar servidor' enviada ao Gemini. Aguarde o código."
- Para pedidos de implementação: responda só com confirmação de envio ao Gemini (ex.: "Enviando tarefa 'X' para o Gemini...") ou com análise/orientação; nunca com código.
- Use [EVA_ACTION] CREATE_FILE ou CREATE_DIRECTORY APENAS para: criar pastas vazias, arquivos .gitignore vazios ou coisas triviais. Para código real (HTML, JS, etc.) SEMPRE envie ao Gemini dizendo "Enviando tarefa 'X' para o Gemini...".
- Você tem PODER TOTAL DE ESCRITA para pastas e arquivos triviais. Use estas linhas para a IDE executar na hora (sem popup):
  [EVA_ACTION] {"action":"CREATE_FILE","path":"caminho/arquivo.ext","content":"conteúdo opcional"}
  [EVA_ACTION] {"action":"CREATE_DIRECTORY","path":"caminho/pasta"}
  Caminhos profundos são aceitos (ex.: src/components/common/Button.tsx). Após criar, diga no chat: "Criei a pasta X" ou "Criei o arquivo Y".
- REMOÇÕES dependem de aprovação humana: quando quiser apagar um arquivo ou pasta, use uma destas linhas. A IDE abrirá um modal e só apagará após o usuário clicar em "Apagar". Informe no chat: "Solicitei permissão para apagar a pasta/arquivo Z".
  [EVA_ACTION] {"action":"DELETE_FILE","path":"caminho/do/arquivo"}
  [EVA_ACTION] {"action":"DELETE_FOLDER","path":"caminho/da/pasta"}
- Para mover arquivo (executado na hora):
  [EVA_ACTION] {"action":"MOVE_FILE","from":"caminho/origem","to":"caminho/destino"}
- Fase: ao executar uma Fase, a IDE envia subtópicos um por um ao Gemini e aguarda a confirmação de escrita no disco (validateFileAndTask approved + [x] no checklist) antes de avançar. A IDE mantém um phaseBuffer em memória; só avança para o próximo subtópico após o anterior ser validado e marcado [x]. NUNCA escolha a mesma tarefa se o contexto indicar que ela já foi processada (já tem [x] ou foi enviada).
- PROMPT PARA O GEMINI: Ao sugerir mudanças em um arquivo existente, o Gemini DEVE retornar o conteúdo COMPLETO do arquivo com as modificações aplicadas. Isso permite que o Diff Editor da IDE compare as versões corretamente (verde/vermelho) sem perder código anterior.
- Responda de forma clara e objetiva. Foco no projeto **${projectId}**.`;

/** Chat com o Engenheiro Chefe (Groq). Groq NÃO gera código: só orquestra. Quem implementa é o Gemini. */
async function chatWithAnalyst(payload: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  projectId: string;
  projectContext?: string | null;
  openFileContext?: { path: string; content: string } | null;
  checklistContext?: string | null;
}): Promise<{ content: string; is_truncated: boolean }> {
  const { messages, projectId, projectContext, openFileContext, checklistContext } = payload;

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

const GEMINI_MODEL = "gemini-2.5-flash";

/** Chat com o Engenheiro Chefe via Gemini API. Mesmo papel do Groq: orquestra, não gera código. Suporta imagens. */
async function chatWithGemini(payload: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  projectId: string;
  projectContext?: string | null;
  openFileContext?: { path: string; content: string } | null;
  checklistContext?: string | null;
  images?: Array<{ base64: string; mimeType: string }>;
}): Promise<{ content: string; is_truncated: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada. Defina em .env.local e obtenha em https://aistudio.google.com/apikey");
  }

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

  const contents: Array<{ role: "user" | "model"; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const textContent = m.content + (i === messages.length - 1 && m.role === "user" ? injectedContext : "");
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    if (textContent) parts.push({ text: textContent });
    if (i === messages.length - 1 && m.role === "user" && images?.length) {
      for (const img of images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      }
    }
    contents.push({
      role: m.role === "user" ? "user" : "model",
      parts: parts.length ? parts : [{ text: "" }],
    });
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 2048,
      temperature: 0.3,
    },
  });

  const text = response.text ?? "";
  const is_truncated = hasOpenCodeBlock(text);
  return { content: text, is_truncated };
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

/** Orquestrador: gera o prompt para enviar ao Gemini (EVA Bridge). Inclui contexto do projeto quando disponível. */
async function buildPromptForGemini(payload: {
  phaseNumber: number;
  taskDescription: string;
  taskDescriptions?: string[];
  projectContext?: string | null;
  projectDescription?: string | null;
}): Promise<string> {
  const { phaseNumber, taskDescription, taskDescriptions, projectContext, projectDescription } = payload;
  const phaseNum = Number(phaseNumber);
  if (isNaN(phaseNum) || phaseNum < 1) {
    throw new Error(`phaseNumber inválido no payload: ${phaseNumber}. Deve ser um número >= 1.`);
  }
  const rawTasks = Array.isArray(taskDescriptions) && taskDescriptions.length >= 1
    ? taskDescriptions
    : [taskDescription];
  const tasksArray = rawTasks.map((t) => {
    const s = String(t).trim();
    const beforeColon = s.split(/:/)[0].trim();
    const cleaned = (beforeColon || s).replace(/```[\s\S]*?```/g, "").replace(/```[\s\S]*/g, "").trim();
    return cleaned || s;
  });
  const tasksBlock = tasksArray.map((t) => `- ${t}`).join("\n");
  const contextProjeto = projectDescription?.trim() || "Projeto em desenvolvimento";

  const systemPrompt = `Você é o Analista da EVA Studio. Gere o TEXTO DO PROMPT que será enviado ao Gemini (quem gera o código).

PROIBIDO ABSOLUTAMENTE:
- Você NÃO deve gerar nenhum código HTML, CSS ou JS. Sua única função é listar as tarefas em texto plano.
- NUNCA use blocos de código (\`\`\`). NUNCA inclua <!DOCTYPE>, <html>, tags ou exemplos de código.
- Se você gerar código ou usar markdown de código, o sistema falhará.

REGRAS ESTRITAS:
- Receba a lista de tarefas. Monte um prompt em TEXTO PLANO (sem markdown) no formato: "Fase N. Tarefas a fazer: 1) Tarefa1, 2) Tarefa2, 3) Tarefa3. Gere o código."
- O prompt deve instruir o Gemini a gerar o código. Você apenas LISTA as tarefas.
- Retorne APENAS o texto do prompt. Sem \`\`\`, sem exemplos de código, sem tags HTML/CSS/JS.
- EXTENSÕES: JavaScript→.js, CSS→.css, HTML→.html. NUNCA .txt para código.`;

  const userPrompt = `Gere o prompt para o Gemini. Formato EXATAMENTE assim (plaintext, sem código):

Contexto do projeto: ${contextProjeto}
Fase Atual: ${phaseNum}

TAREFAS:
${tasksBlock}

Retorne APENAS o texto do prompt, algo como: "Fase ${phaseNum}. Tarefas a fazer: 1) [tarefa1], 2) [tarefa2], ... Gere o código completo para todos os itens. Use FILE: nome.ext para cada arquivo." SEM NENHUM código HTML, CSS ou JS.`;

  const groqPrompt = await callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const contextForGemini = projectContext?.trim()
    ? `\n\n--- CONTEXTO DO PROJETO (estrutura e conteúdo dos arquivos; use como referência) ---\n${projectContext.slice(0, 28000)}\n--- Fim do contexto ---`
    : "";
  const fileNamingRule =
    "\n\nOBRIGATÓRIO: Para CADA bloco de código que você gerar, a primeira linha do bloco deve ser exatamente: FILE: nome-do-arquivo.ext (ex.: FILE: index.html, FILE: style.css, FILE: script.js). Um bloco por arquivo. Sem essa linha o arquivo será salvo com nome genérico (file_0.js, file_1.js). Use nomes atrelados ao projeto (index.html, style.css, script.js, game.js, etc.), nunca \"file\". ";
  return groqPrompt.trim() + fileNamingRule + contextForGemini;
}

/**
 * Gera o prompt para o Gemini criar o plano em fases na pasta docs/ (primeira ação quando o usuário diz o que quer criar).
 * Retorna texto que será enviado ao Gemini; o Gemini deve gerar docs/fase-1.md, docs/fase-2.md, etc.
 */
async function buildCreatePlanPrompt(payload: { userRequest: string; projectDescription?: string | null }): Promise<string> {
  const { userRequest, projectDescription } = payload;
  const desc = (userRequest || projectDescription || "projeto").trim().slice(0, 500);
  const backtick = "`";
  const triple = backtick + backtick + backtick;
  return (
    `O usuário quer criar: ${desc}. ` +
    `Sua tarefa é criar um PLANO DE IMPLEMENTAÇÃO em fases. ` +
    `Gere um arquivo .md para CADA fase na pasta docs/. Use exatamente: docs/fase-1.md, docs/fase-2.md, docs/fase-3.md, etc. ` +
    `Cada arquivo: título da fase (ex.: "# Fase 1 – Estrutura base") e lista de tarefas no formato "- [ ] Descrição da tarefa". ` +
    `OBRIGATÓRIO: Formate cada arquivo como BLOCO DE CÓDIGO entre triple backticks (${triple}). A primeira linha de cada bloco deve ser: FILE: docs/fase-N.md ` +
    `Exemplo: ${triple} FILE: docs/fase-1.md | # Fase 1 | - [ ] Criar index.html ${triple} e depois ${triple} FILE: docs/fase-2.md | ... ${triple}. ` +
    `Sem blocos de código entre ${triple} a resposta NÃO será capturada pela ferramenta. Gere TODOS os arquivos de fases em blocos assim.`
  );
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
          provider?: "groq" | "gemini";
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
        if (p?.images?.length && p?.provider !== "gemini") {
          throw new Error("Imagens são suportadas apenas pelo Gemini. Use provider: 'gemini'.");
        }
        chatResponse = p?.provider === "gemini"
          ? await chatWithGemini(chatPayload)
          : await chatWithAnalyst(chatPayload);
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
          phaseNumber?: number | string;
          taskDescription?: string;
          taskDescriptions?: string[];
          projectContext?: string | null;
          projectDescription?: string | null;
        };
        const phaseNum = Number(p?.phaseNumber);
        const phase = Number.isFinite(phaseNum) && phaseNum >= 1 ? phaseNum : 1;
        result = await buildPromptForGemini({
          phaseNumber: phase,
          taskDescription: p?.taskDescription ?? "",
          taskDescriptions: p?.taskDescriptions,
          projectContext: p?.projectContext ?? null,
          projectDescription: p?.projectDescription ?? null,
        });
        break;
      }
      case "suggest_filename": {
        const p = payload as { content?: string };
        result = await suggestFilename({ content: p?.content ?? "" });
        break;
      }
      case "create_plan": {
        const p = payload as { userRequest?: string; projectDescription?: string | null };
        result = await buildCreatePlanPrompt({
          userRequest: p?.userRequest ?? "",
          projectDescription: p?.projectDescription ?? null,
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
    const message = err instanceof Error ? err.message : "Erro ao chamar a IA";
    console.error("[api/groq]", message, err);
    let status = 500;
    if (message.includes("GROQ_API_KEY não configurada") || message.includes("GEMINI_API_KEY não configurada")) status = 503;
    else if (message.includes("Limite de taxa")) status = 429;
    return NextResponse.json(
      { error: message },
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}

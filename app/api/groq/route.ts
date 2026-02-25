import { NextResponse } from 'next/server';

// Garante que o servidor Next.js não fique cacheando ou travando
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY não configurada em .env.local' }, { status: 500 });
    }

    let messages = [];

    if (body.action === 'analyze') {
      messages = [
        {
          role: 'system', content: `Analise o checklist e determine a próxima tarefa pendente. Retorne SOMENTE um JSON válido com o seguinte formato:
{
  "taskLine": "- [ ] Descrição exata da tarefa como está no arquivo",
  "taskDescription": "Instrução clara sobre o que precisa ser feito",
  "suggestedFile": "caminho/do/arquivo.ts",
  "suggestedTech": "framework ou ferramenta"
}
Se for solicitado um targetPhase específico, retorne uma lista (array) em formato JSON de todas as tarefas pendentes daquela fase.` },
        { role: 'user', content: `Checklist:\n${body.payload?.checklistContent}\n\ntargetPhase: ${body.payload?.targetPhase || ''}` }
      ];
    } else if (body.action === 'validate') {
      messages = [
        {
          role: 'system', content: `Verifique se o código do arquivo atende e implementa os requisitos da tarefa solicitada. Retorne SOMENTE um JSON válido com:
{
  "approved": boolean (true ou false),
  "reason": "motivo detalhado da sua decisão",
  "taskLineToMark": "- [x] Linha exata que deve ser marcada como concluída"
}` },
        { role: 'user', content: `Tarefa Solicitada: ${body.payload?.taskDescription}\nNome do Arquivo Editado: ${body.payload?.fileName}\nConteudo do Arquivo:\n${body.payload?.fileContent}` }
      ];
    } else if (body.action === 'report_error') {
      messages = [
        { role: 'system', content: 'Você é um Analista de Sistemas especializado. Explique concisamente o erro de execução no código do projeto e sugira uma correção lógica.' },
        { role: 'user', content: `Ocorreu um Erro: ${body.payload?.errorMessage}\nArquivo: ${body.payload?.filePath}\nConteudo:\n${body.payload?.fileContent}\nTarefa Original:\n${body.payload?.taskDescription}` }
      ];
    } else if (body.action === 'chat_to_tasks') {
      messages = [
        { role: 'system', content: 'Transforme o pedido não-técnico ou vago do usuário em novas linhas acionáveis para um checklist/Roadmap de desenvolvimento. Formate APENAS como uma lista markdown de itens não marcados, ex:\n- [ ] Nova funcionalidade...' },
        { role: 'user', content: `Comando do usuário: ${body.payload?.userMessage}\n\nChecklist atual:\n${body.payload?.checklistContent || 'Vazio'}` }
      ];
    } else if (body.action === 'compare_code_changes') {
      messages = [
        { role: 'system', content: 'Explique brevemente para um desenvolvedor as modificações realizadas neste arquivo em relação ao código antigo. Seja sucinto.' },
        { role: 'user', content: `Caminho do Arquivo: ${body.payload?.filePath}\nCódigo Antigo:\n${body.payload?.originalContent}\nCódigo Novo:\n${body.payload?.newContent}\nTarefa Concluída:\n${body.payload?.taskDescription}` }
      ];
    } else if (body.action === 'suggest_filename') {
      messages = [
        { role: 'system', content: 'Identifique o nome e a extensão corretos para este código. Responda APENAS com o nome do arquivo, ex: app.js ou style.css. Nada de texto extra.' },
        { role: 'user', content: body.payload?.content || '' }
      ];
    } else if (body.action === 'chat') {
      // Chat normal (e.g. chatWithAnalyst) ou otimização Gemini
      const messagesFromClient = body.payload ? body.payload.messages : body.messages;
      const lastUserMessage = messagesFromClient[messagesFromClient.length - 1]?.content || "";
      const projectContext = body.payload?.projectContext || "";
      const checklistContext = body.payload?.checklistContext || "";
      const geminiOutput = body.payload?.geminiOutput || "";

      if (geminiOutput) {
        // Isso executa a "Otimização Executiva" para transformar saída suja do Gemini em blocos FILE: puros e processáveis pelo EVA Studio
        const promptOtimizacao = `PROJETO: EVA Studio (Otimização Executiva)
CONTEXTO ATUAL (ESTRUTURA/ARQUIVOS):
${projectContext}

CHECKLIST (PLANO):
${checklistContext}

USUÁRIO PEDIU: ${lastUserMessage}
CÓDIGO GERADO PELO GEMINI (USE PARA COMPARAR E GERAR PATCHES):
${geminiOutput}

REGRAS DE OURO (SISTEMA DE ARQUIVOS):
1. ATUAÇÃO ESTRITA: Você é um otimizador de código. Sua única função é formatar a intenção do Gemini em blocos de arquivos limpos para o frontend.
2. PRESERVAÇÃO DE CAMINHOS: Ao identificar que o Gemini quer criar ou editar um arquivo (ex: \`// Ficheiro: js/main.js\`, \`/* src/styles.css */\`, \`FILE: utils/api.ts\`), você DEVE copiar o caminho EXATAMENTE como está, INCLUINDO TODAS AS PASTAS. Nunca abrevie \`js/main.js\` para \`main.js\`.
3. TRANSCRIÇÃO DE CÓDIGO: Copie o bloco de código do Gemini INTEIRO. NUNCA use comentários como "// ...resto do código...". O código deve ser reescrito por completo.

COMPORTAMENTO DO ANALISTA:
- NÃO repita o código do Gemini solto no texto do chat (o usuário já viu).
- Se o Gemini sugerir comandos de terminal (npm install, etc), ignore-os desta vez, foque apenas nos arquivos.

FORMATO DE RESPOSTA OBRIGATÓRIO (Gere apenas os blocos necessários):

Para cada arquivo novo ou totalmente reescrito, você DEVE pular uma linha e usar EXATAMENTE este formato:
FILE: caminho/com/pastas/arquivo.ext
\`\`\`linguagem
todo o codigo aqui
\`\`\`

Colete as modificações do Gemini e aplique esta estrutura limpa para cada arquivo.`;

        console.log(`[EVA-BACKEND] Chamando Groq para estruturar os arquivos do Gemini...`);

        messages = [
          { role: 'system', content: 'Você é um assistente cirúrgico que extrai código bagunçado e o empacota na estrutura FILE:' },
          { role: 'user', content: promptOtimizacao }
        ];
      } else {
        // Se for um chat normal (ex: quando provider é 'groq' no chat do Studio)
        messages = messagesFromClient;
      }
    } else {
      return NextResponse.json({ error: 'Ação não reconhecida no payload' }, { status: 400 });
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        temperature: 0.1, // temperatura baixa para garantir precisão e respeito à formatação solicitada
      })
    });

    if (!groqRes.ok) {
      let errDesc = '';
      try {
        const errorResult = await groqRes.json();
        errDesc = errorResult.error?.message || JSON.stringify(errorResult);
      } catch {
        errDesc = await groqRes.text();
      }
      throw new Error(`Falha na API da Groq: HTTP ${groqRes.status} - ${errDesc}`);
    }

    const data = await groqRes.json();
    return NextResponse.json({
      result: data.choices[0].message.content,
      is_truncated: data.choices[0].finish_reason === "length" || false
    });

  } catch (error: any) {
    console.error("Erro no backend:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
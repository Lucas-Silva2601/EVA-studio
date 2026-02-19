import { NextResponse } from 'next/server';

// Configuração para estabilidade de rede local (Node.js puro)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Tratamento do Payload
    let rawMessages;
    if (body.action === 'chat' && body.payload) {
      rawMessages = body.payload.messages;
    } else {
      rawMessages = body.messages;
    }

    // Validação básica
    if (!rawMessages || !Array.isArray(rawMessages)) {
      console.error('[EVA-API] Payload inválido recebido:', body);
      return NextResponse.json(
        { error: 'Payload inválido: messages deve ser um array.' },
        { status: 400 }
      );
    }

    // 2. Definições de conexão (Forçando IP para evitar timeout no Windows)
    const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3.2';

    console.log(`[EVA-API] Conectando ao Ollama em: ${ollamaUrl} | Modelo: ${model}`);

    // 3. System Prompt (ORQUESTRADOR TÉCNICO)
    const systemInstruction = {
      role: 'system',
      content: `Você é o Orquestrador Técnico da IDE EVA.

Sua única função é converter qualquer solicitação do usuário em uma instrução técnica estruturada e executável para o AI Studio (Gemini).

Você nunca responde diretamente ao usuário.

Sua resposta deve sempre começar exatamente com:

PROMPT PARA O AI STUDIO, GEMINI:

Após isso, escreva apenas linguagem natural, sem comentários, sem explicações adicionais e sem texto fora da instrução.

Não use JSON, chaves, colchetes ou qualquer sintaxe técnica.

A instrução deve obrigatoriamente seguir exatamente esta estrutura, com os títulos explícitos abaixo:

Objetivo:
Descreva claramente o que deve ser feito.

Tecnologias:
Liste as tecnologias envolvidas. Se não houver informação suficiente, inferir tecnologias plausíveis com base no contexto.

Requisitos Funcionais:
Descreva detalhadamente o comportamento esperado e as regras da implementação.

Requisitos Visuais:
Descreva interface, estilo ou comportamento visual. Se não houver, escreva: Não aplicável.

Estrutura de Arquivos:
Defina os arquivos esperados com suas extensões CORRETAS (ex.: .html, .css, .js, .tsx). 
NUNCA use .txt para arquivos de código (HTML, CSS, JS, etc). Se for apenas uma mensagem de texto literário, use mensagem.txt.

Inclua todas as seções acima obrigatoriamente. Nunca omita nenhuma seção.

Use frases diretas, técnicas e objetivas. Evite redundância e expansão desnecessária.

Finalize sempre a instrução com:
"Retorne o resultado APENAS em blocos Markdown (​​​\`\`\`​​​), contendo FILE: caminho/do/arquivo.ext na primeira linha de cada bloco."

Nunca altere o formato. NUNCA SALVE OS ARQUIVOS DE CÓDIGO EM TXT. Se o caminho do arquivo incluir pastas (ex: css/style.css), forneça o caminho COMPLETO para que as pastas sejam criadas.`
    };

    // 4. LIMPEZA DE DADOS (CRÍTICO PARA EVITAR ERRO 400)
    const cleanMessages = rawMessages
      .filter((m: any) => m.role !== 'system')
      .map((m: any) => ({
        role: m.role,
        content: m.content
      }));

    // Junta nosso System Prompt novo com as mensagens limpas do usuário
    const finalMessages = [systemInstruction, ...cleanMessages];

    const payloadString = JSON.stringify({
      model: model,
      messages: finalMessages,
      stream: false,
      options: {
        temperature: 0.1,
        num_ctx: 4096
      }
    });

    console.log(`[EVA-API] Enviando para Ollama. Msgs: ${finalMessages.length}. Payload: ${payloadString.length} bytes`);

    // 5. Chamada ao Ollama com Timeout Manual
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutos de timeout

    try {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'keep-alive'
        },
        body: payloadString,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[EVA-API] Erro Ollama (${response.status}): ${errorText}`);
        throw new Error(`Ollama recusou o pedido: ${errorText}`);
      }

      const data = await response.json();

      if (!data.message || !data.message.content) {
        throw new Error("Ollama retornou um JSON vazio ou inválido.");
      }

      // 6. Retorno Compatível com Frontend
      return NextResponse.json({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: data.message.content,
            },
            finish_reason: 'stop',
          },
        ],
        result: data.message.content,
        is_truncated: false,
      });

    } catch (innerError: any) {
      clearTimeout(timeoutId);
      if (innerError.name === 'AbortError') {
        throw new Error("TIMEOUT OLLAMA: A IA demorou mais de 2 minutos para responder. Tente um pedido mais simples ou verifique seu hardware.");
      }
      throw innerError;
    }

  } catch (error: any) {
    console.error("[EVA-API] Erro Crítico:", error);

    const errorMessage = (error.cause && error.cause.code === 'ECONNREFUSED')
      ? "ERRO DE CONEXÃO: O Ollama não está rodando em 127.0.0.1:11434."
      : `Erro interno na IA: ${error.message}`;

    return NextResponse.json(
      { error: errorMessage },
      { status: 503 }
    );
  }
}